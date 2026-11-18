import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { workers } = vi.hoisted(() => ({ workers: [] }));

class MockWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
    this.messages = [];
    this.terminated = false;
    workers.push(this);
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message) {
    for (const listener of this.listeners.message) listener({ data: message });
  }
}

vi.mock('../site/editor/python.worker.js?worker', () => ({ default: MockWorker }));

const { createPythonRuntime } = await import('../site/editor/python-runtime.js');

describe('createPythonRuntime stdin contract', () => {
  beforeEach(() => workers.splice(0));
  afterEach(() => vi.restoreAllMocks());

  it('sends run input as a string with the runId', () => {
    const runtime = createPythonRuntime();
    const promise = runtime.run('name = input()\nprint(name)', { input: 'Ada\n' });
    const worker = workers[0];

    expect(worker.messages).toEqual([
      { type: 'run', runId: 1, source: 'name = input()\nprint(name)', input: 'Ada\n', mode: 'safe', name: 'main.py', files: [], packages: [] }
    ]);
    worker.emit({ type: 'started', runId: 1 });
    worker.emit({ type: 'complete', runId: 1 });
    return expect(promise).resolves.toBeUndefined();
  });

  it('forwards a project snapshot and defaults to safe mode without packages', async () => {
    const runtime = createPythonRuntime();
    const promise = runtime.run('import helper; print(helper.VALUE)', {
      files: [{ name: 'helper.py', content: 'VALUE = 7' }]
    });
    expect(workers[0].messages[0]).toMatchObject({
      type: 'run', mode: 'safe', packages: [],
      files: [{ name: 'helper.py', content: 'VALUE = 7' }]
    });
    workers[0].emit({ type: 'complete', runId: 1 });
    await expect(promise).resolves.toBeUndefined();
  });

  it('validates project file paths and package specifications before creating a worker', async () => {
    const runtime = createPythonRuntime();
    await expect(runtime.run('print(1)', { files: [{ name: '../escape.py', content: '' }] })).rejects.toThrow('Invalid Python project file name');
    await expect(runtime.run('print(1)', { mode: 'experimental', packages: ['name; import os'] })).rejects.toThrow('Invalid pip package specification');
    await expect(runtime.run('print(1)', { packages: ['requests'] })).rejects.toThrow('only in experimental mode');
    expect(workers).toHaveLength(0);
  });

  it('restarts the worker after an experimental run', async () => {
    const runtime = createPythonRuntime();
    const first = runtime.run('print(1)', { mode: 'experimental', packages: ['requests>=2.0'] });
    const oldWorker = workers[0];
    expect(oldWorker.messages[0]).toMatchObject({ mode: 'experimental', packages: ['requests>=2.0'] });
    oldWorker.emit({ type: 'complete', runId: 1 });
    await expect(first).resolves.toBeUndefined();
    expect(oldWorker.terminated).toBe(true);

    const second = runtime.run('print(2)');
    expect(workers).toHaveLength(2);
    expect(workers[1].messages[0].mode).toBe('safe');
    workers[1].emit({ type: 'complete', runId: 2 });
    await expect(second).resolves.toBeUndefined();
  });

  it('recreates an offline worker before an approved experimental network session', async () => {
    const runtime = createPythonRuntime();
    const safeRun = runtime.run('print(1)');
    const safeWorker = workers[0];
    safeWorker.emit({ type: 'complete', runId: 1 });
    await expect(safeRun).resolves.toBeUndefined();

    const experimentalRun = runtime.run('print(2)', { mode: 'experimental' });
    expect(safeWorker.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[1].emit({ type: 'complete', runId: 2 });
    await expect(experimentalRun).resolves.toBeUndefined();
  });

  it('queues input before a run and routes submitted input to the active run', async () => {
    const runtime = createPythonRuntime();
    expect(runtime.setInput('first\n')).toBe(6);
    expect(runtime.submitInput('second\n')).toBe(7);

    const promise = runtime.run('input()');
    const worker = workers[0];
    expect(worker.messages[0].input).toBe('first\nsecond\n');

    expect(runtime.setInput('replacement\n')).toBe(12);
    expect(runtime.submitInput('later\n')).toBe(6);
    expect(worker.messages.slice(1)).toEqual([
      { type: 'input', runId: 1, input: 'replacement\n', replace: true },
      { type: 'input', runId: 1, input: 'later\n', replace: false }
    ]);

    worker.emit({ type: 'complete', runId: 1 });
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects non-string or oversized input without creating a worker run', async () => {
    const runtime = createPythonRuntime();
    await expect(runtime.run('input()', { input: 42 })).rejects.toThrow('Python input');
    await expect(runtime.run('input()', { input: 'x'.repeat(100_001) })).rejects.toThrow('Python input');
    expect(workers).toHaveLength(0);
  });

  it('stops the worker and rejects the active run', async () => {
    const runtime = createPythonRuntime();
    const promise = runtime.run('while True: pass');
    const worker = workers[0];

    expect(runtime.stop()).toBe(true);
    expect(worker.messages.at(-1)).toEqual({ type: 'stop', runId: 1 });
    expect(worker.terminated).toBe(true);
    await expect(promise).rejects.toThrow('Python run stopped.');
  });
});

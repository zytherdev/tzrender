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
      { type: 'run', runId: 1, source: 'name = input()\nprint(name)', input: 'Ada\n' }
    ]);
    worker.emit({ type: 'started', runId: 1 });
    worker.emit({ type: 'complete', runId: 1 });
    return expect(promise).resolves.toBeUndefined();
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

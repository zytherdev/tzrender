import { beforeEach, describe, expect, it, vi } from 'vitest';

const { workers } = vi.hoisted(() => ({ workers: [] }));
class MockWorker {
  constructor() { this.listeners = { message: [], error: [] }; this.messages = []; this.terminated = false; workers.push(this); }
  addEventListener(type, listener) { this.listeners[type].push(listener); }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { for (const listener of this.listeners.message) listener({ data }); }
}
vi.mock('../site/editor/ruby.worker.js?worker', () => ({ default: MockWorker }));
const { createRubyRuntime, MAX_OUTPUT_CHARS } = await import('../site/editor/ruby-runtime.js');

describe('CRuby 3.4 wasm runtime adapter', () => {
  beforeEach(() => workers.splice(0));

  it('starts real Ruby in a separate worker and forwards project snapshot and status/output', async () => {
    const output = vi.fn();
    const status = vi.fn();
    const runtime = createRubyRuntime({ onOutput: output, onStatus: status });
    const promise = runtime.run('src/main.rb', 'require "helper"; puts ANSWER', {
      files: [{ name: 'src/helper.rb', content: 'ANSWER = 42' }], input: 'Ada\n'
    });
    const worker = workers[0];
    expect(worker.messages[0]).toEqual({
      type: 'run', runId: 1, name: 'src/main.rb', source: 'require "helper"; puts ANSWER',
      files: [{ name: 'src/helper.rb', content: 'ANSWER = 42' }], mode: 'safe', packages: [], input: 'Ada\n'
    });
    worker.emit({ type: 'started', runId: 1 });
    worker.emit({ type: 'output', runId: 1, stream: 'stdout', text: '42\n' });
    worker.emit({ type: 'complete', runId: 1 });
    await expect(promise).resolves.toBeUndefined();
    expect(output).toHaveBeenCalledWith('stdout', '42\n');
    expect(status).toHaveBeenLastCalledWith('ready', expect.any(String));
  });

  it('rejects unsafe paths, duplicate files, bad mode, and any package installation before worker creation', async () => {
    const runtime = createRubyRuntime();
    await expect(runtime.run('../outside.rb', 'puts 1')).rejects.toThrow('Invalid Ruby entry path');
    await expect(runtime.run('main.rb', '', { files: [{ name: 'lib/../evil.rb', content: '' }] })).rejects.toThrow('Invalid Ruby project path');
    await expect(runtime.run('main.rb', '', { files: [{ name: 'a.rb', content: '' }, { name: 'a.rb', content: '' }] })).rejects.toThrow('Duplicate Ruby project path');
    await expect(runtime.run('main.rb', '', { files: [{ name: 'lib', content: '' }, { name: 'lib/helper.rb', content: '' }] })).rejects.toThrow('conflicts with a file');
    await expect(runtime.run('main.rb', '', { input: 'x'.repeat(100_001) })).rejects.toThrow('Ruby input is limited');
    await expect(runtime.run('main.rb', '', { mode: 'unsafe' })).rejects.toThrow("Ruby mode must be 'safe' or 'experimental'");
    await expect(runtime.run('main.rb', '', { mode: 'experimental', packages: ['rake'] })).rejects.toThrow('package installation is unavailable');
    expect(workers).toHaveLength(0);
  });

  it('rejects overlarge sources and project snapshots', async () => {
    const runtime = createRubyRuntime();
    await expect(runtime.run('main.rb', 'x'.repeat(100_001))).rejects.toThrow('Ruby source');
    await expect(runtime.run('main.rb', '', { files: Array.from({ length: 101 }, (_, i) => ({ name: `f${i}.rb`, content: '' })) })).rejects.toThrow('limited to 100 files');
    expect(workers).toHaveLength(0);
    expect(MAX_OUTPUT_CHARS).toBe(100_000);
  });

  it('disposes worker after experimental runs but reuses safe-mode worker', async () => {
    const runtime = createRubyRuntime();
    const experimental = runtime.run('main.rb', '', { mode: 'experimental' });
    const first = workers[0];
    first.emit({ type: 'complete', runId: 1 });
    await experimental;
    expect(first.terminated).toBe(true);
    const safe = runtime.run('main.rb', 'puts 1');
    const second = workers[1];
    second.emit({ type: 'complete', runId: 2 });
    await safe;
    const safeAgain = runtime.run('main.rb', 'puts 2');
    expect(workers).toHaveLength(2);
    second.emit({ type: 'complete', runId: 3 });
    await safeAgain;
  });

  it('stop terminates the worker and rejects an active run', async () => {
    const runtime = createRubyRuntime();
    const promise = runtime.run('main.rb', 'loop {}');
    expect(runtime.stop()).toBe(true);
    expect(workers[0].terminated).toBe(true);
    await expect(promise).rejects.toThrow('Ruby run stopped.');
    expect(runtime.stop()).toBe(false);
  });

  it('does not run another program concurrently', async () => {
    const runtime = createRubyRuntime();
    const promise = runtime.run('main.rb', 'sleep 1');
    await expect(runtime.run('two.rb', '')).rejects.toThrow('Ruby is already running');
    workers[0].emit({ type: 'complete', runId: 1 });
    await promise;
  });
});

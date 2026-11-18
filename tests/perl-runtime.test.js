import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({ workers: [] }));
vi.mock('../site/editor/perl.worker.js?worker', () => ({ default: class FakeWorker {
  constructor() { this.listeners = {}; this.messages = []; this.terminated = false; harness.workers.push(this); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  postMessage(data) { this.messages.push(data); }
  terminate() { this.terminated = true; }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn({ data, message: data?.message, preventDefault() {} }); }
  reply(data, event = 'message') { this.emit(event, { runId: this.messages.at(-1)?.runId, ...data }); }
} }));
import { createPerlRuntime, MAX_OUTPUT_CHARS } from '../site/editor/perl-runtime.js';
const lastWorker = () => harness.workers.at(-1);
const makeRuntime = (callbacks = {}) => createPerlRuntime(callbacks);
const started = (runtime, name = 'main.pl', source = 'print 1;') => { const p = runtime.run(name, source); lastWorker().reply({ type: 'started' }); return p; };
beforeEach(() => { harness.workers.splice(0); vi.useRealTimers(); });
afterEach(() => vi.useRealTimers());
describe('Perl 5 ZeroPerl worker adapter protocol', () => {
  it('posts project snapshot and returns streamed output/result', async () => {
    const output = vi.fn(), runtime = makeRuntime({ onOutput: output });
    const files = [{ name: 'main.pl', content: 'old' }, { name: 'lib/Helper.pm', content: 'package Helper; 1;' }];
    const p = runtime.run('main.pl', 'print Helper::answer();', { files }); const w = lastWorker();
    expect(w.messages[0]).toMatchObject({ type: 'run', name: 'main.pl', mode: 'safe' });
    expect(w.messages[0].files).toEqual([{ name: 'main.pl', content: 'print Helper::answer();' }, files[1]]);
    w.reply({ type: 'started' }); w.reply({ type: 'output', stream: 'stdout', text: '42\n' }); w.reply({ type: 'complete', exitCode: 0 });
    await expect(p).resolves.toEqual({ stdout: '42\n', stderr: '', exitCode: 0 });
    expect(output).toHaveBeenCalledWith('stdout', '42\n'); expect(w.terminated).toBe(false);
  });
  it('reuses safe worker and sends a fresh complete snapshot between runs', async () => {
    const runtime = makeRuntime();
    const p1 = runtime.run('main.pl', 'our $x=5;', { files: [{ name: 'old.pm', content: '1;' }] }); const w = lastWorker();
    w.reply({ type: 'started' }); w.reply({ type: 'complete' }); await p1;
    const p2 = runtime.run('second.pl', 'print $x', { files: [{ name: 'second.pl', content: '' }] });
    expect(lastWorker()).toBe(w); expect(w.messages.at(-1).files).toEqual([{ name: 'second.pl', content: 'print $x' }]);
    w.reply({ type: 'started' }); w.reply({ type: 'complete' }); await p2; expect(w.terminated).toBe(false);
  });
  it('terminates experimental worker after each execution', async () => {
    const runtime = makeRuntime();
    const p = runtime.run('one.pl', '1;', { mode: 'experimental' }); const w1 = lastWorker();
    w1.reply({ type: 'started' }); w1.reply({ type: 'complete' }); await p; expect(w1.terminated).toBe(true);
    const p2 = runtime.run('two.pl', '2;', { mode: 'experimental' }); const w2 = lastWorker();
    expect(w2).not.toBe(w1); w2.reply({ type: 'started' }); w2.reply({ type: 'complete' }); await p2; expect(w2.terminated).toBe(true);
  });
  it('Stop terminates worker and rejects an in-flight synchronous loop', async () => {
    const runtime = makeRuntime(); const p = runtime.run('loop.pl', 'while (1) {}'); const w = lastWorker();
    w.reply({ type: 'started' }); expect(runtime.running).toBe(true); expect(runtime.stop()).toBe(true);
    await expect(p).rejects.toThrow(/stopped/i); expect(w.terminated).toBe(true); expect(runtime.running).toBe(false);
    expect(runtime.status).toBe('stopped'); expect(runtime.stop()).toBe(false);
  });
  it('times out initialization and execution and terminates each worker', async () => {
    vi.useFakeTimers(); const runtime = makeRuntime();
    const loading = runtime.run('main.pl', '1;'); const loadingCheck = expect(loading).rejects.toThrow(/initialization timed out/i); const w1 = lastWorker(); await vi.advanceTimersByTimeAsync(90_000);
    await loadingCheck; expect(w1.terminated).toBe(true);
    const running = runtime.run('loop.pl', 'while(1){}'); const runningCheck = expect(running).rejects.toThrow(/exceeded 15 seconds/i); const w2 = lastWorker(); w2.reply({ type: 'started' });
    await vi.advanceTimersByTimeAsync(15_000); await runningCheck; expect(w2.terminated).toBe(true);
  });
  it('bounds output and ignores malformed or stale messages', async () => {
    const output = vi.fn(), runtime = makeRuntime({ onOutput: output }); const p = started(runtime, 'big.pl', 'print'); const w = lastWorker();
    w.reply({ type: 'output', stream: 'bad', text: 'ignore' }); w.emit('message', { runId: -1, type: 'output', stream: 'stdout', text: 'stale' });
    w.reply({ type: 'output', stream: 'stdout', text: 'x'.repeat(MAX_OUTPUT_CHARS + 1) });
    await expect(p).rejects.toThrow(/output is limited/i); expect(output).toHaveBeenCalledTimes(1);
    expect(output.mock.calls[0][1]).toHaveLength(MAX_OUTPUT_CHARS); expect(w.terminated).toBe(true);
  });
  it('rejects invalid paths and unavailable CPAN requests before worker creation; forwards errors', async () => {
    const runtime = makeRuntime();
    await expect(runtime.run('../escape.pl', '1;')).rejects.toThrow(/Invalid Perl project path/);
    await expect(runtime.run('main.pl', '1;', { packages: ['JSON::PP'] })).rejects.toThrow(/CPAN packages were not installed/i);
    expect(harness.workers).toHaveLength(0);
    const p = runtime.run('bad.pl', 'die'); lastWorker().reply({ type: 'error', text: 'intentional Perl error' });
    await expect(p).rejects.toThrow('intentional Perl error');
  });
});

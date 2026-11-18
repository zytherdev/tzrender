import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createJavaRuntime } from '../site/editor/java-runtime.js';

describe('Java runtime adapter', () => {
  let engine;
  let createRuntime;
  let output;
  let statuses;

  beforeEach(() => {
    engine = {
      run: vi.fn(async () => ({ ok: true, stdout: 'answer\n', stderr: '', exitCode: 0 })),
      destroy: vi.fn()
    };
    createRuntime = vi.fn(async () => engine);
    globalThis.JavaWasm = { createRuntime };
    output = [];
    statuses = [];
  });

  afterEach(() => {
    delete globalThis.JavaWasm;
  });

  function makeRuntime() {
    return createJavaRuntime({
      onOutput: (stream, text) => output.push([stream, text]),
      onStatus: (state, detail) => statuses.push([state, detail])
    });
  }

  it('passes preloaded stdin and derives mainClass from a simple Java path', async () => {
    const runtime = makeRuntime();

    const result = await runtime.run('examples/Calculator.java', 'class Calculator {}', { input: '41\n' });

    expect(createRuntime).toHaveBeenCalledOnce();
    expect(engine.run).toHaveBeenCalledWith('class Calculator {}', {
      input: '41\n',
      mainClass: 'Calculator'
    });
    expect(result).toMatchObject({ stdout: 'answer\n', stderr: '', exitCode: 0 });
    expect(output).toEqual([['stdout', 'answer\n']]);
    expect(runtime.status).toBe('ready');
  });

  it('keeps the legacy two-argument call and sends empty stdin', async () => {
    const runtime = makeRuntime();

    await runtime.run('Main', 'class Main {}');

    expect(engine.run).toHaveBeenCalledWith('class Main {}', { input: '', mainClass: 'Main' });
  });

  it('accepts an explicit mainClass while still validating the source file name', async () => {
    const runtime = makeRuntime();

    await runtime.run('src/Launcher.java', 'class App {}', { mainClass: 'App', input: '' });

    expect(engine.run).toHaveBeenCalledWith('class App {}', { input: '', mainClass: 'App' });
  });

  it.each(['../Main.java', '/Main.java', 'src//Main.java', 'src/not-valid.java', ''])
    ('rejects invalid Java names: %s', async (name) => {
      const runtime = makeRuntime();

      await expect(runtime.run(name, 'class Main {}')).rejects.toThrow(/Java|class name/);
      expect(createRuntime).not.toHaveBeenCalled();
    });

  it('returns stderr and exitCode and rejects failed executions', async () => {
    engine.run.mockResolvedValueOnce({ ok: false, stdout: '', stderr: 'compile error', exitCode: 1 });
    const runtime = makeRuntime();

    await expect(runtime.run('Main.java', 'broken')).rejects.toThrow('compile error');

    expect(output).toEqual([['stderr', 'compile error']]);
    expect(runtime.status).toBe('error');
  });

  it('preserves stop and exposes destroy as an alias for engine cleanup', async () => {
    const runtime = makeRuntime();
    await runtime.run('Main.java', 'class Main {}');

    expect(runtime.stop()).toBe(true);
    expect(engine.destroy).toHaveBeenCalledOnce();
    expect(runtime.status).toBe('stopped');
    expect(runtime.destroy()).toBe(false);
  });
});

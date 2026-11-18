import { beforeEach, describe, expect, it, vi } from 'vitest';

const engines = [];
const factoryCreateEngine = vi.fn(async (options) => {
  const globals = new Map();
  const global = {
    set: vi.fn((name, value) => globals.set(name, value)),
    setTimeout: vi.fn(),
    close: vi.fn()
  };
  const engine = {
    global,
    doString: vi.fn(async (script) => {
      if (script.includes('FAIL_MOCK')) throw new Error('lua syntax error');
      const print = globals.get('print');
      const read = globals.get('__tz_input');
      if (script.includes('MOCK_PRINT')) print('hello', 42);
      if (script.includes('MOCK_READ')) print(read('*l'));
    })
  };
  engines.push({ engine, globals, options });
  return engine;
});

vi.mock('wasmoon', () => ({
  LuaFactory: vi.fn(function MockLuaFactory() {
    this.createEngine = factoryCreateEngine;
  })
}));
vi.mock('wasmoon/dist/glue.wasm?url', () => ({ default: '/assets/lua-runtime.wasm' }));

const { LuaFactory } = await import('wasmoon');
const { createLuaRuntime, MAX_OUTPUT_CHARS } = await import('../site/editor/lua-runtime.js');

describe('Lua 5.4 runtime adapter', () => {
  beforeEach(() => {
    engines.length = 0;
    factoryCreateEngine.mockClear();
    LuaFactory.mockClear();
  });

  it('creates a sandboxed Wasmoon engine and captures print output', async () => {
    const output = [];
    const runtime = createLuaRuntime({ onOutput: (stream, text) => output.push([stream, text]) });

    const result = await runtime.run('main.lua', 'MOCK_PRINT');

    expect(LuaFactory).toHaveBeenCalledWith('/assets/lua-runtime.wasm');
    expect(factoryCreateEngine).toHaveBeenCalledWith(expect.objectContaining({
      openStandardLibs: true,
      injectObjects: false,
      enableProxy: false
    }));
    expect(result).toEqual({ stdout: 'hello\t42\n', stderr: '', exitCode: 0 });
    expect(output).toEqual([['stdout', 'hello\t42'], ['stdout', '\n']]);
    expect(runtime.status).toBe('ready');
  });

  it('provides queued lines through the injected io.read adapter', async () => {
    const output = [];
    const runtime = createLuaRuntime({ onOutput: (stream, text) => output.push([stream, text]) });
    runtime.setInput('Ada\nGrace\n');

    await runtime.run('main.lua', 'MOCK_READ');

    const input = engines[0].globals.get('__tz_input');
    expect(input('*l')).toBe('Grace');
    expect(output[0]).toEqual(['stdout', 'Ada']);
  });

  it('reports Lua errors on stderr and returns to a usable error state', async () => {
    const output = [];
    const statuses = [];
    const runtime = createLuaRuntime({
      onOutput: (stream, text) => output.push([stream, text]),
      onStatus: (state, detail) => statuses.push([state, detail])
    });

    await expect(runtime.run('broken.lua', 'FAIL_MOCK')).rejects.toThrow('lua syntax error');
    expect(output).toEqual([['stderr', 'lua syntax error']]);
    expect(statuses.at(-1)[0]).toBe('error');
    expect(runtime.status).toBe('error');

    await runtime.run('again.lua', '');
    expect(factoryCreateEngine).toHaveBeenCalledOnce();
    expect(runtime.status).toBe('ready');
  });

  it('retries with a new factory after the WebAssembly runtime fails to load', async () => {
    factoryCreateEngine.mockRejectedValueOnce(new Error('Failed to fetch'));
    const runtime = createLuaRuntime();

    await expect(runtime.run('main.lua', '')).rejects.toThrow('Failed to fetch');
    expect(runtime.status).toBe('error');
    await expect(runtime.run('main.lua', '')).resolves.toMatchObject({ exitCode: 0 });
    expect(LuaFactory).toHaveBeenCalledTimes(2);
    expect(runtime.status).toBe('ready');
  });

  it('enforces source, input and output limits without invoking Wasmoon', async () => {
    const runtime = createLuaRuntime();
    await expect(runtime.run('main.lua', 'x'.repeat(100_001))).rejects.toThrow(/source/i);
    expect(factoryCreateEngine).not.toHaveBeenCalled();
    expect(() => runtime.setInput('x'.repeat(100_001))).toThrow(/input/i);
    expect(MAX_OUTPUT_CHARS).toBe(100_000);
  });

  it('preloads project snapshot files for safe require without a filesystem searcher', async () => {
    const runtime = createLuaRuntime();
    await runtime.run('main.lua', '', {
      files: [{ name: 'lib/math.lua', content: 'return { answer = 42 }' }]
    });
    const script = engines[0].engine.doString.mock.calls[0][0];
    expect(script).toContain("package.preload['lib.math']");
    expect(script).toContain("package.searchers = { package.searchers[1] }");
    expect(script).toContain('return { answer = 42 }');
  });

  it('rejects traversal in project snapshot file names', async () => {
    const runtime = createLuaRuntime();
    await expect(runtime.run('main.lua', '', {
      files: [{ name: '../escape.lua', content: 'return true' }]
    })).rejects.toThrow(/file name is invalid/i);
    expect(factoryCreateEngine).not.toHaveBeenCalled();
  });

  it('does not pretend to install experimental packages and closes its engine after experimental runs', async () => {
    const runtime = createLuaRuntime();
    await expect(runtime.run('main.lua', '', { mode: 'experimental', packages: ['socket'] }))
      .rejects.toThrow(/Wasmoon does not provide a package manager/i);
    expect(factoryCreateEngine).not.toHaveBeenCalled();

    await runtime.run('main.lua', '', { mode: 'experimental' });
    expect(engines[0].engine.global.close).toHaveBeenCalledOnce();
    await runtime.run('main.lua', '', { mode: 'experimental' });
    expect(factoryCreateEngine).toHaveBeenCalledTimes(2);
  });

  it('stops and disposes the engine safely', async () => {
    const runtime = createLuaRuntime();
    await runtime.run('main.lua', '');
    expect(runtime.stop()).toBe(true);
    expect(engines[0].engine.global.close).toHaveBeenCalledOnce();
    expect(runtime.status).toBe('stopped');
    expect(runtime.dispose()).toBe(false);
  });
});

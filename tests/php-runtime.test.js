import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loader: vi.fn(),
  loadPHPRuntime: vi.fn(),
  PHP: vi.fn(),
  instance: null,
  response: null
}));

vi.mock('@php-wasm/universal', () => ({
  PHP: mocks.PHP,
  loadPHPRuntime: mocks.loadPHPRuntime
}));
vi.mock('@php-wasm/web-8-5', () => ({
  getPHPLoaderModule: mocks.loader
}));

import { createPhpRuntime } from '../site/editor/php-runtime.js';

beforeEach(() => {
  mocks.loader.mockReset().mockResolvedValue('loader');
  mocks.loadPHPRuntime.mockReset().mockResolvedValue('runtime-id');
  mocks.response = {
    stdoutText: Promise.resolve('hello\n'),
    stderrText: Promise.resolve(''),
    exitCode: Promise.resolve(0)
  };
  mocks.instance = {
    mkdirTree: vi.fn(),
    writeFile: vi.fn(),
    runStream: vi.fn().mockResolvedValue(mocks.response),
    [Symbol.dispose]: vi.fn()
  };
  mocks.PHP.mockReset().mockImplementation(function PHP() { return mocks.instance; });
});

describe('createPhpRuntime', () => {
  it('runs with the real PHPRunOptions shape and preserves streamed output', async () => {
    const output = vi.fn();
    const status = vi.fn();
    const runtime = createPhpRuntime({ onOutput: output, onStatus: status });

    await expect(runtime.run('hello.php', '<?php echo "hello";')).resolves.toEqual({
      stdout: 'hello\n',
      stderr: '',
      exitCode: 0
    });

    expect(mocks.loader).toHaveBeenCalledOnce();
    expect(mocks.loadPHPRuntime).toHaveBeenCalledWith('loader');
    expect(mocks.instance.mkdirTree).toHaveBeenCalledWith('/workspace');
    expect(mocks.instance.writeFile).toHaveBeenCalledWith('/workspace/hello.php', '<?php echo "hello";');
    expect(mocks.instance.runStream).toHaveBeenCalledWith({ scriptPath: '/workspace/hello.php' });
    expect(output).toHaveBeenCalledWith('stdout', 'hello\n');
    expect(status).toHaveBeenCalledWith('running', expect.any(String));
    expect(status).toHaveBeenLastCalledWith('ready', expect.any(String));
  });

  it('writes input to stdin.txt and passes it through documented body for php://input', async () => {
    const runtime = createPhpRuntime();
    const input = 'Ada\n42\n';

    await runtime.run('read.php', '<?php echo file_get_contents("php://input");', { input });

    expect(mocks.instance.writeFile).toHaveBeenNthCalledWith(2, '/workspace/stdin.txt', input);
    expect(mocks.instance.runStream).toHaveBeenCalledWith({
      scriptPath: '/workspace/read.php',
      body: input
    });
  });

  it('accepts Uint8Array input and rejects unsupported input without starting a run', async () => {
    const runtime = createPhpRuntime();
    const input = new Uint8Array([65, 10]);

    await runtime.run('bytes.php', '<?php', { input });
    expect(mocks.instance.runStream).toHaveBeenCalledWith({
      scriptPath: '/workspace/bytes.php',
      body: input
    });

    await expect(runtime.run('bad.php', '<?php', { input: 42 })).rejects.toThrow(
      'PHP input must be a string or Uint8Array.'
    );
    expect(mocks.instance.runStream).toHaveBeenCalledTimes(1);
  });

  it('reports stderr through output and rejects non-zero exit codes', async () => {
    mocks.response = {
      stdoutText: Promise.resolve('partial'),
      stderrText: Promise.resolve('parse error'),
      exitCode: Promise.resolve(1)
    };
    mocks.instance.runStream.mockResolvedValue(mocks.response);
    const output = vi.fn();
    const runtime = createPhpRuntime({ onOutput: output });

    await expect(runtime.run('broken.php', '<?php nope();')).rejects.toThrow('parse error');
    expect(output).toHaveBeenNthCalledWith(1, 'stdout', 'partial');
    expect(output).toHaveBeenNthCalledWith(2, 'stderr', 'parse error');
  });

  it('stops an initialized runtime and is idempotent when already stopped', async () => {
    const status = vi.fn();
    const runtime = createPhpRuntime({ onStatus: status });
    await runtime.run('one.php', '<?php');

    expect(runtime.stop()).toBe(true);
    expect(mocks.instance[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('stopped', expect.any(String));
    expect(runtime.stop()).toBe(false);
  });
});

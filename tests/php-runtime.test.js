import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loader: vi.fn(),
  loadPHPRuntime: vi.fn(),
  withPHPIniValues: vi.fn(),
  PHP: vi.fn(),
  instance: null,
  response: null
}));

vi.mock('@php-wasm/universal', () => ({
  PHP: mocks.PHP,
  loadPHPRuntime: mocks.loadPHPRuntime,
  withPHPIniValues: mocks.withPHPIniValues
}));
vi.mock('@php-wasm/web-8-5', () => ({ getPHPLoaderModule: mocks.loader }));

import { createPhpRuntime } from '../site/editor/php-runtime.js';

beforeEach(() => {
  mocks.loader.mockReset().mockResolvedValue('loader');
  mocks.loadPHPRuntime.mockReset().mockResolvedValue('runtime-id');
  mocks.withPHPIniValues.mockReset().mockImplementation((_php, _values, callback) => callback());
  mocks.response = { stdoutText: Promise.resolve('hello\n'), stderrText: Promise.resolve(''), exitCode: Promise.resolve(0) };
  mocks.instance = {
    mkdirTree: vi.fn(), writeFile: vi.fn(), runStream: vi.fn().mockResolvedValue(mocks.response),
    chdir: vi.fn(), isDir: vi.fn().mockReturnValue(true), rmdir: vi.fn(),
    [Symbol.dispose]: vi.fn()
  };
  mocks.PHP.mockReset().mockImplementation(function PHP() { return mocks.instance; });
});

describe('createPhpRuntime', () => {
  it('runs the active PHP file in the project root and preserves streamed output', async () => {
    const output = vi.fn();
    const status = vi.fn();
    const runtime = createPhpRuntime({ onOutput: output, onStatus: status });

    await expect(runtime.run('hello.php', '<?php echo "hello";')).resolves.toEqual({ stdout: 'hello\n', stderr: '', exitCode: 0 });
    expect(mocks.loader).toHaveBeenCalledOnce();
    expect(mocks.loadPHPRuntime).toHaveBeenCalledWith('loader');
    expect(mocks.instance.rmdir).toHaveBeenCalledWith('/workspace', { recursive: true });
    expect(mocks.instance.writeFile).toHaveBeenCalledWith('/workspace/hello.php', '<?php echo "hello";');
    expect(mocks.instance.chdir).toHaveBeenCalledWith('/workspace');
    expect(mocks.withPHPIniValues).toHaveBeenCalledWith(mocks.instance, expect.objectContaining({
      allow_url_fopen: '0',
      allow_url_include: '0',
      disable_functions: expect.stringContaining('stream_socket_client')
    }), expect.any(Function));
    expect(mocks.instance.runStream).toHaveBeenCalledWith({ scriptPath: '/workspace/hello.php' });
    expect(output).toHaveBeenCalledWith('stdout', 'hello\n');
    expect(status).toHaveBeenLastCalledWith('ready', expect.any(String));
  });

  it('stages the complete project snapshot preserving nested directories for require/include', async () => {
    const runtime = createPhpRuntime();
    const files = [
      { name: 'index.php', content: '<?php require "lib/one.php"; include "parts/two.php";' },
      { name: 'lib/one.php', content: '<?php require "nested/shared.php";' },
      { name: 'lib/nested/shared.php', content: '<?php echo "required";' },
      { name: 'parts/two.php', content: '<?php echo "included";' }
    ];

    await runtime.run('index.php', files[0].content, { files });

    expect(mocks.instance.mkdirTree).toHaveBeenCalledWith('/workspace/lib');
    expect(mocks.instance.mkdirTree).toHaveBeenCalledWith('/workspace/lib/nested');
    expect(mocks.instance.mkdirTree).toHaveBeenCalledWith('/workspace/parts');
    for (const file of files) {
      expect(mocks.instance.writeFile).toHaveBeenCalledWith(`/workspace/${file.name}`, file.content);
    }
    expect(mocks.instance.runStream).toHaveBeenCalledWith({ scriptPath: '/workspace/index.php' });
  });

  it('clears all prior workspace state before each run', async () => {
    const runtime = createPhpRuntime();
    await runtime.run('first.php', '<?php file_put_contents("leftover.txt", "secret");');
    mocks.instance.rmdir.mockClear();
    mocks.instance.writeFile.mockClear();
    await runtime.run('second.php', '<?php echo "clean";');

    expect(mocks.instance.rmdir).toHaveBeenCalledWith('/workspace', { recursive: true });
    expect(mocks.instance.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.instance.writeFile).toHaveBeenCalledWith('/workspace/second.php', '<?php echo "clean";');
  });

  it('writes input to a workspace file and passes it through documented body', async () => {
    const runtime = createPhpRuntime();
    const input = 'Ada\n42\n';
    await runtime.run('read.php', '<?php', { input });
    expect(mocks.instance.writeFile).toHaveBeenCalledWith('/workspace/stdin.txt', input);
    expect(mocks.instance.runStream).toHaveBeenCalledWith({ scriptPath: '/workspace/read.php', body: input });
  });

  it('accepts Uint8Array input and rejects unsupported input without starting a run', async () => {
    const runtime = createPhpRuntime();
    const input = new Uint8Array([65, 10]);
    await runtime.run('bytes.php', '<?php', { input });
    expect(mocks.instance.runStream).toHaveBeenCalledWith({ scriptPath: '/workspace/bytes.php', body: input });
    await expect(runtime.run('bad.php', '<?php', { input: 42 })).rejects.toThrow('PHP input must be a string or Uint8Array.');
    expect(mocks.instance.runStream).toHaveBeenCalledTimes(1);
  });

  it('rejects traversal and absolute paths before writing files', async () => {
    const runtime = createPhpRuntime();
    await expect(runtime.run('../escape.php', '<?php')).rejects.toThrow('Invalid PHP project path');
    await expect(runtime.run('ok.php', '<?php', { files: [{ name: '../outside.php', content: '<?php' }] })).rejects.toThrow('Invalid PHP project path');
    expect(mocks.instance.writeFile).not.toHaveBeenCalled();
  });

  it('rejects unsupported package installation but runs experimental code offline and destroys the session', async () => {
    const runtime = createPhpRuntime();
    await expect(runtime.run('app.php', '<?php', { packages: ['vendor/library'] })).rejects.toThrow('package installation is unavailable');
    await expect(runtime.run('app.php', '<?php', { mode: 'experimental' })).resolves.toMatchObject({ exitCode: 0 });
    expect(mocks.loadPHPRuntime).toHaveBeenCalledOnce();
    expect(mocks.instance[Symbol.dispose]).toHaveBeenCalledOnce();
  });

  it('reports stderr through output and rejects non-zero exit codes', async () => {
    mocks.response = { stdoutText: Promise.resolve('partial'), stderrText: Promise.resolve('parse error'), exitCode: Promise.resolve(1) };
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessions, WebRMock } = vi.hoisted(() => {
  const sessions = [];
  class WebRMock {
    constructor(options) {
      this.options = options;
      this.FS = {
        mkdir: vi.fn(async () => ({})),
        analyzePath: vi.fn(async () => ({ exists: true })),
        writeFile: vi.fn(async () => {})
      };
      this.init = vi.fn(async () => {});
      this.close = vi.fn();
      this.interrupt = vi.fn();
      this.evalRVoid = vi.fn(async (code) => { this.code = code; });
      this.evalRString = vi.fn(async () => '');
      this.flush = vi.fn(async () => []);
      this.installPackages = vi.fn(async () => {});
      this.streamQueue = [];
      this.streamWaiters = [];
      this.pushStream = (type, data) => {
        const message = { type, data };
        const waiter = this.streamWaiters.shift();
        if (waiter) waiter({ value: message, done: false });
        else this.streamQueue.push(message);
      };
      this.stream = vi.fn(() => {
        const session = this;
        return (async function* streamMessages() {
          while (true) {
            if (session.streamQueue.length) yield session.streamQueue.shift();
            else yield await new Promise((resolve) => session.streamWaiters.push(resolve));
          }
        }());
      });
      sessions.push(this);
    }
  }
  return { sessions, WebRMock };
});
vi.mock('webr', () => ({ WebR: WebRMock }));
const { createRRuntime, MAX_OUTPUT_CHARS } = await import('../site/editor/r-runtime.js');

describe('R WebR runtime adapter', () => {
  beforeEach(() => sessions.splice(0));
  it('initializes WebR and stages the project snapshot before sourcing the entry file', async () => {
    const output = [];
    const runtime = createRRuntime({ onOutput: (...args) => output.push(args) });
    const result = await runtime.run('src/main.R', 'source("helper.R")', {
      files: [{ name: 'src/helper.R', content: 'VALUE <- 42' }, { name: 'data/input.csv', content: 'x\n1' }]
    });
    const session = sessions[0];
    expect(session.init).toHaveBeenCalledOnce();
    expect(session.options.baseUrl).toMatch(/\/webr\/$/);
    expect(session.FS.writeFile).toHaveBeenCalledTimes(3);
    expect(session.code).toContain('setwd("/home/web_user/r-project")');
    expect(session.code).toContain('source("/home/web_user/r-project/src/main.R"');
    expect(session.code).toContain('chdir=TRUE');
    expect(session.code).toContain('withCallingHandlers');
    expect(session.flush).toHaveBeenCalledOnce();
    expect(result).toEqual({ exitCode: 0 });
    expect(output).toEqual([]);
    expect(runtime.status).toBe('ready');
  });
  it('routes bounded WebR stdout, stderr, conditions and errors to output callbacks', async () => {
    const output = [];
    const runtime = createRRuntime({ onOutput: (...args) => output.push(args) });
    const pending = runtime.run('main.R', '');
    const session = sessions[0];
    session.pushStream('stdout', 'hello\n');
    session.pushStream('stderr', 'warning\n');
    session.pushStream('warning', 'note\n');
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(output).toEqual([['stdout', 'hello\n'], ['stderr', 'warning\n'], ['message', 'note\n']]);
  });
  it('forwards captured output, warnings and errors returned by the executed R project', async () => {
    const output = [];
    const runtime = createRRuntime({ onOutput: (...args) => output.push(args) });
    const pending = runtime.run('main.R', 'cat("hello")');
    const session = sessions[0];
    session.evalRString
      .mockResolvedValueOnce('hello from R\n')
      .mockResolvedValueOnce('Warning: sample warning\n')
      .mockResolvedValueOnce('sample error\nmain.R:1\n');
    await expect(pending).rejects.toThrow('sample error');
    expect(output).toEqual([
      ['stdout', 'hello from R\n'],
      ['stderr', 'Warning: sample warning\n'],
      ['stderr', 'sample error\nmain.R:1\n']
    ]);
  });
  it('rejects unsafe paths, safe-mode packages and malformed options before WebR starts', async () => {
    const runtime = createRRuntime();
    await expect(runtime.run('../escape.R', '')).rejects.toThrow(/entry file name/);
    await expect(runtime.run('main.R', '', { files: [{ name: '../escape.R', content: '' }] })).rejects.toThrow(/project file name/);
    await expect(runtime.run('main.R', '', { packages: ['dplyr'] })).rejects.toThrow(/safe mode/);
    await expect(runtime.run('main.R', '', { mode: 'experimental', packages: ['bad;install'] })).rejects.toThrow(/package list/);
    expect(sessions).toHaveLength(0);
  });
  it('installs only requested package names in experimental mode and closes the session afterwards', async () => {
    const runtime = createRRuntime();
    await runtime.run('main.R', '', { mode: 'experimental', packages: ['ggplot2'] });
    expect(sessions[0].installPackages).toHaveBeenCalledWith(['ggplot2']);
    expect(sessions[0].close).toHaveBeenCalledOnce();
    await runtime.run('main.R', '');
    expect(sessions).toHaveLength(2);
    expect(sessions[1].installPackages).not.toHaveBeenCalled();
  });
  it('bounds output and rejects oversized source without creating a session', async () => {
    const output = [];
    const runtime = createRRuntime({ onOutput: (...args) => output.push(args) });
    const pending = runtime.run('main.R', '');
    sessions[0].pushStream('stdout', 'x'.repeat(MAX_OUTPUT_CHARS + 10));
    await pending;
    expect(output[0][1]).toHaveLength(MAX_OUTPUT_CHARS);
    expect(output[1][0]).toBe('system');
    await expect(runtime.run('main.R', 'x'.repeat(100_001))).rejects.toThrow(/source/);
    expect(sessions).toHaveLength(1);
  });
  it('stops an active run and discards the WebR worker', async () => {
    const runtime = createRRuntime();
    const pending = runtime.run('main.R', '');
    const session = sessions[0];
    expect(runtime.stop()).toBe(true);
    await expect(pending).rejects.toThrow('R run stopped.');
    expect(session.close).toHaveBeenCalledOnce();
    expect(session.interrupt).toHaveBeenCalledOnce();
    expect(runtime.status).toBe('stopped');
  });
});

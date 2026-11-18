import { describe, expect, it, vi } from 'vitest';
import { executeTerminalCommand, parseTerminalCommand } from '../site/editor/terminal.js';
import { createStarterProject } from '../site/editor/project.js';

describe('project terminal filesystem commands', () => {
  function fixture() {
    let project = createStarterProject('blank');
    const applyProject = vi.fn((next) => { project = next; });
    return { context: { files: () => project.files, project: () => project, applyProject, projectName: () => 'demo', activeFile: () => project.activeFile }, project: () => project, applyProject };
  }
  it('creates, lists, reads, moves and copies project entries', async () => {
    const f = fixture();
    expect((await executeTerminalCommand('mkdir notes', f.context)).type).toBe('info');
    await executeTerminalCommand('touch notes/todo.txt', f.context);
    expect((await executeTerminalCommand('ls notes', f.context)).text).toBe('todo.txt');
    expect((await executeTerminalCommand('cat notes/todo.txt', f.context)).text).toBe('');
    await executeTerminalCommand('mv notes/todo.txt notes/tasks.txt', f.context);
    await executeTerminalCommand('cp notes/tasks.txt notes', f.context);
    expect(f.project().files.map(x => x.name)).toContain('notes/tasks copy.txt');
    expect(f.applyProject).toHaveBeenCalledTimes(4);
  });
  it('rejects unsafe paths/arity and does not partially apply on error', async () => {
    const f = fixture();
    expect(parseTerminalCommand('touch x; rm index.html').error).toBeTruthy();
    expect((await executeTerminalCommand('touch ../host', f.context)).type).toBe('error');
    expect((await executeTerminalCommand('mv index.html', f.context)).type).toBe('error');
    expect(f.applyProject).not.toHaveBeenCalled();
    expect(f.project().files.some(x => x.name === '../host')).toBe(false);
  });
  it('never recursively removes a nonempty folder and retains at least one file', async () => {
    const f = fixture();
    await executeTerminalCommand('mkdir archive', f.context);
    await executeTerminalCommand('touch archive/a.txt', f.context);
    expect((await executeTerminalCommand('rm archive', f.context)).text).toMatch(/not empty/);
    expect(f.project().files.some(x => x.name === 'archive/a.txt')).toBe(true);
    expect((await executeTerminalCommand('rm index.html', f.context)).type).toBe('info');
    expect(f.project().files.some(x => x.name === 'index.html')).toBe(false);
  });

  it('dispatches Ruby, R and Perl commands to their local browser runtimes', async () => {
    const runRuby = vi.fn(async () => {}), runR = vi.fn(async () => {}), runPerl = vi.fn(async () => {});
    const files = [
      { name: 'src/main.rb', content: 'puts 1' },
      { name: 'analysis/main.R', content: 'print(1)' },
      { name: 'scripts/main.pl', content: 'print 1' }
    ];
    const context = {
      files: () => files, activeFile: () => files[0].name,
      runRuby, runR, runPerl
    };
    expect((await executeTerminalCommand('ruby src/main.rb', context)).type).toBe('info');
    expect((await executeTerminalCommand('r analysis/main.R', context)).type).toBe('info');
    expect((await executeTerminalCommand('perl scripts/main.pl', context)).type).toBe('info');
    expect(runRuby).toHaveBeenCalledWith('src/main.rb', 'puts 1');
    expect(runR).toHaveBeenCalledWith('analysis/main.R', 'print(1)');
    expect(runPerl).toHaveBeenCalledWith('scripts/main.pl', 'print 1');
  });
});

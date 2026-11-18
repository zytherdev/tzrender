import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initSQLite, databases } = vi.hoisted(() => ({
  initSQLite: vi.fn(),
  databases: []
}));

class MockDB {
  constructor() {
    this.closed = false;
    this.execCalls = [];
    this.tables = new Map();
    databases.push(this);
  }

  exec(options) {
    this.execCalls.push(options);
    const sql = options.sql.trim();
    if (/^select\s+error$/i.test(sql)) throw new Error('near "error": syntax error');
    if (/^create table/i.test(sql)) {
      const [, name, columns] = sql.match(/^create table\s+(\w+)\s*\(([^)]+)\)/i) || [];
      if (name) this.tables.set(name, columns.split(',').map((column) => column.trim().split(/\s+/)[0]));
      return [];
    }
    if (/^insert into/i.test(sql)) return [];
    if (/^select/i.test(sql)) {
      const match = sql.match(/^select\s+(.+?)(?:\s+from\s+(\w+))?$/i);
      if (!match) return [];
      const fields = match[1].split(',').map((field) => field.trim());
      const rows = fields.map((field) => {
        const [expression, alias] = field.split(/\s+as\s+/i);
        const value = /^['"]/.test(expression) ? expression.slice(1, -1) : Number(expression);
        return { [alias || expression]: Number.isNaN(value) ? value : value };
      });
      const row = Object.assign({}, ...rows);
      options.columnNames.push(...Object.keys(row));
      return [row];
    }
    return [];
  }

  close() {
    this.closed = true;
  }
}

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: initSQLite
}));

const { createSqlRuntime, SQL_RUNTIME_LIMITS, splitSql } = await import('../site/editor/sql-runtime.js');

describe('createSqlRuntime', () => {
  let output;
  let statuses;

  beforeEach(() => {
    initSQLite.mockReset();
    databases.splice(0);
    initSQLite.mockResolvedValue({ oo1: { DB: MockDB } });
    output = [];
    statuses = [];
  });

  afterEach(() => vi.restoreAllMocks());

  function makeRuntime() {
    return createSqlRuntime({
      onOutput: (stream, value) => output.push([stream, value]),
      onStatus: (state, detail) => statuses.push([state, detail])
    });
  }

  it('splits statements without breaking quoted semicolons or comments', () => {
    expect(splitSql("select 'a;b'; -- comment;\n select 2; /* ; */ select 3")).toEqual([
      "select 'a;b'",
      '-- comment;\n select 2',
      '/* ; */ select 3'
    ]);
  });

  it('initializes an in-memory database and returns structured results for multiple queries', async () => {
    const runtime = makeRuntime();
    const result = await runtime.run('data.sql', "create table people (name text); select 'Ada' as name; select 42 as answer;");

    expect(initSQLite).toHaveBeenCalledOnce();
    expect(databases[0].execCalls).toHaveLength(3);
    expect(result).toMatchObject({ name: 'data.sql', queryCount: 3, rowCount: 2, truncated: false });
    expect(result.statements[1]).toMatchObject({ columns: ['name'], rows: [{ name: 'Ada' }] });
    expect(output[0][0]).toBe('result');
    expect(statuses.at(-1)[0]).toBe('ready');
  });

  it('expands project-local .read scripts across folders and rejects unsafe or cyclic includes', async () => {
    const runtime = makeRuntime();
    const files = [
      { name: 'queries/main.sql', content: '.read ../schema/setup.sql\nselect 7 as answer;' },
      { name: 'schema/setup.sql', content: "select 'loaded locally' as status;" }
    ];
    const result = await runtime.run('queries/main.sql', files[0].content, { files });
    expect(result.queryCount).toBe(2);
    expect(result.statements[0].rows[0].status).toBe('loaded locally');
    await expect(runtime.run('queries/escape.sql', '.read ../../outside.sql', { files }))
      .rejects.toThrow('not found or unsafe');
    const cycle = [{ name: 'a.sql', content: '.read b.sql' }, { name: 'b.sql', content: '.read a.sql' }];
    await expect(runtime.run('a.sql', cycle[0].content, { files: cycle })).rejects.toThrow('cycle detected');
  });

  it('discards the in-memory database after an experimental session', async () => {
    const runtime = makeRuntime();
    await runtime.run('temp.sql', 'select 1', { mode: 'experimental' });
    expect(databases[0].closed).toBe(true);
    await runtime.run('safe.sql', 'select 2');
    expect(databases).toHaveLength(2);
  });

  it('reports SQLite errors through stderr and rejects the run', async () => {
    const runtime = makeRuntime();
    await expect(runtime.run('broken.sql', 'select error')).rejects.toThrow('SQL failed: near "error": syntax error');
    expect(output.at(-1)).toEqual(['stderr', 'SQL failed: near "error": syntax error']);
    expect(statuses.at(-1)[0]).toBe('error');
  });

  it('rejects oversized scripts before loading WASM', async () => {
    const runtime = makeRuntime();
    const source = Array.from({ length: SQL_RUNTIME_LIMITS.maxQueries + 1 }, () => 'select 1').join(';');
    await expect(runtime.run('too-many.sql', source)).rejects.toThrow('limited to 100 queries');
    expect(initSQLite).not.toHaveBeenCalled();
  });

  it('resets the in-memory database and disposes it', async () => {
    const runtime = makeRuntime();
    await runtime.run('schema.sql', 'select 1');
    const first = databases[0];
    runtime.reset();
    expect(first.closed).toBe(true);
    expect(statuses.at(-1)).toEqual(['reset', 'In-memory SQLite database reset.']);
    await runtime.run('fresh.sql', 'select 2');
    expect(databases).toHaveLength(2);
    runtime.dispose();
    expect(databases[1].closed).toBe(true);
  });

  it('stops an active run and rejects it', async () => {
    let resolveInit;
    initSQLite.mockReturnValueOnce(new Promise((resolve) => { resolveInit = resolve; }));
    const runtime = makeRuntime();
    const pending = runtime.run('slow.sql', 'select 1');
    expect(runtime.running).toBe(true);
    expect(runtime.stop()).toBe(true);
    await expect(pending).rejects.toThrow('SQL run stopped.');
    resolveInit({ oo1: { DB: MockDB } });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.running).toBe(false);
    expect(databases).toHaveLength(0);
  });
});

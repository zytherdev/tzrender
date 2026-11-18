import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const MAX_SOURCE_CHARS = 100_000;
const MAX_INPUT_CHARS = 100_000;
const MAX_QUERIES = 100;
const MAX_ROWS = 5_000;
const MAX_OUTPUT_CHARS = 200_000;
const RUNTIME_LOAD_TIMEOUT = 90_000;

function validateSource(source) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) {
    throw new Error(`SQL files are limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  }
  return source;
}

function validateInput(input) {
  if (input === undefined) return '';
  if (typeof input !== 'string' || input.length > MAX_INPUT_CHARS) {
    throw new Error(`SQL input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  }
  return input;
}

// SQLite exec() can run a script, but its resultRows/columnNames options only
// describe the first result-producing statement. Splitting here lets the editor
// retain one structured result per query while respecting quoted semicolons.
function splitSql(source) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n' || char === '\r') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (source[index + 1] === quote && (quote === "'" || quote === '"' || quote === '`')) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === '-' && next === '-') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === ';') {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createSqlRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let sqlite = null;
  let db = null;
  let loading = null;
  let active = null;
  let runSequence = 0;

  async function ensureDatabase() {
    if (db) return db;
    if (!loading) {
      onStatus('loading', 'Starting the local SQLite WASM runtime…');
      loading = sqlite3InitModule().then((module) => {
        sqlite = module;
        db = new module.oo1.DB(':memory:', 'c');
        return db;
      }).catch((error) => {
        loading = null;
        throw error;
      });
    }
    return loading;
  }

  function closeDatabase() {
    if (db) {
      db.close();
      db = null;
    }
    sqlite = null;
    loading = null;
  }

  function stopActive(message = 'SQL run stopped.') {
    if (!active) return false;
    const task = active;
    active = null;
    closeDatabase();
    onStatus('stopped', message);
    task.reject(new Error(message));
    return true;
  }

  function execute(name, source, options = {}) {
    let sql;
    try {
      sql = validateSource(source);
      validateInput(options.input);
    } catch (error) {
      return Promise.reject(error);
    }
    if (active) throw new Error('SQL is already running. Stop it before starting another run.');
    const statements = splitSql(sql);
    if (statements.length > MAX_QUERIES) {
      return Promise.reject(new Error(`SQL runs are limited to ${MAX_QUERIES} queries.`));
    }
    if (!statements.length) {
      const empty = { name: String(name || 'untitled.sql'), statements: [], queryCount: 0, rowCount: 0, truncated: false };
      onOutput('result', empty);
      onStatus('ready', 'No SQL statements to run.');
      return empty;
    }

    const id = ++runSequence;
    let resolveTask;
    let rejectTask;
    const taskPromise = new Promise((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
    active = { id, reject: rejectTask };
    (async () => {
      const loadTimer = setTimeout(() => stopActive('SQLite took too long to initialize.'), RUNTIME_LOAD_TIMEOUT);
      try {
        const database = await ensureDatabase();
        clearTimeout(loadTimer);
        if (!active || active.id !== id) return;
        onStatus('running', `Running ${statements.length} SQL ${statements.length === 1 ? 'query' : 'queries'} locally.`);
        const results = [];
        let rowCount = 0;
        let outputChars = 0;
        let truncated = false;
        for (const statement of statements) {
          if (rowCount >= MAX_ROWS || outputChars >= MAX_OUTPUT_CHARS) {
            truncated = true;
            break;
          }
          const columns = [];
          const rows = [];
          const resultRows = database.exec({
            sql: statement,
            rowMode: 'object',
            columnNames: columns,
            returnValue: 'resultRows'
          });
          for (const row of resultRows) {
            if (rowCount >= MAX_ROWS) {
              truncated = true;
              break;
            }
            const serialized = JSON.stringify(row);
            if (outputChars + serialized.length > MAX_OUTPUT_CHARS) {
              truncated = true;
              break;
            }
            rows.push(row);
            rowCount += 1;
            outputChars += serialized.length;
          }
          results.push({ sql: statement, columns, rows, rowCount: rows.length, truncated: resultRows.length !== rows.length });
          if (truncated) break;
        }
        const result = {
          name: String(name || 'untitled.sql'),
          statements: results,
          queryCount: results.length,
          rowCount,
          truncated
        };
        onOutput('result', result);
        active = null;
        onStatus('ready', `SQLite finished ${result.queryCount} ${result.queryCount === 1 ? 'query' : 'queries'}.`);
        resolveTask(result);
      } catch (error) {
        clearTimeout(loadTimer);
        if (active?.id === id) {
          active = null;
          onStatus('error', errorMessage(error));
        }
        const wrapped = new Error(`SQL failed: ${errorMessage(error)}`);
        onOutput('stderr', wrapped.message);
        rejectTask(wrapped);
      }
    })();
    return taskPromise;
  }

  return {
    run(name, source, options = {}) {
      // Keep the file-name-first contract explicit; unlike Python, SQL does not
      // consume stdin, but input is accepted and bounded for future bindings.
      return execute(name, source, options);
    },
    stop() {
      return stopActive();
    },
    reset() {
      if (active) stopActive('SQL database reset.');
      closeDatabase();
      onStatus('reset', 'In-memory SQLite database reset.');
    },
    dispose() {
      if (active) stopActive('The editor is closing.');
      else closeDatabase();
    },
    get running() {
      return Boolean(active);
    }
  };
}

export const SQL_RUNTIME_LIMITS = Object.freeze({
  maxSourceChars: MAX_SOURCE_CHARS,
  maxInputChars: MAX_INPUT_CHARS,
  maxQueries: MAX_QUERIES,
  maxRows: MAX_ROWS,
  maxOutputChars: MAX_OUTPUT_CHARS
});

export { splitSql };

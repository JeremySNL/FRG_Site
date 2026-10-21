/**
 * A small, dependency-free reader for `mysqldump` SQL files.
 *
 * Only the subset needed to migrate a WordPress database is supported:
 * `INSERT INTO` statements with row tuples. Everything is scanned
 * character-by-character so that semicolons, commas and parentheses inside
 * string literals never break the parser.
 */

const INSERT_RE_CACHE = new Map<string, RegExp>();

function insertPattern(table: string): RegExp {
  let pattern = INSERT_RE_CACHE.get(table);
  if (!pattern) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`INSERT\\s+INTO\\s+\`?${escaped}\`?(?![A-Za-z0-9_])`, 'gi');
    INSERT_RE_CACHE.set(table, pattern);
  }
  return new RegExp(pattern.source, pattern.flags);
}

/** Undo MySQL's backslash escaping inside a quoted string. */
export function unescapeSql(value: string): string {
  if (!value.includes('\\')) return value;

  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '\\') {
      out += char;
      continue;
    }

    const next = value[i + 1];
    i += 1;
    switch (next) {
      case '0':
        out += '\0';
        break;
      case 'b':
        out += '\b';
        break;
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'Z':
        out += '\x1a';
        break;
      case '\\':
        out += '\\';
        break;
      case "'":
        out += "'";
        break;
      case '"':
        out += '"';
        break;
      case undefined:
        out += '\\';
        break;
      default:
        out += next;
        break;
    }
  }

  return out;
}

/**
 * Return the full text of every `INSERT INTO <table>` statement.
 * The statements are concatenated; use {@link splitTuples} to read the rows.
 */
export function readInsertStatements(sql: string, table: string): string {
  const pattern = insertPattern(table);
  const chunks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    // The statement may or may not list the columns; find the VALUES keyword.
    const valuesAt = sql.indexOf('VALUES', match.index);
    if (valuesAt === -1) break;

    const body = readUntilSemicolon(sql, valuesAt + 'VALUES'.length);
    if (body === null) break;

    chunks.push(body);
    pattern.lastIndex = valuesAt + 'VALUES'.length + body.length;
  }

  return chunks.join('\n');
}

/** Read from `start` until the first `;` that is not inside a string literal. */
function readUntilSemicolon(sql: string, start: number): string | null {
  let i = start;
  let inString = false;

  while (i < sql.length) {
    const char = sql[i];

    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === "'") inString = false;
    } else if (char === "'") {
      inString = true;
    } else if (char === ';') {
      return sql.slice(start, i);
    }

    i += 1;
  }

  return null;
}

/** Split an `INSERT` body into its top-level `( … )` row tuples. */
export function splitTuples(body: string): string[] {
  const tuples: string[] = [];
  let i = 0;

  while (i < body.length) {
    if (body[i] !== '(') {
      i += 1;
      continue;
    }

    const end = findClosing(body, i);
    if (end === -1) break;

    tuples.push(body.slice(i + 1, end));
    i = end + 1;
  }

  return tuples;
}

/** Split a row tuple into its top-level comma-separated fields. */
export function splitFields(tuple: string): string[] {
  const fields: string[] = [];
  let current = '';
  let i = 0;
  let inString = false;

  while (i < tuple.length) {
    const char = tuple[i];

    if (inString) {
      if (char === '\\') {
        current += char + (tuple[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (char === "'") {
        inString = false;
        i += 1;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (char === "'") {
      inString = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      fields.push(current);
      current = '';
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  fields.push(current);

  return fields.map(unescapeSql);
}

/** Index of the `)` that closes the `(` at `start`, ignoring string literals. */
function findClosing(text: string, start: number): number {
  let depth = 0;
  let i = start;
  let inString = false;

  while (i < text.length) {
    const char = text[i];

    if (inString) {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === "'") inString = false;
    } else if (char === "'") {
      inString = true;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }

    i += 1;
  }

  return -1;
}

/**
 * Read a table into an array of records keyed by column name.
 * `columns` must match the order used in the `INSERT` statement.
 */
export function readTable(sql: string, table: string, columns: string[]): Array<Record<string, string>> {
  const body = readInsertStatements(sql, table);
  const rows: Array<Record<string, string>> = [];

  for (const tuple of splitTuples(body)) {
    const fields = splitFields(tuple);
    const record: Record<string, string> = {};

    columns.forEach((column, index) => {
      record[column] = fields[index] ?? '';
    });

    rows.push(record);
  }

  return rows;
}

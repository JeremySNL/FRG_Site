/**
 * A minimal YAML writer.
 *
 * The extractor only ever emits strings, numbers, booleans, arrays and plain
 * objects, so a focused writer keeps the migration free of extra dependencies.
 */

function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  return `"${escaped}"`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  return quote(String(value));
}

/** Serialize a value to a YAML document (without the `---` marker). */
export function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;

    let out = '';
    for (const item of value) {
      if (isPlainObject(item)) {
        const body = toYaml(item, indent + 2);
        out += `${pad}- ${body.slice(indent + 2)}`;
      } else if (Array.isArray(item)) {
        out += `${pad}-\n${toYaml(item, indent + 2)}`;
      } else {
        out += `${pad}- ${writeScalar(item)}\n`;
      }
    }
    return out;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return `${pad}{}\n`;

    let out = '';
    for (const key of keys) {
      const entry = value[key];

      if (entry === undefined) continue;

      if (Array.isArray(entry)) {
        if (entry.length === 0) {
          out += `${pad}${key}: []\n`;
          continue;
        }
        out += `${pad}${key}:\n${toYaml(entry, indent + 2)}`;
        continue;
      }

      if (isPlainObject(entry)) {
        const inner = Object.keys(entry);
        if (inner.length === 0) {
          out += `${pad}${key}: {}\n`;
          continue;
        }
        out += `${pad}${key}:\n${toYaml(entry, indent + 2)}`;
        continue;
      }

      out += `${pad}${key}: ${writeScalar(entry)}\n`;
    }
    return out;
  }

  return `${pad}${writeScalar(value)}\n`;
}

/** Build a Markdown document from a frontmatter object and a body. */
export function markdownDocument(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = toYaml(frontmatter).trimEnd();
  const trimmedBody = body.trim();

  if (trimmedBody === '') return `---\n${yaml}\n---\n`;

  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}

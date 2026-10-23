/**
 * The string-level machinery of the machine translation.
 *
 * The translator works on *strings*, not on documents: every translatable
 * string of a document is collected, sent to the translation API in batches
 * and written back at the exact same place. That keeps the structure of the
 * content — the block types, the slugs, the order — untouched, so only the
 * words change.
 */

/** Where a string lives inside a document. */
export interface StringRef {
  path: (string | number)[];
  value: string;
}

/**
 * The frontmatter keys whose string value is written for the reader.
 *
 * Anything not listed here is left alone: slugs, URLs, addresses, form ids…
 */
const TRANSLATABLE_KEYS = new Set([
  'alt',
  'author',
  'bio',
  'description',
  'excerpt',
  'html',
  'imageAlt',
  'intro',
  'label',
  'name',
  'navLabel',
  'quote',
  'role',
  'slogans',
  'summary',
  'text',
  'title',
]);

/**
 * The frontmatter keys that are never translated.
 *
 * Some of them hold strings that look like prose (`query` of a map block,
 * `programs` of a program list) but are actually identifiers.
 */
const SKIP_KEYS = new Set([
  'categories',
  'date',
  'form',
  'href',
  'icon',
  'id',
  'image',
  'legacyPath',
  'limit',
  'locale',
  'nav',
  'navParent',
  'noAutoTranslate',
  'order',
  'percentage',
  'program',
  'programs',
  'query',
  'reverse',
  'slug',
  'surface',
  'tags',
  'type',
  'updated',
  'url',
  'youtubeId',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collect every string of a document that has to be translated.
 *
 * Arrays of plain strings are translated as a whole (`items` of a list block,
 * `slogans` of a hero). Arrays of objects are walked into.
 */
export function collectTranslatableStrings(
  node: unknown,
  path: (string | number)[] = [],
): StringRef[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) =>
      collectTranslatableStrings(item, [...path, index]),
    );
  }

  if (!isPlainObject(node)) return [];

  const refs: StringRef[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;

    if (typeof value === 'string') {
      if (TRANSLATABLE_KEYS.has(key) && value.trim() !== '') {
        refs.push({ path: [...path, key], value });
      }
      continue;
    }

    if (Array.isArray(value)) {
      const allStrings = value.every((item) => typeof item === 'string');

      if (allStrings) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && item.trim() !== '') {
            refs.push({ path: [...path, key, index], value: item });
          }
        });
        continue;
      }

      refs.push(...collectTranslatableStrings(value, [...path, key]));
      continue;
    }

    refs.push(...collectTranslatableStrings(value, [...path, key]));
  }

  return refs;
}

/**
 * Collect every string of a document, whatever its key is.
 *
 * Used for the interface strings of `src/i18n/`, where the keys are the
 * interface of the site and every one of them is written for the reader.
 */
export function collectAllStrings(
  node: unknown,
  path: (string | number)[] = [],
): StringRef[] {
  if (typeof node === 'string') {
    return node.trim() === '' ? [] : [{ path, value: node }];
  }

  if (Array.isArray(node)) {
    return node.flatMap((item, index) => collectAllStrings(item, [...path, index]));
  }

  if (!isPlainObject(node)) return [];

  return Object.entries(node).flatMap(([key, value]) =>
    collectAllStrings(value, [...path, key]),
  );
}

/** Write a value at a path of a document. */
function setAtPath(document: unknown, path: (string | number)[], value: string): void {
  let node = document;

  for (const step of path.slice(0, -1)) {
    if (Array.isArray(node)) {
      node = node[step as number];
    } else if (isPlainObject(node)) {
      node = node[String(step)];
    } else {
      return;
    }

    if (node === undefined) return;
  }

  const last = path[path.length - 1];
  if (last === undefined) return;

  if (Array.isArray(node)) {
    node[last as number] = value;
  } else if (isPlainObject(node)) {
    node[String(last)] = value;
  }
}

/**
 * Write the translations back into a copy of the document.
 *
 * Missing translations leave the original string in place, so a failed batch
 * never corrupts a document.
 */
export function applyTranslations<T>(
  document: T,
  refs: StringRef[],
  translations: readonly string[],
): T {
  const result = structuredClone(document);

  refs.forEach((ref, index) => {
    const translated = translations[index];
    if (translated === undefined || translated.trim() === '') return;

    setAtPath(result, ref.path, translated);
  });

  return result;
}

/**
 * The prompt of the translation.
 *
 * It keeps the rules that matter for a foundation website: the HTML survives,
 * the proper nouns stay, the tone stays institutional.
 */
export function systemPrompt(language: string): string {
  return [
    'You are the professional translator of a non-profit foundation from the',
    'Dominican Republic. You translate website content from Spanish into',
    `${language}.`,
    '',
    'Rules:',
    '- Answer with a JSON object: {"translations": ["…", "…"]}.',
    '- Return exactly one translation per input string, in the same order.',
    '- Keep every HTML tag, Markdown link, image and URL exactly as it is;',
    '  only translate the human-readable text.',
    '- Never translate proper nouns: "Fundación Rosario Gatón", "FRG",',
    '  "República Dominicana", the names of people, places and organisations.',
    '- Keep the register: formal, institutional and warm.',
    '- Keep the length close to the original. Do not add or drop information.',
    '- A string that is already in the target language is returned unchanged.',
    '- Never add a note, an explanation or a translation of the JSON keys.',
  ].join('\n');
}

/** The prompt that asks for the interface strings of the site chrome. */
export function uiPrompt(language: string): string {
  return [
    'You are the professional translator of a non-profit foundation from the',
    'Dominican Republic. You translate the interface strings of its website',
    'from Spanish into',
    `${language}.`,
    '',
    'Rules:',
    '- Answer with a JSON object: {"translations": {"key": "…"}}.',
    '- Use exactly the same keys as the input, with the same nesting.',
    '- Keep the strings short: they are button labels and form labels.',
    '- Never translate proper nouns: "Fundación Rosario Gatón", "FRG".',
  ].join('\n');
}

export interface TranslatorOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** How many strings are sent in one request. */
  batchSize: number;
}

/**
 * A client for an OpenAI-compatible chat completions API.
 *
 * Any provider that speaks the protocol works: OpenAI, Azure OpenAI, Groq,
 * OpenRouter, a local Ollama…
 */
export class Translator {
  readonly #options: TranslatorOptions;

  /** Timestamp of the last request, used to respect the per-minute quota. */
  #lastRequestAt = 0;

  constructor(options: TranslatorOptions) {
    this.#options = options;
  }

  /** Translate a list of strings. The order of the result matches the input. */
  async translate(language: string, strings: string[]): Promise<string[]> {
    if (strings.length === 0) return [];

    const results: string[] = [];

    for (let index = 0; index < strings.length; index += this.#options.batchSize) {
      const batch = strings.slice(index, index + this.#options.batchSize);
      results.push(...(await this.#translateBatch(language, batch)));
    }

    return results;
  }

  /** Translate the interface strings. The result has the shape of the input. */
  async translateTable(
    language: string,
    table: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const refs = collectAllStrings(table);

    const flat = refs.map((ref) => ref.value);
    const translations = await this.translate(language, flat);

    return applyTranslations(table, refs, translations) as Record<string, unknown>;
  }

  async #translateBatch(language: string, strings: string[]): Promise<string[]> {
    const body = {
      model: this.#options.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt(language) },
        { role: 'user', content: JSON.stringify({ strings }) },
      ],
    };

    const answer = await this.#request(body);

    const translations = extractArray(answer);

    if (translations.length !== strings.length) {
      throw new Error(
        `The API returned ${translations.length} translations for ${strings.length} strings.`,
      );
    }

    return translations;
  }

  /** Send one request, with a couple of retries when the API is busy. */
  async #request(body: unknown): Promise<string> {
    const url = `${this.#options.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // Free tiers of OpenAI-compatible providers cap the requests per
        // minute (Gemini's free tier is around 15), so pace the calls:
        // each request waits until the next free slot of the pacer.
        const gap = 4500 - (Date.now() - this.#lastRequestAt);
        if (gap > 0) await delay(gap);
        this.#lastRequestAt = Date.now();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.#options.apiKey}`,
          },
          body: JSON.stringify(body),
          // Never hang forever on a stalled connection.
          signal: AbortSignal.timeout(120_000),
        });

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(
            `${response.status} ${response.statusText}: ${detail.slice(0, 400)}`,
          );
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const content = payload.choices?.[0]?.message?.content;

        if (typeof content !== 'string' || content.trim() === '') {
          throw new Error('The API returned an empty answer.');
        }

        return content;
      } catch (error) {
        lastError = error;

        const message = error instanceof Error ? error.message : '';
        if (message.includes('429')) {
          // Rate limited: the window is a minute, so wait it out.
          await delay(61_000);
        } else {
          await delay(1000 * 2 ** attempt);
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('The translation API could not be reached.');
  }
}

/** Extract the array of translations out of an answer of the API. */
export function extractArray(answer: string): string[] {
  const parsed = parseJson(answer);

  if (Array.isArray(parsed)) return parsed.map(String);

  if (parsed && typeof parsed === 'object') {
    const translations = (parsed as Record<string, unknown>)['translations'];
    if (Array.isArray(translations)) return translations.map(String);
  }

  throw new Error(
    `The API answer is not a list of translations: ${answer.slice(0, 200)}`,
  );
}

/** Extract the object of translations out of an answer of the API. */
export function extractTable(answer: string): Record<string, unknown> {
  const parsed = parseJson(answer);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const translations = (parsed as Record<string, unknown>)['translations'];
    if (
      translations &&
      typeof translations === 'object' &&
      !Array.isArray(translations)
    ) {
      return translations as Record<string, unknown>;
    }

    return parsed as Record<string, unknown>;
  }

  throw new Error(
    `The API answer is not a table of translations: ${answer.slice(0, 200)}`,
  );
}

/**
 * Parse the JSON of an answer.
 *
 * The models like to wrap their answer in a code block, and some of them
 * explain themselves before the JSON. Both are handled here.
 */
export function parseJson(answer: string): unknown {
  const cleaned = answer
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');

    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }

    throw new Error(`The API answer is not valid JSON: ${answer.slice(0, 200)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

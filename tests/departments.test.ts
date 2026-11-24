import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { TEAM_AREAS } from '../src/lib/team.ts';

const root = join(import.meta.dirname, '..', 'src', 'content');
const locales = ['es', 'en', 'fr', 'ja', 'zh-TW'] as const;

function frontmatter(text: string): Record<string, unknown> {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match?.[1] === undefined ? {} : (parse(match[1]) as Record<string, unknown>);
}

/** The areas of a locale that have at least one director. */
async function areasWithDirectors(locale: string): Promise<Set<string>> {
  const dir = join(root, locale, 'team');
  const areas = new Set<string>();

  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.md'))) {
    const { group, area } = frontmatter(await readFile(join(dir, file), 'utf8'));
    if (group === 'direccion' && typeof area === 'string') areas.add(area);
  }

  return areas;
}

/** The `departments` block of the home page of a locale. */
async function departmentsBlock(locale: string) {
  const page = frontmatter(
    await readFile(join(root, locale, 'pages', 'inicio.md'), 'utf8'),
  );
  const blocks = (page['blocks'] ?? []) as { type?: string; areas?: unknown }[];
  const block = blocks.find((item) => item.type === 'departments');

  return (block?.areas ?? []) as {
    name?: string;
    area: string;
    description?: string;
  }[];
}

describe('departments of the home page', () => {
  it.each(locales)('%s: every area with directors is shown', async (locale) => {
    const listed = new Set((await departmentsBlock(locale)).map((item) => item.area));

    expect(listed.size, `${locale} departments block`).toBeGreaterThan(0);

    for (const area of await areasWithDirectors(locale)) {
      expect(
        listed.has(area),
        `${locale}: the area "${area}" has directors but is missing from the departments block in pages/inicio.md`,
      ).toBe(true);
    }
  });

  it.each(locales)(
    '%s: each department has a name and a description',
    async (locale) => {
      for (const { area, name, description } of await departmentsBlock(locale)) {
        expect(name?.trim(), `${locale}: "${area}" needs a name`).toBeTruthy();
        expect(
          description?.trim(),
          `${locale}: "${area}" needs a description`,
        ).toBeTruthy();
      }
    },
  );

  it.each(locales)('%s: lists each area once and only known areas', async (locale) => {
    const areas = (await departmentsBlock(locale)).map((item) => item.area);

    expect(new Set(areas).size, `${locale}: repeated area`).toBe(areas.length);
    for (const area of areas) {
      expect(TEAM_AREAS as readonly string[], `${locale}: unknown area`).toContain(
        area,
      );
    }
  });
});

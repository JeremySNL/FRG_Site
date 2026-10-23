import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockTypes } from '../src/lib/blocks.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The TypeScript block model (`src/lib/blocks.ts`) and the Zod schema that
 * validates the content (`src/content.config.ts`) must describe the same set
 * of block types. One of them drifts and the importer or the renderer starts
 * emitting blocks that the other side doesn't know about.
 */

/** Extract the literal block types from the Zod schema in content.config.ts. */
async function blockTypesFromSchema(): Promise<Set<string>> {
  const source = await readFile(join(root, 'src/content.config.ts'), 'utf8');

  const types = new Set<string>();

  // The schema uses `z.literal('hero')` for every block type.
  for (const match of source.matchAll(/z\.literal\('([^']+)'\)/g)) {
    const type = match[1];
    if (type) types.add(type);
  }

  return types;
}

describe('the blocks', () => {
  it('match between the TypeScript types and the Zod schema', async () => {
    const fromTs = new Set(blockTypes as readonly string[]);
    const fromZod = await blockTypesFromSchema();

    const missingFromSchema = [...fromTs].filter((type) => !fromZod.has(type));
    const missingFromTs = [...fromZod].filter((type) => !fromTs.has(type));

    expect(missingFromSchema, 'missing from src/content.config.ts').toEqual([]);
    expect(missingFromTs, 'missing from src/lib/blocks.ts').toEqual([]);
  });

  it('are in a stable order', () => {
    expect(blockTypes[0]).toBe('hero');
    expect(blockTypes[blockTypes.length - 1]).toBe('contactSection');
    expect(blockTypes.length).toBe(23);
  });

  it('cover the pages of the site', async () => {
    const pages = [
      'src/content/es/pages/inicio.md',
      'src/content/es/pages/nosotros.md',
      'src/content/es/pages/programas-y-proyectos.md',
      'src/content/es/pages/donar.md',
      'src/content/es/pages/contacto.md',
      'src/content/es/pages/voluntariado.md',
    ];

    for (const page of pages) {
      const source = await readFile(join(root, page), 'utf8');
      expect(source, `${page} must use blocks`).toContain('blocks:');
    }
  });
});

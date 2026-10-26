import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { collectMarkdownMediaReferences } from '../scripts/lib/media.ts';

const unavailableMediaKeys = new Set([
  '2025/07/101488525_2767073546725135_2083792723269124096_n.jpg',
  '2025/07/104938712_2823194207779735_8307978794557302217_n.jpg',
  '2025/07/105568282_2834383836660772_4705949025788254040_n-e1752508548670.jpg',
  '2025/07/105894358_2835312003234622_4467705399826361600_n.jpg',
  '2025/07/118761928_3023846601047827_437596050276805905_n.jpg',
  '2025/07/308990619_177982108128034_4272015722118422953_n.png',
  '2025/07/79423162_2415073045258522_1062685023401934848_n.jpg',
  '2025/07/82007448_2469423386490154_1855992575626838016_n.png',
  '2025/07/92240935_2656985761067248_247457280948174848_n.jpg',
  '2025/07/99436496_2754372934661863_6520981281386266624_n.jpg',
]);

async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)));
    } else if (entry.name.endsWith('.md')) {
      files.push(path);
    }
  }

  return files;
}

it('does not reference media assets confirmed missing at the source', async () => {
  const references = new Set<string>();
  const files = await markdownFiles(join(process.cwd(), 'src', 'content'));

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const key of collectMarkdownMediaReferences(source).own) {
      references.add(key);
    }
  }

  expect([...references].filter((key) => unavailableMediaKeys.has(key))).toEqual([]);
});

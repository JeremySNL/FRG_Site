import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const promptFile = join(root, 'POST_AUTHORING_PROMPT.md');

/**
 * The authoring prompt hardcodes the accepted category and tag slugs, because
 * the writing assistant cannot read the repository. That list drifts silently
 * the moment a taxonomy file is added, and the assistant would then be told to
 * use a slug that does not exist (or to skip one that does). These tests keep
 * the prompt and the Spanish taxonomy in sync.
 */

const BULLET_SLUG = /^- `([a-z0-9-]+)`/;

/** The slugs listed under a `## <heading>` section of the prompt. */
function sectionSlugs(prompt: string, heading: string): string[] {
  const start = prompt.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`The prompt has no "${heading}" section.`);

  const rest = prompt.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  const body = end < 0 ? rest : rest.slice(0, end);

  return body
    .split(/\r?\n/)
    .map((line) => BULLET_SLUG.exec(line.trim())?.[1])
    .filter((slug): slug is string => Boolean(slug));
}

/** The `slug` declared in the frontmatter of every file of a taxonomy. */
async function frontmatterSlugs(directory: string): Promise<string[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md'));
  const slugs: string[] = [];

  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
    const slug = /^slug:\s*"?([^"\r\n]+)"?\s*$/m.exec(frontmatter)?.[1]?.trim();
    if (slug) slugs.push(slug);
  }

  return slugs.sort();
}

describe('authoring prompt', () => {
  it('lists every existing category and nothing else', async () => {
    const prompt = await readFile(promptFile, 'utf8');
    const documented = sectionSlugs(prompt, 'Categorías existentes').sort();
    const existing = await frontmatterSlugs(
      join(root, 'src', 'content', 'es', 'categories'),
    );

    expect(documented).toEqual(existing);
  });

  it('lists every existing tag and nothing else', async () => {
    const prompt = await readFile(promptFile, 'utf8');
    const documented = sectionSlugs(prompt, 'Etiquetas existentes').sort();
    const existing = await frontmatterSlugs(join(root, 'src', 'content', 'es', 'tags'));

    expect(documented).toEqual(existing);
  });

  it('documents the video field instead of forbidding video', async () => {
    const prompt = await readFile(promptFile, 'utf8');

    // Posts render `videoUrl` through the click-to-load facade in PostView.
    expect(prompt).toContain('`videoUrl`');
    expect(prompt).not.toContain('no tienen un embed de video verificado');
  });
});

/**
 * Regression gate for the generated locale content.
 *
 * `npm run translate` writes full mirrors of the Spanish content for every
 * locale. These checks pin the invariants that make those mirrors safe to
 * serve: same collection shape, identity fields untouched, and no string
 * silently left untranslated where a translation is expected.
 *
 * Intentionally NOT here: the post bodies of posts older than POSTS_SINCE
 * (the translator skips them by design) and documents flagged
 * `noAutoTranslate` in the Spanish source.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { proseLetters, stripLocaleIndependent } from '../scripts/lib/translate.ts';
import { expect, it } from 'vitest';

const root = process.cwd();
const contentDir = join(root, 'src', 'content');
const i18nDir = join(root, 'src', 'i18n');

const LOCALES = ['en', 'fr', 'ja', 'zh-TW'];
const COLLECTIONS = ['pages', 'posts', 'categories', 'tags', 'programs', 'team'];

/** Posts published before this year are not translated (translator rule). */
const POSTS_SINCE = '2025-01-01';

/**
 * Documents whose translated title may equal the Spanish source, keyed as
 * `collection/name` so a future document with the same file name in another
 * collection cannot silently escape the check: the entity proper noun and
 * the person name of the founder-adjacent tag are kept as is.
 */
const TITLE_EXCEPTIONS = new Set([
  // Proper nouns that stay as is in every locale.
  'tags/fundacion-rosario-gaton.md',
  'pages/interlatitudes-medicos.md',
  'tags/dr-cruz-jiminian.md',
]);

/** Contact data that must survive every locale byte-identical, per page. */
const CONTACT = ['(809) 290-2255', 'info@fundacionrosariogaton.org'];
const CONTACTO_CONTACT = ['(829) 649-3189', 'info@fundacionrosariogaton.org'];

/** Per-page contact data that must survive every locale byte-identical. */
const CONTACT_PAGES: Record<string, string[]> = {
  donar: CONTACT,
  voluntariado: CONTACT,
  contacto: CONTACTO_CONTACT,
};

interface Doc {
  data: Record<string, unknown>;
  body: string;
}

function parseDoc(source: string): Doc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match?.[1]) throw new Error(`no frontmatter: ${source.slice(0, 60)}`);
  return { data: parseYaml(match[1]) as Record<string, unknown>, body: match[2] ?? '' };
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md'));
}

it('generated locales mirror the Spanish content with their identity fields intact', () => {
  const defects: string[] = [];

  for (const locale of LOCALES) {
    const localeDir = join(contentDir, locale);

    if (!existsSync(localeDir)) {
      defects.push(`${locale}: content directory is missing entirely`);
      continue;
    }

    for (const collection of COLLECTIONS) {
      const sourceDir = join(contentDir, 'es', collection);
      if (!existsSync(sourceDir)) continue;

      for (const name of listJson(sourceDir)) {
        const source = parseDoc(
          readFileSync(join(contentDir, 'es', collection, name), 'utf8'),
        );

        if (source.data['noAutoTranslate'] === true) continue;
        if (collection === 'posts' && String(source.data['date'] ?? '') < POSTS_SINCE) {
          continue;
        }

        const target = join(contentDir, locale, collection, name);

        if (!existsSync(target)) {
          defects.push(`${locale}/${collection}/${name}: file is missing`);
          continue;
        }

        const generated = parseDoc(readFileSync(target, 'utf8'));

        if (generated.data['locale'] !== locale) {
          defects.push(
            `${locale}/${collection}/${name}: wrong locale "${generated.data['locale']}"`,
          );
        }
        if (generated.data['slug'] !== source.data['slug']) {
          defects.push(`${locale}/${collection}/${name}: slug drifted`);
        }
        if (
          'legacyPath' in source.data &&
          generated.data['legacyPath'] !== source.data['legacyPath']
        ) {
          defects.push(`${locale}/${collection}/${name}: legacyPath drifted`);
        }
        if (collection === 'posts' && generated.data['date'] !== source.data['date']) {
          defects.push(`${locale}/posts/${name}: date drifted`);
        }
        if (
          collection === 'posts' &&
          JSON.stringify(generated.data['categories'] ?? null) !==
            JSON.stringify(source.data['categories'] ?? null)
        ) {
          defects.push(`${locale}/posts/${name}: categories drifted`);
        }
        if (
          'image' in source.data &&
          generated.data['image'] !== source.data['image']
        ) {
          defects.push(`${locale}/${collection}/${name}: image path drifted`);
        }

        const key = `${collection}/${name}`;
        const checkable = ['pages', 'posts', 'categories', 'tags', 'programs'];

        if (
          checkable.includes(collection) &&
          !TITLE_EXCEPTIONS.has(key) &&
          generated.data['title'] === source.data['title']
        ) {
          defects.push(`${locale}/${collection}/${name}: title was not translated`);
        }

        const sourceExcerpt = String(source.data['excerpt'] ?? '');
        if (
          checkable.includes(collection) &&
          proseLetters(stripLocaleIndependent(sourceExcerpt)).length >= 30 &&
          String(generated.data['excerpt'] ?? '') === sourceExcerpt
        ) {
          defects.push(`${locale}/${collection}/${name}: excerpt was not translated`);
        }

        // A full body that still equals the Spanish source (ignoring URLs
        // and images, which are locale-independent) is a half-done mirror
        // of the kind a crashed translation batch used to leave behind.
        const sourceBody = proseLetters(stripLocaleIndependent(source.body));
        if (
          ['posts', 'pages'].includes(collection) &&
          sourceBody.length >= 40 &&
          proseLetters(stripLocaleIndependent(generated.body)) === sourceBody
        ) {
          defects.push(`${locale}/${collection}/${name}: body was not translated`);
        }

        if (
          collection === 'team' &&
          String(generated.data['role'] ?? '') !== '' &&
          generated.data['role'] === source.data['role']
        ) {
          defects.push(`${locale}/team/${name}: role was not translated`);
        }
      }
    }

    // The contact card data must be identical in every locale.
    for (const [slug, expected] of Object.entries(CONTACT_PAGES)) {
      const file = join(contentDir, locale, 'pages', `${slug}.md`);
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, 'utf8');
      for (const value of expected) {
        if (!raw.includes(value)) {
          defects.push(`${locale}/pages/${slug}.md: contact "${value}" was altered`);
        }
      }
    }
  }

  expect(defects, defects.join('\n')).toEqual([]);
});

it('localizes the G7 post dateline in English and French', () => {
  const post =
    'fundacion-rosario-gaton-sostiene-encuentro-con-representante-del-g7-de-argentina-y-autoridades-dominicanas-del-sector-agricola.md';
  const english = parseDoc(readFileSync(join(contentDir, 'en', 'posts', post), 'utf8'));
  const french = parseDoc(readFileSync(join(contentDir, 'fr', 'posts', post), 'utf8'));

  expect(english.data['excerpt']).toMatch(/^Santo Domingo, Dominican Republic\./);
  expect(english.body).toContain('**Santo Domingo, Dominican Republic.**');
  expect(french.data['excerpt']).toMatch(/^Santo Domingo, République dominicaine\./);
  expect(french.body).toContain('**Santo Domingo, République dominicaine.**');
});

it('uses the English Programas y Proyectos hero image in every locale', () => {
  const page = 'programas-y-proyectos.md';
  const heroImage = (locale: string): unknown => {
    const document = parseDoc(
      readFileSync(join(contentDir, locale, 'pages', page), 'utf8'),
    );
    const blocks = document.data['blocks'] as Array<Record<string, unknown>>;
    return blocks.find((block) => block['type'] === 'hero')?.['image'];
  };

  const expected = 'programs/educacion-y-formacion-ciudadana/cover.webp';

  expect(heroImage('en')).toBe(expected);
  for (const locale of LOCALES) {
    expect(heroImage(locale), `${locale}/pages/${page}`).toBe(expected);
  }
});

it('keeps audited English translations free of Spanish leftovers', () => {
  const foodPost = readFileSync(
    join(
      contentDir,
      'en',
      'posts',
      'fundacion-rosario-gaton-continua-llevando-esperanza-a-familias-vulnerables-con-entrega-de-alimentos.md',
    ),
    'utf8',
  );
  const sierraLeonePost = readFileSync(
    join(
      contentDir,
      'en',
      'posts',
      'embajador-florentino-rodriguez-y-su-equipo-llevan-ayuda-humanitaria-a-comunidades-vulnerables-en-sierra-leona.md',
    ),
    'utf8',
  );
  const home = readFileSync(join(contentDir, 'en', 'pages', 'inicio.md'), 'utf8');
  const about = readFileSync(join(contentDir, 'en', 'pages', 'nosotros.md'), 'utf8');

  expect(foodPost).not.toContain('La Fundación Rosario Gatón (FRG) continues');
  expect(foodPost).not.toContain('La FRG reaffirms');
  expect(sierraLeonePost).toContain('**Sierra Leone – West Africa.**');
  expect(home).toContain('label: "Years since founding"');
  expect(about).toContain('label: "Years since founding"');
});

it('corrects audited French translation remnants and agreement', () => {
  const kamila = readFileSync(
    join(contentDir, 'fr', 'posts', 'kamila-remires-espinosa-extirpacion-de-mioma.md'),
    'utf8',
  );
  const khulna = readFileSync(
    join(
      contentDir,
      'fr',
      'posts',
      'filial-de-la-fundacion-rosario-gaton-en-khulna-bangladesh-entrega-alimentos-a-personas-en-situacion-de-vulnerabilidad.md',
    ),
    'utf8',
  );
  const solidarity = readFileSync(
    join(
      contentDir,
      'fr',
      'posts',
      'fundacion-rosario-gaton-y-dr-cruz-jiminian-solidaridad-en-accion.md',
    ),
    'utf8',
  );
  const awards = readFileSync(
    join(
      contentDir,
      'fr',
      'posts',
      'la-fundacion-rosario-gaton-es-galardonada-en-los-csr-awards-2026-por-acquisition-international.md',
    ),
    'utf8',
  );
  const about = readFileSync(join(contentDir, 'fr', 'pages', 'nosotros.md'), 'utf8');
  const pressRelease = readFileSync(
    join(contentDir, 'fr', 'posts', 'comunicado-oficial-nota-de-prensa.md'),
    'utf8',
  );
  const donationPage = readFileSync(
    join(contentDir, 'fr', 'pages', 'donar.md'),
    'utf8',
  );
  const volunteerPage = readFileSync(
    join(contentDir, 'fr', 'pages', 'voluntariado.md'),
    'utf8',
  );

  expect(kamila).not.toContain('posibles complicaciones');
  expect(kamila).toContain('possibles complications cancéreuses');
  expect(khulna).not.toContain('la dignidad humana');
  expect(solidarity).toContain('ont uni leurs efforts');
  expect(solidarity).not.toContain('ont unie leurs efforts');
  expect(awards).toContain(
    'La Fundación Rosario Gatón et le Dr. Cruz Jiminián unissent leurs efforts pour renforcer les actions sociales',
  );
  expect(about).toContain('text: "Présidente"');
  expect(pressRelease).toContain("haute fonctionnaire d'État");
  expect(pressRelease).not.toContain('rang ministériel');
  expect(donationPage).toContain('À quoi destinons-nous votre don ?');
  expect(volunteerPage).toContain('À quoi destinons-nous votre don ?');
});

it('uses consistent and natural Japanese wording for audited content', () => {
  const meeting = readFileSync(
    join(
      contentDir,
      'ja',
      'posts',
      'encuentro-amistoso-con-el-ex-ministro-de-agricultura.md',
    ),
    'utf8',
  );
  const home = readFileSync(join(contentDir, 'ja', 'pages', 'inicio.md'), 'utf8');
  const about = readFileSync(join(contentDir, 'ja', 'pages', 'nosotros.md'), 'utf8');
  const contact = readFileSync(join(contentDir, 'ja', 'pages', 'contacto.md'), 'utf8');
  const solidarity = readFileSync(
    join(
      contentDir,
      'ja',
      'posts',
      'fundacion-rosario-gaton-y-dr-cruz-jiminian-solidaridad-en-accion.md',
    ),
    'utf8',
  );
  const ui = JSON.parse(readFileSync(join(i18nDir, 'ja.json'), 'utf8')) as {
    ambassadorGeneralRole: string;
  };

  expect(meeting).toContain('サンティアゴ・デ・ロス・カバジェーロス');
  expect(meeting).not.toContain('カ巴');
  expect(home).toContain('República Dominicanaに駐在するグアテマラ大使');
  expect(home).not.toContain('在 República Dominicana');
  expect(home).not.toContain('調整中');
  expect(home).not.toContain('コンチネンタル・アンバサダー');
  expect(home).toContain('role: "大陸総大使"');
  expect(about).toContain('人間味あふれる');
  expect(about).toContain('五大陸');
  expect(about).not.toContain('人間味的');
  expect(about).not.toContain('5大洲');
  expect(contact).toContain('title: "所在地"');
  expect(solidarity).toContain('Fundación Rosario GatónとDr. Cruz Jiminiánの連帯活動');
  expect(solidarity).not.toContain('Fundación Rosario Gatón y Dr. Cruz Jiminián');
  expect(ui.ambassadorGeneralRole).toBe('大陸総大使');
});

it('corrects audited Traditional Chinese mistranslations', () => {
  const volunteerPage = readFileSync(
    join(contentDir, 'zh-TW', 'pages', 'voluntariado.md'),
    'utf8',
  );
  const foodPost = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'fundacion-rosario-gaton-continua-llevando-esperanza-a-familias-vulnerables-con-entrega-de-alimentos.md',
    ),
    'utf8',
  );
  const agriculturePost = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'fundacion-rosario-gaton-sostiene-encuentro-con-representante-del-g7-de-argentina-y-autoridades-dominicanas-del-sector-agricola.md',
    ),
    'utf8',
  );
  const kamila = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'kamila-remires-espinosa-extirpacion-de-mioma.md',
    ),
    'utf8',
  );
  const firefighterPost = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'reconocimiento-al-general-de-los-bomberos-de-estados-unidos-juan-gutierrez.md',
    ),
    'utf8',
  );
  const sierraLeonePost = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'embajador-florentino-rodriguez-y-su-equipo-llevan-ayuda-humanitaria-a-comunidades-vulnerables-en-sierra-leona.md',
    ),
    'utf8',
  );

  expect(volunteerPage).toContain('在各項志工服務日、活動與工作計畫中擔任志工');
  expect(volunteerPage).not.toContain('日營');
  expect(volunteerPage).not.toContain('節慶');
  expect(foodPost).toContain('**Fundación Rosario Gatón (FRG)**');
  expect(foodPost).not.toContain('La **Fundación Rosario Gatón');
  expect(agriculturePost).toContain('多明尼加共和國農業部門主任');
  expect(agriculturePost).not.toContain('農業部部長');
  expect(kamila).toContain('可能出現與癌症相關的併發症');
  expect(kamila).not.toContain('癌前病變');
  expect(firefighterPost).toContain('大陸總局長');
  expect(firefighterPost).not.toContain('美洲大陸總局長');
  expect(sierraLeonePost).toContain('塞拉利昂');
  expect(sierraLeonePost).not.toContain('Sierra Leona');
});

it('corrects weekdays in the Spanish source and translated copies', () => {
  const julySpanish = readFileSync(
    join(
      contentDir,
      'es',
      'posts',
      'reunion-con-el-dr-cruz-jiminian-proyectos-2025.md',
    ),
    'utf8',
  );
  const julyJapanese = readFileSync(
    join(
      contentDir,
      'ja',
      'posts',
      'reunion-con-el-dr-cruz-jiminian-proyectos-2025.md',
    ),
    'utf8',
  );
  const novemberSpanish = readFileSync(
    join(contentDir, 'es', 'posts', 'encuentro-con-embajador-de-comercio-de-china.md'),
    'utf8',
  );
  const novemberJapanese = readFileSync(
    join(contentDir, 'ja', 'posts', 'encuentro-con-embajador-de-comercio-de-china.md'),
    'utf8',
  );
  const novemberChinese = readFileSync(
    join(
      contentDir,
      'zh-TW',
      'posts',
      'encuentro-con-embajador-de-comercio-de-china.md',
    ),
    'utf8',
  );

  expect(julySpanish).toContain('viernes 4 de julio del presente año 2025');
  expect(julyJapanese).toContain('2025年7月4日（金）');
  expect(novemberSpanish).toContain('martes 18 de noviembre');
  expect(novemberJapanese).toContain('11月18日（火）');
  expect(novemberChinese).toContain('11月18日星期二');
});

/** Flatten an object into "dotted.path" string leaves. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      for (const [path, leaf] of flatten(inner, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, leaf);
      }
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

it('every locale has a complete i18n table with no Spanish leftovers', () => {
  const defects: string[] = [];
  const source = flatten(JSON.parse(readFileSync(join(i18nDir, 'es.json'), 'utf8')));

  for (const locale of LOCALES) {
    const file = join(i18nDir, `${locale}.json`);

    if (!existsSync(file)) {
      defects.push(`i18n/${locale}.json is missing`);
      continue;
    }

    const table = flatten(JSON.parse(readFileSync(file, 'utf8')));

    for (const [path, value] of source) {
      const translated = table.get(path);
      if (translated === undefined) {
        defects.push(`i18n/${locale}.json: missing key "${path}"`);
        continue;
      }
      if (translated === '') {
        defects.push(`i18n/${locale}.json: empty value at "${path}"`);
        continue;
      }
      if (translated === value) {
        defects.push(`i18n/${locale}.json: string "${path}" equals the Spanish source`);
      }
    }
  }

  expect(defects, defects.join('\n')).toEqual([]);
});

import { describe, expect, it } from 'vitest';

import {
  baselineFromHistory,
  completeLocaleSync,
  effectiveBaseline,
  parseMarkdownDocument,
  parseSyncArgs,
  planLocaleSync,
  stringsToTranslate,
  type MarkdownDocument,
} from '../scripts/lib/locale-sync.ts';

/**
 * `sync:locales` rebuilds a translated page from the current Spanish page and
 * reuses a translation only when its Spanish text is unchanged since the copy
 * was made. The fixtures follow the home page edits that motivated it: the
 * continents were reordered, America gained a general and a country
 * ambassador, Mexico left the open seats, and a photo got a new key.
 */

const jabir = {
  name: 'Mr. Jabir',
  country: 'Nigeria',
  role: 'Embajador General Continental',
  image: 'team/jabir.webp',
};

/** The Spanish page the French copy was translated from. */
const baseline: MarkdownDocument = {
  data: {
    title: 'Inicio',
    slug: 'inicio',
    locale: 'es',
    blocks: [
      {
        type: 'ambassadors',
        title: 'Embajadores de Buena Voluntad',
        continents: [
          {
            name: 'África',
            generalAmbassador: jabir,
            ambassadors: [],
            openCountries: ['Marruecos', 'Kenia'],
          },
          {
            name: 'América',
            ambassadors: [],
            openCountries: ['República Dominicana', 'México', 'Colombia'],
          },
        ],
      },
      {
        type: 'contactSection',
        address: 'República Dominicana',
        buttons: [{ label: 'Donar', href: '/donar/' }],
      },
    ],
  },
  body: 'Párrafo uno.\n\nPárrafo dos.',
};

/** The French copy, including a hand-corrected title. */
const copy: MarkdownDocument = {
  data: {
    title: 'Accueil (corrigé à la main)',
    slug: 'inicio',
    locale: 'fr',
    blocks: [
      {
        type: 'ambassadors',
        title: 'Ambassadeurs de Bonne Volonté',
        continents: [
          {
            name: 'Afrique',
            generalAmbassador: {
              name: 'Mr. Jabir',
              country: 'Nigeria',
              role: 'Ambassadeur Général Continental',
              image: 'team/jabir.webp',
            },
            ambassadors: [],
            openCountries: ['Maroc', 'Kenya'],
          },
          {
            name: 'Amérique',
            ambassadors: [],
            openCountries: ['République dominicaine', 'Mexique', 'Colombie'],
          },
        ],
      },
      {
        // Values the translator never touches, localized in the copy by hand.
        type: 'contactSection',
        address: 'République dominicaine',
        buttons: [{ label: 'Faire un don', href: '/fr/donar/' }],
      },
    ],
  },
  body: 'Paragraphe un.\n\nParagraphe deux.',
};

const sync = (current: MarkdownDocument) =>
  planLocaleSync({ current, baseline, copy, locale: 'fr' });

/** Translate by tagging, so a test can tell a fresh translation from a reused one. */
const fakeTranslate = (strings: string[]): string[] =>
  strings.map((text) => `[fr] ${text}`);

const withData = (data: Record<string, unknown>): MarkdownDocument => ({
  data,
  body: baseline.body,
});

describe('planLocaleSync', () => {
  it('keeps the copy exactly as it is when the Spanish page did not change', () => {
    const plan = sync(baseline);

    expect(stringsToTranslate(plan)).toEqual([]);
    expect(completeLocaleSync(plan, [])).toEqual(copy);
  });

  it('translates only an edited sentence and keeps every other translation', () => {
    const plan = sync(withData({ ...baseline.data, title: 'Portada' }));

    expect(stringsToTranslate(plan)).toEqual(['Portada']);

    const result = completeLocaleSync(plan, fakeTranslate(stringsToTranslate(plan)));
    expect(result.data['title']).toBe('[fr] Portada');
    expect(result.data['blocks']).toEqual(copy.data['blocks']);
  });

  it('follows reordered and edited items and sends only the new strings', () => {
    const current = withData({
      ...baseline.data,
      blocks: [
        {
          type: 'ambassadors',
          title: 'Embajadores de Buena Voluntad',
          continents: [
            {
              name: 'América',
              generalAmbassador: {
                name: 'Dr. Alejandra',
                country: 'Estados Unidos',
                role: 'Embajadora General Continental',
                image: 'team/alejandra.webp',
              },
              ambassadors: [
                {
                  name: 'Rodolfo',
                  country: 'México',
                  role: 'Embajador Mexicano',
                  image: 'team/rodolfo.webp',
                },
              ],
              openCountries: ['República Dominicana', 'Colombia'],
            },
            {
              name: 'África',
              generalAmbassador: jabir,
              ambassadors: [],
              openCountries: ['Marruecos', 'Kenia'],
            },
          ],
        },
      ],
    });

    const plan = sync(current);

    expect(stringsToTranslate(plan)).toEqual([
      'Dr. Alejandra',
      'Estados Unidos',
      'Embajadora General Continental',
      'Rodolfo',
      'México',
      'Embajador Mexicano',
    ]);

    const result = completeLocaleSync(plan, fakeTranslate(stringsToTranslate(plan)));
    const [block] = result.data['blocks'] as Array<{ continents: unknown[] }>;
    const copyBlock = (copy.data['blocks'] as Array<{ continents: unknown[] }>)[0];

    expect(block?.continents[0]).toEqual({
      name: 'Amérique',
      generalAmbassador: {
        name: '[fr] Dr. Alejandra',
        country: '[fr] Estados Unidos',
        role: '[fr] Embajadora General Continental',
        image: 'team/alejandra.webp',
      },
      ambassadors: [
        {
          name: '[fr] Rodolfo',
          country: '[fr] México',
          role: '[fr] Embajador Mexicano',
          image: 'team/rodolfo.webp',
        },
      ],
      openCountries: ['République dominicaine', 'Colombie'],
    });
    expect(block?.continents[1]).toEqual(copyBlock?.continents[0]);
  });

  it('keeps localized links and hand edits of the copy that Spanish did not change', () => {
    const plan = sync(withData({ ...baseline.data, title: 'Portada' }));
    const result = completeLocaleSync(plan, ['Couverture']);
    const blocks = result.data['blocks'] as unknown[];

    expect(blocks[1]).toEqual({
      type: 'contactSection',
      address: 'République dominicaine',
      buttons: [{ label: 'Faire un don', href: '/fr/donar/' }],
    });
  });

  it('copies changed images and other untranslated values from the Spanish page', () => {
    const current = structuredClone(baseline);
    const blocks = current.data['blocks'] as Array<{
      continents: Array<{ generalAmbassador?: { image: string } }>;
    }>;
    const africa = blocks[0]?.continents[0]?.generalAmbassador;
    if (africa) africa.image = 'team/jabir-v2.webp';

    const plan = sync(current);
    const result = completeLocaleSync(plan, []);

    expect(stringsToTranslate(plan)).toEqual([]);
    expect(JSON.stringify(result.data)).toContain('team/jabir-v2.webp');
    expect(JSON.stringify(result.data)).not.toContain('team/jabir.webp');
  });

  it('writes the target locale into the copy', () => {
    const plan = sync(withData({ ...baseline.data, title: 'Portada' }));

    expect(completeLocaleSync(plan, ['Couverture']).data['locale']).toBe('fr');
  });

  it('translates only the edited paragraph of the body', () => {
    const plan = sync({ data: baseline.data, body: 'Párrafo uno.\n\nPárrafo nuevo.' });

    expect(stringsToTranslate(plan)).toEqual(['Párrafo nuevo.']);
    expect(completeLocaleSync(plan, ['Nouveau paragraphe.']).body).toBe(
      'Paragraphe un.\n\nNouveau paragraphe.',
    );
  });

  it('translates the whole body when the copy no longer lines up with its source', () => {
    const plan = planLocaleSync({
      current: { data: baseline.data, body: 'Párrafo uno.\n\nPárrafo nuevo.' },
      baseline,
      copy: { data: copy.data, body: 'Un seul paragraphe.' },
      locale: 'fr',
    });

    expect(stringsToTranslate(plan)).toEqual(['Párrafo uno.', 'Párrafo nuevo.']);
  });

  it('treats a Spanish file saved with Windows line endings as unchanged', () => {
    const toFile = (document: MarkdownDocument): string =>
      `---\ntitle: "${String(document.data['title'])}"\nslug: "inicio"\n---\n${document.body}\n`;

    const plan = planLocaleSync({
      current: parseMarkdownDocument(toFile(baseline).replace(/\n/g, '\r\n')),
      baseline: parseMarkdownDocument(toFile(baseline)),
      copy: parseMarkdownDocument(toFile(copy)),
      locale: 'fr',
    });

    expect(stringsToTranslate(plan)).toEqual([]);
    expect(completeLocaleSync(plan, []).body).toBe(`${copy.body}\n`);
  });

  it('translates everything when the source of the copy is unknown', () => {
    const plan = planLocaleSync({
      current: baseline,
      baseline: undefined,
      copy,
      locale: 'fr',
    });

    // 13 frontmatter strings and the 2 paragraphs of the body.
    expect(stringsToTranslate(plan)).toHaveLength(15);
  });
});

describe('parseSyncArgs', () => {
  it('previews every locale by default', () => {
    expect(parseSyncArgs([])).toEqual({
      write: false,
      locales: ['en', 'fr', 'ja', 'zh-TW'],
    });
  });

  it('accepts --write with one or several locales', () => {
    expect(parseSyncArgs(['--write', '--locale', 'fr'])).toEqual({
      write: true,
      locales: ['fr'],
    });
    expect(parseSyncArgs(['--locales', 'en, ja'])).toEqual({
      write: false,
      locales: ['en', 'ja'],
    });
  });

  it('rejects a locale option without a value instead of running every locale', () => {
    expect(parseSyncArgs(['--write', '--locale'])).toEqual({
      error: '--locale requires a locale.',
    });
    expect(parseSyncArgs(['--locales', '--write'])).toEqual({
      error: '--locales requires a comma-separated locale list.',
    });
  });

  it('rejects both locale options, unknown locales, options and stray words', () => {
    expect(parseSyncArgs(['--locale', 'en', '--locales', 'fr'])).toEqual({
      error: 'Use either --locale or --locales, not both.',
    });
    expect(parseSyncArgs(['--locale', 'de'])).toEqual({
      error: 'Unknown locale "de". Available: en, fr, ja, zh-TW.',
    });
    expect(parseSyncArgs(['--wrte'])).toEqual({
      error: 'Unknown option --wrte. Run with --help.',
    });
    expect(parseSyncArgs(['en'])).toEqual({
      error: 'Unexpected argument "en". Run with --help.',
    });
  });
});

describe('effectiveBaseline', () => {
  /** The copy with a hand fix that has nothing to do with the Spanish edit. */
  const handFixed = (): MarkdownDocument => {
    const fixed = structuredClone(copy);
    const blocks = fixed.data['blocks'] as Array<{
      continents: Array<{ generalAmbassador?: { role: string } }>;
    }>;
    const africa = blocks[0]?.continents[0]?.generalAmbassador;
    if (africa) africa.role = 'Ambassadeur général continental';
    return fixed;
  };

  /** America gains a country ambassador in Spanish. */
  const withRodolfo = (document: MarkdownDocument, role: string): MarkdownDocument => {
    const next = structuredClone(document);
    const blocks = next.data['blocks'] as Array<{
      continents: Array<{ ambassadors: unknown[] }>;
    }>;
    blocks[0]?.continents[1]?.ambassadors.push({
      name: 'Rodolfo',
      role,
      image: 'team/r.webp',
    });
    return next;
  };

  /** Plan the copy after a commit that touched both the Spanish page and the copy. */
  const planAfterCommit = (spanish: MarkdownDocument, copyAfter: MarkdownDocument) =>
    planLocaleSync({
      current: spanish,
      baseline: effectiveBaseline({
        sourceBefore: baseline,
        source: spanish,
        copyBefore: copy,
        copy: copyAfter,
      }),
      copy: copyAfter,
      locale: 'fr',
    });

  const retitled = withData({ ...baseline.data, title: 'Portada' });

  it('propagates a Spanish edit committed together with an unrelated hand fix', () => {
    const plan = planAfterCommit(retitled, handFixed());

    expect(stringsToTranslate(plan)).toEqual(['Portada']);
    expect(JSON.stringify(completeLocaleSync(plan, ['Couverture']).data)).toContain(
      'Ambassadeur général continental',
    );
  });

  it('keeps a translation that was updated in the same commit as its Spanish text', () => {
    const translated = { ...copy, data: { ...copy.data, title: 'Couverture' } };
    const plan = planAfterCommit(retitled, translated);

    expect(stringsToTranslate(plan)).toEqual([]);
    expect(completeLocaleSync(plan, []).data['title']).toBe('Couverture');
  });

  it('trusts a copy that already follows a new item added in the same commit', () => {
    const plan = planAfterCommit(
      withRodolfo(baseline, 'Embajador'),
      withRodolfo(copy, 'Ambassadeur'),
    );

    expect(stringsToTranslate(plan)).toEqual([]);
  });

  it('translates a new item the copy did not follow, keeping its hand fixes', () => {
    const plan = planAfterCommit(withRodolfo(baseline, 'Embajador'), handFixed());

    expect(stringsToTranslate(plan)).toEqual(['Rodolfo', 'Embajador']);
    expect(JSON.stringify(completeLocaleSync(plan, ['R', 'A']).data)).toContain(
      'Ambassadeur général continental',
    );
  });
});

describe('baselineFromHistory', () => {
  const retitled = withData({ ...baseline.data, title: 'Portada' });
  const handFixedCopy = {
    ...copy,
    data: { ...copy.data, slug: 'inicio' },
    body: 'Paragraphe un.\n\nParagraphe deux (corrigé).',
  };

  it('starts from the Spanish page the copy was created with', () => {
    expect(baselineFromHistory([{ source: baseline, copy }])).toBe(baseline);
  });

  it('remembers a Spanish edit the copy never followed, across later hand fixes', () => {
    // 1. copy created from `baseline`; 2. Spanish retitled, copy untouched
    // (no commit of the copy); 3. a hand fix of the copy, Spanish unchanged.
    const reflected = baselineFromHistory([
      { source: baseline, copy },
      { source: retitled, copy: handFixedCopy },
    ]);

    const plan = planLocaleSync({
      current: retitled,
      baseline: reflected,
      copy: handFixedCopy,
      locale: 'fr',
    });
    expect(stringsToTranslate(plan)).toEqual(['Portada']);
  });

  it('treats a value the copy changed in a later commit as followed', () => {
    const translated = { ...copy, data: { ...copy.data, title: 'Couverture' } };
    const reflected = baselineFromHistory([
      { source: baseline, copy },
      { source: retitled, copy: translated },
    ]);

    expect(
      stringsToTranslate(
        planLocaleSync({
          current: retitled,
          baseline: reflected,
          copy: translated,
          locale: 'fr',
        }),
      ),
    ).toEqual([]);
  });

  it('has no baseline when the Spanish page did not exist yet', () => {
    expect(baselineFromHistory([{ source: undefined, copy }])).toBeUndefined();
  });
});

describe('internal links of a copy', () => {
  it('localizes a link that is new in Spanish', () => {
    const current = structuredClone(baseline);
    (current.data['blocks'] as Array<Record<string, unknown>>).push({
      type: 'cta',
      buttons: [{ label: 'Voluntariado', href: '/voluntariado/' }],
    });

    const result = completeLocaleSync(sync(current), ['Bénévolat']);
    const blocks = result.data['blocks'] as Array<Record<string, unknown>>;

    expect(blocks[2]).toEqual({
      type: 'cta',
      buttons: [{ label: 'Bénévolat', href: '/fr/voluntariado/' }],
    });
  });
});

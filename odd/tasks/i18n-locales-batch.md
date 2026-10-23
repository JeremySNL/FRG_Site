# i18n missing locales batch (fr / ja / zh-TW)

Generate the three remaining locales with the toyed pipeline and verify them
with mechanical + delegated human-review rigor.

- Branch: main (continuing the i18n feature line; discussed slice strategy:
  one commit per locale + one for the gate test)
- Test runner: `npx vitest run tests/locales.test.ts` (+ full suite per
  closure); build with `npm run build` when the locales change routing output
- Route: generation = CLI (`npm run translate`, background, sequential),
  checks = parent + one delegated verification worker (Mapping/Verification
  triggers hold: 3 locales x ~70 files exceed the inline evidence budget)

## Specs

- S1: Run `npm run translate` (no flags) to generate fr, ja, zh-TW content
  and their i18n JSON files everywhere missing, skipping existing files.
- S2: A mechanical parity gate (`tests/locales.test.ts`) pins for every
  generated locale: correct `locale`, unchanged `slug`/`legacyPath`/`date`/
  `categories`/`image`, translated `title`/`role` (with the entity proper
  noun allowed verbatim), and byte-identical contact data (phone, e-mail) on
  the donation/volunteering pages.
- S3: A fresh-context reviewer analyzes the three generated locales with
  rigor (per-locale verdicts): frontmatter sanity, obvious mistranslations
  in page copy and key documents (inicio, donar, voluntariado, nosotros),
  locale-of-Taiwan spelling choices, and JS-facing i18n strings.
- S4: Defects found are fixed (regenerated where the model failed, hand-fixed
  where it refuses like the EN posts), then each locale is committed as its
  own reviewable slice together with the gate test.

## Tasks

- T1 (S1): run `npm run translate` — inline, background — status: running.
- T2 (S2): write `tests/locales.test.ts` gate — inline — status: written,
  run pending generation.
- T3 (S3): delegated reviewer pass — status: pending.
- T4 (S4): fix defects, per-locale commits — status: pending.

## Log

- L1 (2026-10-23): "Teniendo en cuenta todo eso, si realiza las traducciones
  faltantes que mencionaste y analizalos con rigor." — generate fr/ja/zh-TW
  and analyze rigor. Layer one is the mechanical gate test; layer two is the
  delegated fresh-context review. Free-tier rate limit means the three
  locales generate sequentially inside one CLI process.

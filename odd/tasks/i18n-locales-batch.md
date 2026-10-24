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

- T1 (S1): run `npm run translate` — inline, background — DONE (3 runs;
  crashes of the CJK output required translator hardening: batch retry +
  `\uXXXX` escape repair + merge-mode UI tables).
- T2 (S2): write `tests/locales.test.ts` gate — inline — DONE (GREEN).
- T3 (S3): delegated reviewer pass — DONE (verdict fr/ja/zh-TW = PASS;
  frontmatter sampled, idiomatic quality of inicio/donar/nosotros/
  voluntariado + i18n tables verified, mojibake/garbage hunt clean,
  simplified-Chinese mix scan clean, 15 posts per locale complete).
- T4 (S4): fix defects, per-locale commits — DONE as commits
  `1a7f419` (tooling), `41d1251` (fr), `4fd7de2` (ja), `d68dfdf` (zh-TW),
  `3f583c9` (en polish), `4ce62b8` (zh-TW negation fix from the review);
  build verified: all four locales prerender their full route tree.

## Log

- L1 (2026-10-23): "Teniendo en cuenta todo eso, si realiza las traducciones
  faltantes que mencionaste y analizalos con rigor." — generate fr/ja/zh-TW
  and analyze rigor. Layer one is the mechanical gate test; layer two is the
  delegated fresh-context review. Free-tier rate limit means the three
  locales generate sequentially inside one CLI process.
- L2 (2026-10-23): run #1 generated fr content + ja partial then crashed on
  a malformed model answer (YAML-style list). run #2 skipped everything
  (old skip rule) and crashed on zh-TW with broken `\uXXXX` escapes.
  Root-cause fixes landed in `translate.mts`/`lib/translate.ts` (merge-mode
  tables, batch retry, escape repair); run #3 completed everything:
  fr/ja tables 65 strings, zh-TW 53 docs, 2 in-flight batch retries
  observed successful. Mechanical gate GREEN after hand-fixing
  republica-dominicana tags (fr/ja/zh-TW), fr category filiales, 3 ja post
  titles, a garbled zh-TW post title, and the EN country tail; proper-noun
  allowlist extended (interlatitudes-medicos, dr-cruz-jiminian).
- L3 (2026-10-23): delegated fresh-context reviewer returned PASS for all
  three locales (frontmatter sampling, idiomatic quality of the key pages
  and i18n tables, mojibake/`\u`/U+FFFD hunt clean, zero simplified-Chinese
  characters mixed into zh-TW, body completeness verified on 15 posts per
  locale). One cosmetic defect: zh-TW `translationPendingText` was missing
  its negation ("尚提供" -> "尚未提供"), fixed and committed as `4ce62b8`.
  `npm run build` prerendered the full route tree for en/fr/ja/zh-TW.
- L4 (2026-10-23): user asked for the English ethics and safety policy that
  the pipeline skipped on purpose. Hand-written in legal register
  (commit `a513543`); the EN copy keeps `noAutoTranslate: true` so pipeline
  re-runs cannot overwrite it. fr/ja/zh-TW still lack the policy by design.
- L5 (2026-10-23): the user then requested the policy in the remaining
  locales too. Hand-written in fr/ja/zh-TW with the same legal register
  (commit `17d230d`), verified by the full suite, typecheck, and build.
  The policy now exists in all four locales with `noAutoTranslate: true`.

- L6 (2026-10-24): follow-up batch from the Judgment Day dual review
  (verdict APPROVED). The INFO items were resolved in ascending complexity:
  T1 zh-TW role badge made continent-generic (52ab22e); T2 "Por asignar"
  country placeholders localized in fr/zh-TW and the root cause fixed by
  adding `country` to TRANSLATABLE_KEYS (c5d796d); T3 merge-mode moved to
  the shared lib with readable-value semantics + unit tests (23ef4f9);
  T4 the locale gate now pins excerpts, bodies (locale-independent markup
  ignored), collection-keyed title exceptions, a previously dead team-role
  check, and the contacto page data � it immediately caught the real fr G7
  excerpt defect, also fixed (528af7c); T5 the translator gained two
  safeguards: --force stashes and restores locale copies whose source is
  skipped by rule (hand-written noAutoTranslate policy pages survive), and
  a plain re-run regenerates existing copies whose prose still equals the
  Spanish source instead of freezing crashed-batch leftovers (ea11904).
  Suite 39/39 GREEN, tsc clean, dry-run verified each step. Remaining info
  items deferred to the user: fr dateline-spanish convention, deeper
  --force redesign.

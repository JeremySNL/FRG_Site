# High-priority technical debt

Close the four high-priority items of the 2026-11-04 audit: a deploy gate,
locale sync, lighter team photos from `media:add`, and form endpoint tests.

- Branch: main (uncommitted; commits only with the user's explicit approval)
- Test runner: `npx vitest run <file>` per task, `npm run test` + `npm run verify` at closure

## Specs

- S1 (CI): the user chose "Frenar en Cloudflare": "Creo `npm run verify`
  (check, lint, test, build) y un workflow de GitHub que lo corre en cada
  push. Tú cambias en el panel de Cloudflare el comando de build a
  `npm run verify`: si algo falla, no se publica. Sin secretos nuevos."
  Follow-up question answered: when everything passes, Cloudflare deploys as
  today. `verify` must work on a clean checkout without `.env`.
- S2 (locale sync): the user chose "Traducir solo lo nuevo": "Compara cada
  página con la versión en español de la que salió la traducción (usando
  git), conserva tal cual lo ya traducido (incluidas tus correcciones a
  mano), copia imágenes y claves, y manda a la API solo los textos nuevos o
  modificados. Necesita OPENAI_API_KEY; tiene modo de vista previa sin API."
- S3 (media:add): `--team` photos are encoded narrower than the 1600px
  default, because they are drawn at most at 208px (the general ambassador
  card); 480px keeps them sharp on 2x screens. Other targets keep 1600px.
- S4 (form tests): `createFormHandler` gets tests through its public
  interface (the endpoint `POST`): honeypot, rate limit, validation errors,
  Turnstile verdicts (invalid / unconfigured), mail delivery failure, and the
  success path with the notification it sends.

## Tasks

- T1 (S3): `media:add` team width — inline — DONE. RED (`deliveryWidthFor is
  not a function`) → GREEN; dry run `--team` 1280x981 → 480x368, `--page`
  keeps 1280. Uncommitted.
- T2 (S4): form handler tests — inline — DONE. 8 tests on the real `POST`
  handlers (characterization, no RED: existing behavior); mutation check
  (rate limit 5→6, Turnstile verdict ignored) fails 2 of them. Uncommitted.
- T3 (S1): `npm run verify`, GitHub workflow, docs — inline — DONE. `verify`
  passed in a clean copy without `.env` after `npm ci`. Pending on the user:
  set the Cloudflare build command to `npm run verify`. Uncommitted.
- T4 (S2): `npm run sync:locales` with git baseline, preview mode, docs —
  inline — DONE. Lib written before its tests (no RED for the first 8);
  RED→GREEN for CRLF handling and for the three-way merge of localized
  values. End-to-end `--write` against a fake API in a scratch clone: only
  new text translated, localized links and hand fixes kept, no formatting
  churn; missing key / dirty copy / bad args guarded. Uncommitted.
- Closure: `npm run verify` 25 files / 177 tests + build, `format:check` OK.
  Independent verifier launched (Risk items 1 and 5).

## Log

- L1 (2026-11-04, user): "Vamos a realizar todas las deudas de alta
  prioridad, si necesitas que decida algo antes de implementar avisa."
- L2 (2026-11-04, user): CI = "La primera opcion si hace el deploy si todo
  esta correcto?"; sync = "Traducir solo lo nuevo (Recommended)".
- L3: Engram mirror pending — no Engram tools are available in this session.
- L4: The end-to-end run caught a defect the unit tests missed: copies hold
  localized non-translated values (`href: "/en/donar/"`, a hand-fixed
  `address`), which the first design overwrote with Spanish. Switched to a
  three-way merge per value. Found while checking: fr and ja home pages link
  their buttons to the Spanish pages (`/donar/`); pre-existing, out of scope.
- L5: Files saved on Windows can hold CRLF while git stores LF; the first
  preview flagged unchanged posts. Line endings are normalized on read.
- L6: Independent verifier: S1 PASS (workflow valid; `verify` stops at the
  first failing step). S2 FAIL with two blockers, both fixed and rechecked
  end to end in a scratch clone with a fake API:
  - B1 `--locale` without a value ran every locale. Now `parseSyncArgs`
    (RED→GREEN, 4 tests) rejects a missing value, both options, unknown
    options and stray words, with the messages of `npm run translate`.
  - B2 a Spanish edit committed together with a hand fix of the copy never
    propagated. Fixing it showed the deeper cause: a copy that was already
    behind before its last commit. The baseline is now followed through the
    copy's whole git history (`baselineFromHistory` / `effectiveBaseline`,
    RED→GREEN, 8 tests). Recheck: the same-commit case flags both the new
    edit and the older lag, keeps the hand fix, and a second run after
    committing is up to date. Advisory 4 (rename entries in `status -z`)
    fixed too.
- L7: The history-based preview on the real repo flags 20 strings, all
  verified as real drift: "Embajadora General Continental" (en/ja/zh-TW),
  missing `excerpt` of the asamblea post (all 4), excerpts corrected in
  Spanish by `b8e8f97` after the copies were made (2 posts), and the team
  name "Dr. Julio Rosario Gatón" (copies still say "Rosario Gaton").
- L8: Closure: `npm run verify` 25 files / 189 tests + build, `format:check`
  OK. Remaining advisories: whole-body retranslation when a copy's paragraph
  count differs from its source (e.g. the CSR-awards post); keys present only
  in a copy are dropped.

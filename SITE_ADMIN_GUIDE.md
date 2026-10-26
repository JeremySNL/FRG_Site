# FRG_Site Administration Guide

This guide covers routine editorial work and the technical checks for the FRG_Site website. The project keeps content in Markdown and Astro Content Collections; article preparation is local, while publishing is triggered by pushing to `main`.

## Quick path: prepare and publish a post

1. Use [`POST_AUTHORING_PROMPT.md`](POST_AUTHORING_PROMPT.md) with the article facts and source material. The prompt returns one Spanish Markdown post; translations are handled separately by the publishing workflow.
2. Save the result as `src/content/es/posts/<slug>.md`. Keep the filename and the frontmatter `slug` identical.
3. Upload any new images to the media bucket separately. Put the exact uploaded key in the post's `image` field or inline Markdown image. `post:ready` reminds you that media must be uploaded separately but does not upload or remotely verify it.
4. Run `npm run post:ready -- --slug <slug>`. To choose locales, add `--locales en,fr`; if omitted, all configured translation locales are selected. Add `--dry-run` to inspect the translation scope without API calls or file writes.
5. Review the translated Markdown and the local preview routes reported by the command. Run `npm run preview` to inspect the build locally.
6. Commit the reviewed changes and push to `main`. Per the configured publishing workflow, that push triggers Cloudflare's automatic deployment. The post-preparation command does not commit, push, or deploy.

The preparation command requires `OPENAI_API_KEY` in the ignored `.env` file when machine translation is needed. Never copy secrets into content or commit `.env`.

## How posts are structured

Posts are Markdown files under `src/content/<locale>/posts/`. The Spanish source is `src/content/es/posts/`. Required frontmatter fields are:

```yaml
title: 'Article title'
slug: 'article-slug'
locale: 'es'
date: '2026-10-26'
```

Optional fields include `updated`, `excerpt`, `author`, `categories`, `tags`, `image`, `imageAlt`, `legacyPath`, `seo`, and `noAutoTranslate`. Use category and tag slugs that already exist under the Spanish taxonomy directories. The AI prompt lists the current allowed values.

The post title, date, optional excerpt, and featured image are rendered by `PostView.astro`. The body is ordinary Markdown, so headings, paragraphs, lists, links, and inline images can appear in any editorial order. Inline images use `![Alt text](exact-media-key)`.

Posts do not use the typed page-block system. The `VideoBlock` is currently a page block; post Markdown should use a plain video link rather than an unverified iframe embed.

## Translation behavior

- `npm run post:ready -- --slug <slug> [--locales en,fr]` translates only the selected post and does not touch page, category, tag, program, team, or UI translation files.
- Existing translated copies are preserved by the normal non-forced translation mode. If an existing translation is skipped, review it manually when the Spanish source changes; the preparation command does not overwrite it.
- Posts marked `noAutoTranslate: true` and posts older than the translator's configured cutoff are intentionally skipped.
- The locale-wide command remains available: `npm run translate -- --locale en --dry-run` previews work for one target locale. Running `npm run translate` without a locale processes all configured target locales and all supported collections.
- Avoid `--force` for routine publication. It can rebuild an entire target locale and replace existing generated translations.

## Validation and local preview

`post:ready` validates the source with Astro before translation, then runs typecheck, lint, tests, and a production build after translation:

| Command                                | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `npm run check`                        | Astro and content-collection validation before translation |
| `npm run typecheck`                    | TypeScript validation                                      |
| `npm run lint`                         | ESLint checks                                              |
| `npm run test -- --test-timeout=30000` | Vitest suite with the repository's supported timeout       |
| `npm run build`                        | Generate and validate the static site                      |
| `npm run preview`                      | Serve the local build for visual review                    |

If a command fails after translations have been written, those generated files remain in the worktree. Fix the reported issue and rerun the preparation command; do not use `--force` to recover.

## Other editorial content

### Pages

Pages live under `src/content/<locale>/pages/`. Their frontmatter includes a typed `blocks` array, unlike posts. The `blocks` schema is declared in `src/content.config.ts`, TypeScript types are in `src/lib/blocks.ts`, and `src/components/blocks/BlockRenderer.astro` maps each type to a component. Adding a new block requires keeping those definitions, the renderer, and block tests in sync.

Navigation is controlled by page frontmatter: `nav`, `navLabel`, and `navParent`. Use an existing page or block pattern as a reference before changing page composition.

### Categories and tags

Spanish category and tag records live in `src/content/es/categories/` and `src/content/es/tags/`. Their generated translations live in the corresponding locale directories. Posts reference their slugs, not display names.

### Interface text

Shared interface strings live in `src/i18n/<locale>.json`. Content translation and interface translation are handled by `scripts/translate.mts`; the post-specific preparation command deliberately excludes UI strings.

## Images and other media

Rendered site media uses the configured public R2 media base. For a new article image:

1. Upload the image to the approved media bucket separately.
2. Record the exact object key returned or selected for the upload.
3. Use that key in the featured-image frontmatter or inline Markdown.
4. Review alt text and the local build output before pushing.

The old WordPress media migration utility (`npm run migrate:media`) is for migration work, not the routine per-article upload workflow. Do not put credentials or private URLs into Markdown.

## Site code and forms

- Routing and locale selection are implemented in `src/pages/[...path].astro` and `src/lib/locales.ts`; Spanish is the default locale.
- Form endpoints are under `src/pages/api/`. They use the shared validation and rate-limit helpers in `src/lib/api.ts` and secrets from the deployment environment.
- Never put Turnstile or Resend secrets in content, client-side files, or committed configuration. Manage them through the approved Cloudflare secret workflow.
- Root `wrangler.jsonc` intentionally omits generated `main`/`assets` settings. Routine deployments should use the configured push-to-`main` pipeline, not edit the generated deployment config.

## Troubleshooting

- **A post is missing from another locale:** check its translated file under `src/content/<locale>/posts/`; rerun `post:ready` for that slug and locale. Existing translations are not overwritten automatically.
- **A category or tag is not displayed correctly:** verify the exact slug against the files under `src/content/es/categories/` or `src/content/es/tags/`.
- **An image is broken:** verify the object was uploaded separately and that the Markdown/frontmatter key matches the R2 object key exactly.
- **Astro check or build fails:** fix the reported frontmatter/schema or Markdown issue before pushing.
- **Deployment does not start:** verify that the change was pushed to `main` and inspect the configured Cloudflare deployment status. The repository files alone do not expose Cloudflare dashboard state.

## Commands reference

| Task                     | Command                                                      |
| ------------------------ | ------------------------------------------------------------ |
| Start local development  | `npm run dev`                                                |
| Prepare one post         | `npm run post:ready -- --slug <slug>`                        |
| Preview translation work | `npm run translate -- --locale <locale> --dry-run`           |
| Validate Astro/content   | `npm run check`                                              |
| Run tests                | `npm run test -- --test-timeout=30000`                       |
| Build static site        | `npm run build`                                              |
| Preview static build     | `npm run preview`                                            |
| Publish                  | Commit and push to `main` (Cloudflare deploys automatically) |

`npm run deploy` is a separate direct Wrangler deployment command and is not part of the normal push-to-`main` publishing path.

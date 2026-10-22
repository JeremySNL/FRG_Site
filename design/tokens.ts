/**
 * Brand design tokens — the single source of truth for the FRG visual identity.
 *
 * Migrated from the WordPress Elementor "Kit por defecto" (kit id 109), which was
 * the only place the brand system was defined. Every value below is extracted
 * verbatim from that kit; nothing here is invented.
 *
 * `src/styles/global.css` mirrors these as CSS custom properties inside a
 * Tailwind v4 `@theme` block. The two MUST stay in sync — `tests/tokens.test.ts`
 * fails the build if they drift.
 *
 * Naming maps directly to the CSS custom property name so the sync test is a
 * trivial key-by-key comparison.
 */
export const tokens = {
  // ── Palette ──────────────────────────────────────────────────────────────
  'color-primary': '#6EC1E4', // light blue
  'color-secondary': '#54595F', // cool grey
  'color-text': '#2C2C2C', // body copy
  'color-accent': '#273272', // deep indigo — primary brand colour, buttons
  'color-accent-hover': '#CE2610', // red — button hover
  'color-heading': '#201D1A', // near-black — headings
  'color-surface': '#F8F8F8', // light section background
  'color-muted': '#E4E4E4', // borders, dividers
  'color-salmon': '#DB7365', // secondary accent
  'color-transition': '#FFBC7D', // section transition band
  // Blue-tinted off-whites — section backgrounds that avoid plain white.
  'color-tint': '#F1F5FF', // subtle blue band
  'color-tint-strong': '#E3EBFF', // deeper blue band
  // Soft red wash — donation / action bands.
  'color-blush': '#FFF2F0',
  'color-white': '#FFFFFF',
  'color-black': '#000000',

  // ── Typography ──────────────────────────────────────────────────────────
  'font-display': '"Outfit Variable", ui-sans-serif, system-ui, sans-serif',
  'font-body': '"Poppins", ui-sans-serif, system-ui, sans-serif',
  'font-alt': '"Quicksand", ui-sans-serif, system-ui, sans-serif',

  // Display scale (Outfit 600) — 72 / 56 / 42 / 32 / 26 / 20 / 16
  'text-display-2xl': '4.5rem',
  'text-display-xl': '3.5rem',
  'text-display-lg': '2.625rem',
  'text-display-md': '2rem',
  'text-display-sm': '1.625rem',
  'text-display-xs': '1.25rem',
  'text-display-2xs': '1rem',

  // ── Layout ───────────────────────────────────────────────────────────────
  'container-site': '1280px',
  'radius-pill': '9999px',
} as const;

export type TokenName = keyof typeof tokens;

/** Flat colour map, handy when a component needs a raw hex value. */
export const colors = {
  primary: tokens['color-primary'],
  secondary: tokens['color-secondary'],
  text: tokens['color-text'],
  accent: tokens['color-accent'],
  accentHover: tokens['color-accent-hover'],
  heading: tokens['color-heading'],
  surface: tokens['color-surface'],
  muted: tokens['color-muted'],
  salmon: tokens['color-salmon'],
  transition: tokens['color-transition'],
  tint: tokens['color-tint'],
  tintStrong: tokens['color-tint-strong'],
  blush: tokens['color-blush'],
  white: tokens['color-white'],
  black: tokens['color-black'],
} as const;

/** The display type scale, largest first. */
export const displayScale = [
  tokens['text-display-2xl'],
  tokens['text-display-xl'],
  tokens['text-display-lg'],
  tokens['text-display-md'],
  tokens['text-display-sm'],
  tokens['text-display-xs'],
  tokens['text-display-2xs'],
] as const;

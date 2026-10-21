#!/usr/bin/env node
/**
 * Import the WordPress database into the Astro content collections.
 *
 *   node scripts/extract-wp.mts
 *
 * Environment:
 *   WP_SQL_PATH      path to the `mysqldump` file (required)
 *   CONTENT_DIR      output directory            (default: src/content)
 *   CONTENT_LOCALE   locale to write             (default: es)
 *
 * The importer is intentionally explicit: every page has a small recipe that
 * maps its Elementor widgets to blocks. That keeps the migrated content
 * faithful (and reviewable) instead of guessing from a generic template.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import {
  loadDatabase,
  elementorWidgets,
  parseElementor,
  getMeta,
  decodeSetting,
  settingString,
  settingNumber,
  settingArray,
  settingLink,
  settingImageInfo,
  type ElementorWidget,
  type WpDatabase,
} from './lib/wp.ts';
import {
  buildExcerpt,
  htmlToMarkdown,
  oneLine,
  stripHtml,
  cleanHtml,
  stripPlaceholders,
} from './lib/html.ts';
import { toMediaPath, uniqueSlug } from './lib/media.ts';
import { markdownDocument } from './lib/yaml.ts';
import type { Block, Link } from '../src/lib/blocks.ts';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const LEGACY_ORIGIN = 'https://fundacionrosariogaton.org';

const SQL_PATH =
  process.env['WP_SQL_PATH'] ??
  'C:/Users/jeremy/Local Sites/fundacionrosariogaton/app/sql/local.sql';

const CONTENT_DIR = path.resolve(process.env['CONTENT_DIR'] ?? 'src/content');
const LOCALE = process.env['CONTENT_LOCALE'] ?? 'es';

/** Fallback targets for buttons whose original link was broken. */
const BUTTON_HREFS: Record<string, string> = {
  unirse: '/voluntariado/',
  'donar ahora': '/donar/',
  'nuestras causas': '/programas-y-proyectos/',
  'conocer más': '/nosotros/',
  'saber más': '/nosotros/',
  'ver todas': '/programas-y-proyectos/',
  'ver todo': '/actualidades/',
  'ver todas las publicaciones': '/actualidades/',
  '¡únete hoy!': '/voluntariado/',
  'convertirme en voluntario': '/voluntariado/',
  colaborar: '/donar/',
};

/** Legacy paths that moved in the new site. */
const LEGACY_PATH_MAP: Record<string, string> = {
  blog: 'actualidades',
};

/**
 * Posts whose WordPress slug or title was unusable (auto-generated ids,
 * repeated "ayudas medicas" labels). The legacy path is preserved in the
 * frontmatter so the redirect map can point the old URLs at the new ones.
 */
const POST_OVERRIDES: Record<string, { title?: string; slug?: string }> = {
  '1047-2': {
    title: 'Reunión con el Dr. Cruz Jiminian sobre proyectos para 2025',
    slug: 'reunion-con-el-dr-cruz-jiminian-proyectos-2025',
  },
  '1267-2': {
    title: 'Aplicación de tornillos en el pie',
    slug: 'aplicacion-de-tornillos-en-el-pie',
  },
  galeria: {
    title: 'Loida Eunice Cuello Colón: operación de mioma',
    slug: 'loida-eunice-cuello-colon-operacion-de-mioma',
  },
  'ayudas-medicas': {
    title: 'Pablo de la Cruz: hernia testicular resuelta',
    slug: 'pablo-de-la-cruz-hernia-testicular',
  },
  'ayudas-medicas-2': {
    title: 'Carmen Gloria Severino: operación de tumor',
    slug: 'carmen-gloria-severino-operacion-de-tumor',
  },
  'ayudas-medicas-3': {
    title: 'Marielly Capellán: reconstrucción vaginal a los 14 años',
    slug: 'marielly-capellan-reconstruccion-vaginal',
  },
  'ayudas-medicas-4': {
    title: 'Kamila Remires Espinosa: extirpación de mioma',
    slug: 'kamila-remires-espinosa-extirpacion-de-mioma',
  },
};

/** Categories whose WordPress name is an artefact rather than editorial copy. */
const CATEGORY_TITLE_OVERRIDES: Record<string, string> = {
  uncategorized: 'Sin categoría',
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function byType(widgets: ElementorWidget[], type: string): ElementorWidget[] {
  return widgets.filter((widget) => widget.type === type);
}

/** Elementor ships two video widgets; both carry the same YouTube id. */
function videoWidgets(widgets: ElementorWidget[]): ElementorWidget[] {
  return widgets.filter(
    (widget) => widget.type === 'elementskit-video' || widget.type === 'video',
  );
}

/** The icon list whose items contain `needle`. */
function iconListContaining(widgets: ElementorWidget[], needle: string): string[] {
  for (const widget of byType(widgets, 'icon-list')) {
    const items = iconListItems(widget);
    if (items.some((item) => item.toLowerCase().includes(needle.toLowerCase()))) {
      return [...new Set(items)];
    }
  }
  return [];
}

/** Remove duplicated entries while keeping the original order. */
function headingTitle(widget: ElementorWidget): string {
  return oneLine(settingString(widget.settings, 'title'));
}

function headingSize(widget: ElementorWidget): string {
  return settingString(widget.settings, 'header_size').toLowerCase();
}

function editorText(widget: ElementorWidget): string {
  return oneLine(settingString(widget.settings, 'editor'));
}

function editorHtml(widget: ElementorWidget): string {
  return settingString(widget.settings, 'editor').trim();
}

function buttonLabel(widget: ElementorWidget): string {
  return oneLine(settingString(widget.settings, 'text'));
}

function iconBoxTitle(widget: ElementorWidget): string {
  const title = oneLine(settingString(widget.settings, 'title_text'));
  if (title) return title;
  // Some icon boxes only carry a description (for example the donation uses).
  return oneLine(settingString(widget.settings, 'description_text'));
}

function iconBoxText(widget: ElementorWidget): string {
  const title = oneLine(settingString(widget.settings, 'title_text'));
  if (!title) return '';
  return oneLine(settingString(widget.settings, 'description_text'));
}

/** Normalise a legacy URL into a path on the new site. */
function normalizeHref(raw: string, label = ''): string | null {
  const value = raw.trim();
  if (!value || value === '#') return null;

  if (/^(https?:|mailto:|tel:|https:\/\/wa\.me)/.test(value)) {
    if (value.startsWith(LEGACY_ORIGIN)) {
      const rest = value.slice(LEGACY_ORIGIN.length);
      return normalizeHref(rest, label);
    }
    return value;
  }

  if (!value.startsWith('/')) {
    return BUTTON_HREFS[label.trim().toLowerCase()] ?? null;
  }

  const clean = value.replace(/^\/+/, '').replace(/\/+$/, '');
  const target = LEGACY_PATH_MAP[clean] ?? clean;
  return target === '' ? '/' : `/${target}/`;
}

function buttonLink(widget: ElementorWidget | undefined): Link | null {
  if (!widget) return null;
  const label = buttonLabel(widget);
  const href = normalizeHref(settingLink(widget.settings, 'link'), label);
  if (!label || !href) return null;
  return { label, href };
}

function findButton(buttons: ElementorWidget[], label: string): Link | null {
  const needle = label.trim().toLowerCase();
  return buttonLink(
    buttons.find((button) => buttonLabel(button).toLowerCase() === needle),
  );
}

/** The first button that points at `href`. */
function findButtonByHref(buttons: ElementorWidget[], href: string): Link | null {
  for (const button of buttons) {
    const link = buttonLink(button);
    if (link?.href === href) return link;
  }
  return null;
}

/** The media path of an Elementor image setting, resolved via the attachment id. */
function mediaOf(db: WpDatabase, widget: ElementorWidget, key = 'image'): string {
  const info = settingImageInfo(widget.settings, key);
  if (info.id !== undefined) {
    const attachment = db.attachments.get(info.id);
    if (attachment?.file) return attachment.file;
  }
  return toMediaPath(info.url);
}

function mediaAltOf(widget: ElementorWidget, key = 'image'): string {
  const info = settingImageInfo(widget.settings, key);
  if (info.alt.trim()) return info.alt.trim();
  const title = oneLine(settingString(widget.settings, 'title'));
  return title;
}

/** The YouTube video id of an Elementor video widget. */
function youtubeId(widget: ElementorWidget): string {
  const candidates = [
    settingString(widget.settings, 'ekit_video_popup_url'),
    settingString(widget.settings, 'youtube_url'),
    settingString(widget.settings, 'video_url'),
    settingString(widget.settings, 'url'),
    settingString(widget.settings, 'link'),
  ];

  for (const candidate of candidates) {
    const match =
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(
        candidate,
      );
    if (match?.[1]) return match[1];
  }

  return '';
}

/** The items of an Elementor icon list widget. */
function iconListItems(widget: ElementorWidget): string[] {
  const items = settingArray(widget.settings, 'icon_list');
  const result: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const text = decodeSetting((item as Record<string, unknown>)['text']);
    if (typeof text === 'string' && text.trim()) result.push(oneLine(text));
  }

  return result;
}

/** The items of an Elementor accordion widget. */
function accordionItems(
  widget: ElementorWidget,
): Array<{ title: string; text: string }> {
  const items = settingArray(widget.settings, 'ekit_accordion_items');
  const result: Array<{ title: string; text: string }> = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = decodeSetting(record['acc_title']);
    const content = decodeSetting(record['acc_content']);
    result.push({
      title: typeof title === 'string' ? oneLine(title) : '',
      text: typeof content === 'string' ? cleanHtml(content) : '',
    });
  }

  return result;
}

/** The items of an Elementor testimonial widget. */
function testimonialItems(
  db: WpDatabase,
  widget: ElementorWidget,
): Array<{ quote: string; author?: string; role?: string; image?: string }> {
  const items = settingArray(widget.settings, 'ekit_testimonial_data');
  const result: Array<{
    quote: string;
    author?: string;
    role?: string;
    image?: string;
  }> = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = decodeSetting(record['client_name']);
    const role = decodeSetting(record['designation']);
    const review = decodeSetting(record['review']);
    const photo = decodeSetting(record['client_photo']);

    const image =
      photo && typeof photo === 'object'
        ? toMediaPath(String((photo as Record<string, unknown>)['url'] ?? ''))
        : '';

    result.push({
      quote: typeof review === 'string' ? oneLine(review) : '',
      author: typeof name === 'string' ? oneLine(name) : undefined,
      role: typeof role === 'string' ? oneLine(role) || undefined : undefined,
      image: image || undefined,
    });
  }

  void db;
  return result;
}

/** The tabs of an Elementor simple-tab widget. */
function tabItems(widget: ElementorWidget): Array<{ title: string; html: string }> {
  const items = settingArray(widget.settings, 'ekit_tab_items');
  const result: Array<{ title: string; html: string }> = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = decodeSetting(record['ekit_tab_title']);
    const content = decodeSetting(record['ekit_tab_content']);
    result.push({
      title: typeof title === 'string' ? oneLine(title) : '',
      html: typeof content === 'string' ? cleanHtml(content) : '',
    });
  }

  return result;
}

/** The images of an Elementor gallery widget. */
function galleryImages(
  db: WpDatabase,
  widget: ElementorWidget,
): Array<{ src: string; alt: string }> {
  const items = settingArray(widget.settings, 'wp_gallery');
  const result: Array<{ src: string; alt: string }> = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = Number.parseInt(String(record['id'] ?? ''), 10);
    const url = decodeSetting(record['url']);
    let src = typeof url === 'string' ? toMediaPath(url) : '';

    if (Number.isFinite(id)) {
      const attachment = db.attachments.get(id);
      if (attachment?.file) src = attachment.file;
    }

    if (src) result.push({ src, alt: '' });
  }

  return result;
}

/** The counters of a page. */
function counterItems(
  widgets: ElementorWidget[],
): Array<{ value: string; label: string }> {
  const formatter = new Intl.NumberFormat('es-DO');

  return widgets
    .map((widget) => {
      const label = oneLine(settingString(widget.settings, 'title'));
      const number = settingNumber(widget.settings, 'ending_number');
      const suffix = settingString(widget.settings, 'suffix').trim();
      const prefix = settingString(widget.settings, 'prefix').trim();

      return {
        label,
        value: `${prefix}${formatter.format(number)}${suffix}`,
      };
    })
    .filter((item) => item.label !== '');
}

/** Slugify a Spanish title. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** The first text-editor whose content contains `needle`. */
function textMatching(widgets: ElementorWidget[], needle: string): string {
  const found = widgets.find((widget) => editorText(widget).includes(needle));
  return found ? editorText(found) : '';
}

/** Derive a title from the first words of a post body. */
function titleFromBody(body: string): string {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return '';

  const words = plain.split(' ').slice(0, 9).join(' ');
  const trimmed = words.replace(/[.,;:!?]+$/, '').trim();

  return trimmed.length > 3 ? trimmed : plain.slice(0, 60);
}

/* -------------------------------------------------------------------------- */
/* Page recipes                                                               */
/* -------------------------------------------------------------------------- */

interface ProgramEntry {
  slug: string;
  title: string;
  summary: string;
  image: string;
  imageAlt: string;
  order: number;
}

interface Context {
  db: WpDatabase;
  widgets: ElementorWidget[];
  programs: ProgramEntry[];
}

/** A member of the team. */
interface TeamMember {
  name: string;
  role: string;
  bio: string;
  image?: string;
  imageAlt?: string;
}

/** Split a widget stream into the "areas of action" (h4 + text + image). */
function extractProgramEntries(ctx: Context): ProgramEntry[] {
  const entries: ProgramEntry[] = [];
  let pendingImage = '';
  let current: { title: string; summary: string; image: string } | null = null;

  for (const widget of ctx.widgets) {
    if (widget.type === 'image') {
      const src = mediaOf(ctx.db, widget);
      if (current && !current.image) current.image = src;
      else pendingImage = src;
      continue;
    }

    if (widget.type === 'heading' && headingSize(widget) === 'h4') {
      if (current) entries.push(current as ProgramEntry);
      current = { title: headingTitle(widget), summary: '', image: pendingImage };
      pendingImage = '';
      continue;
    }

    if (current && widget.type === 'text-editor' && !current.summary) {
      current.summary = editorText(widget);
    }
  }

  if (current) entries.push(current as ProgramEntry);

  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.title !== '')
    .map((entry, index) => {
      const base = slugify(entry.title) || `area-${index + 1}`;
      const slug = uniqueSlug(base, seen);
      return {
        slug,
        title: entry.title,
        summary: entry.summary,
        image: entry.image,
        imageAlt: entry.title,
        order: index + 1,
      };
    });
}

function buildHome(ctx: Context): Block[] {
  const headings = byType(ctx.widgets, 'heading');
  const texts = byType(ctx.widgets, 'text-editor');
  const buttons = byType(ctx.widgets, 'button');
  const iconBoxes = byType(ctx.widgets, 'icon-box');
  const counters = byType(ctx.widgets, 'counter');
  const images = byType(ctx.widgets, 'image');
  const videos = videoWidgets(ctx.widgets);
  const accordions = byType(ctx.widgets, 'elementskit-accordion');
  const testimonials = byType(ctx.widgets, 'elementskit-testimonial');
  const imageBoxes = byType(ctx.widgets, 'image-box');

  const blocks: Block[] = [];

  const heroHeading =
    headings.find((widget) => headingSize(widget) === 'h1') ?? headings[0];
  const slogans = headings
    .filter((widget) => headingSize(widget) === 'h5')
    .map(headingTitle)
    .filter((title) => title !== '');

  blocks.push({
    type: 'hero',
    title: heroHeading ? headingTitle(heroHeading) : 'Fundación Rosario Gatón',
    text: texts[0] ? editorText(texts[0]) : '',
    slogans,
    buttons: [buttonLink(buttons[0]), buttonLink(buttons[1])].filter(
      (link): link is Link => link !== null,
    ),
  });

  blocks.push({
    type: 'cards',
    items: [iconBoxes[0], iconBoxes[1]].filter(Boolean).map((widget) => ({
      title: iconBoxTitle(widget as ElementorWidget),
      text: iconBoxText(widget as ElementorWidget),
      href: widget === iconBoxes[0] ? '/programas-y-proyectos/' : '/nosotros/',
    })),
  });

  const video = videos[0];
  if (video) {
    blocks.push({
      type: 'video',
      title: 'Conoce la Fundación Rosario Gatón',
      youtubeId: youtubeId(video),
    });
  }

  blocks.push({ type: 'stats', items: counterItems(counters) });

  const aboutHeading = headings.find(
    (widget) => headingTitle(widget) === '¿Quiénes somos?',
  );
  blocks.push({
    type: 'imageText',
    title: aboutHeading ? headingTitle(aboutHeading) : '¿Quiénes somos?',
    text: textMatching(texts, 'es una organización de derechos humanos'),
    buttons: [findButton(buttons, 'Saber más')].filter(
      (link): link is Link => link !== null,
    ),
  });

  const imageBox = imageBoxes[0];
  if (imageBox) {
    const name = oneLine(settingString(imageBox.settings, 'title_text'));
    blocks.push({
      type: 'cards',
      title: 'Liderazgo',
      items: [
        {
          title: name,
          text: oneLine(settingString(imageBox.settings, 'description_text')),
          image: images[0] ? mediaOf(ctx.db, images[0]) : undefined,
          imageAlt: name || (images[0] ? mediaAltOf(images[0]) : undefined),
        },
      ],
    });
  }

  blocks.push({
    type: 'cta',
    title: 'Únete / Voluntariado',
    text: textMatching(texts, 'creemos en el poder de las personas'),
    buttons: [findButton(buttons, '¡Únete hoy!')].filter(
      (link): link is Link => link !== null,
    ),
  });

  blocks.push({
    type: 'cards',
    title: 'Formas de colaborar',
    items: [iconBoxes[2], iconBoxes[3], iconBoxes[4]].filter(Boolean).map((widget) => ({
      title: iconBoxTitle(widget as ElementorWidget),
      text: iconBoxText(widget as ElementorWidget),
    })),
  });

  blocks.push({
    type: 'programs',
    title: 'Áreas de Acción FRG',
    intro: textMatching(texts, 'Nuestra labor se enfoca en contribuir'),
    programs: ctx.programs.slice(0, 6).map((program) => program.slug),
  });

  blocks.push({
    type: 'cta',
    title: 'Haz tu donación',
    text: textMatching(texts, 'Tu apoyo es vital'),
    buttons: [findButton(buttons, 'Donar ahora')].filter(
      (link): link is Link => link !== null,
    ),
  });

  blocks.push({
    type: 'cards',
    title: 'Con tu donación',
    items: [iconBoxes[5], iconBoxes[6], iconBoxes[7], iconBoxes[8]]
      .filter(Boolean)
      .map((widget) => ({
        title: iconBoxTitle(widget as ElementorWidget),
        text: iconBoxText(widget as ElementorWidget),
      })),
  });

  const testimonial = testimonials[0];
  if (testimonial) {
    blocks.push({
      type: 'testimonial',
      title: 'Lo que dicen de nosotros',
      items: testimonialItems(ctx.db, testimonial),
    });
  }

  blocks.push({
    type: 'cta',
    title: 'Haz la diferencia: ¡conviértete en voluntario hoy!',
    buttons: [findButton(buttons, 'Convertirme en voluntario')].filter(
      (link): link is Link => link !== null,
    ),
  });

  const accordion = accordions[0];
  if (accordion) {
    blocks.push({
      type: 'accordion',
      title: 'Preguntas frecuentes',
      items: accordionItems(accordion),
    });
  }

  blocks.push({
    type: 'latestPosts',
    title: 'Nuestras últimas publicaciones',
    limit: 6,
  });

  blocks.push({
    type: 'cta',
    title: 'Estamos aquí para ayudarte.',
    text: stripPlaceholders(
      textMatching(texts, 'Si tienes dudas, deseas más información'),
    ),
    buttons: [],
  });

  blocks.push({ type: 'form', form: 'contact' });

  return blocks;
}

/**
 * The members of the team.
 *
 * The old site published a single person — the president — on the "Nosotros"
 * page, as an Elementor image box. Everybody else has to be added by hand
 * here.
 */
function extractTeamMembers(ctx: Context): TeamMember[] {
  const imageBoxes = byType(ctx.widgets, 'image-box');
  const images = byType(ctx.widgets, 'image');

  return imageBoxes
    .map((box, index) => {
      const name = oneLine(settingString(box.settings, 'title_text'));
      const role = oneLine(settingString(box.settings, 'description_text'));
      const image = images[index];

      return {
        name,
        role,
        bio: '',
        image: image ? mediaOf(ctx.db, image) : undefined,
        imageAlt: name || (image ? mediaAltOf(image) : undefined),
      };
    })
    .filter((member) => member.name !== '');
}

function buildAbout(ctx: Context): Block[] {
  const headings = byType(ctx.widgets, 'heading');
  const texts = byType(ctx.widgets, 'text-editor');
  const buttons = byType(ctx.widgets, 'button');
  const iconBoxes = byType(ctx.widgets, 'icon-box');
  const counters = byType(ctx.widgets, 'counter');
  const images = byType(ctx.widgets, 'image');
  const videos = videoWidgets(ctx.widgets);
  const tabs = byType(ctx.widgets, 'elementskit-simple-tab');
  const imageBoxes = byType(ctx.widgets, 'image-box');

  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Nosotros',
    text: 'Trabajamos por un mundo más justo, humano y sostenible.',
    buttons: [],
  });

  const video = videos[0];
  if (video) {
    blocks.push({
      type: 'video',
      title: 'Fundación Rosario Gatón en acción',
      youtubeId: youtubeId(video),
    });
  }

  blocks.push({ type: 'stats', items: counterItems(counters) });

  const aboutHeading = headings.find(
    (widget) => headingTitle(widget) === '¿Quiénes somos?',
  );
  blocks.push({
    type: 'imageText',
    title: aboutHeading ? headingTitle(aboutHeading) : '¿Quiénes somos?',
    text: textMatching(texts, 'es una organización de derechos humanos'),
    buttons: [],
  });

  const tab = tabs[0];
  if (tab) {
    blocks.push({
      type: 'tabs',
      title: 'Misión, visión y valores',
      items: tabItems(tab),
    });
  }

  const imageBox = imageBoxes[0];
  if (imageBox) {
    const name = oneLine(settingString(imageBox.settings, 'title_text'));
    blocks.push({
      type: 'cards',
      title: 'Liderazgo',
      items: [
        {
          title: name,
          text: oneLine(settingString(imageBox.settings, 'description_text')),
          image: images[0] ? mediaOf(ctx.db, images[0]) : undefined,
          imageAlt: name || (images[0] ? mediaAltOf(images[0]) : undefined),
        },
      ],
    });
  }

  blocks.push({
    type: 'cta',
    title: 'Únete / Voluntariado',
    text: textMatching(texts, 'creemos en el poder de las personas'),
    buttons: [
      findButton(buttons, '¡Únete hoy!') ?? findButtonByHref(buttons, '/voluntariado/'),
    ].filter((link): link is Link => link !== null),
  });

  blocks.push({
    type: 'cards',
    title: 'Formas de colaborar',
    items: [iconBoxes[0], iconBoxes[1], iconBoxes[2]].filter(Boolean).map((widget) => ({
      title: iconBoxTitle(widget as ElementorWidget),
      text: iconBoxText(widget as ElementorWidget),
    })),
  });

  return blocks;
}

function buildPrograms(ctx: Context): Block[] {
  const texts = byType(ctx.widgets, 'text-editor');
  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Programas y Proyectos',
    text: 'Áreas de acción de la Fundación Rosario Gatón.',
    buttons: [],
  });

  const intro = textMatching(texts, 'Nuestra labor se enfoca en contribuir');
  if (intro) blocks.push({ type: 'richText', html: `<p>${intro}</p>` });

  blocks.push({
    type: 'programs',
    title: 'Áreas de Acción FRG',
    programs: ctx.programs.map((program) => program.slug),
  });

  return blocks;
}

function buildContact(ctx: Context): Block[] {
  const texts = byType(ctx.widgets, 'text-editor');
  const iconBoxes = byType(ctx.widgets, 'icon-box');
  const socials = byType(ctx.widgets, 'social-icons');
  const maps = byType(ctx.widgets, 'google_maps');

  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Contacto',
    text: 'Estamos siempre abiertos a escuchar y responder.',
    buttons: [],
  });

  blocks.push({
    type: 'cards',
    title: 'Cómo contactarnos',
    items: iconBoxes.map((widget) => ({
      title: iconBoxTitle(widget),
      text: iconBoxText(widget),
    })),
  });

  if (socials.length > 0) {
    blocks.push({ type: 'social', title: 'Síguenos en redes sociales' });
  }

  const intro = textMatching(texts, 'Siempre UIC');
  if (intro) blocks.push({ type: 'richText', html: `<p>${intro}</p>` });

  blocks.push({ type: 'form', form: 'contact' });

  const map = maps[0];
  if (map) {
    blocks.push({
      type: 'map',
      title: 'Encuéntranos',
      query:
        oneLine(settingString(map.settings, 'address')) ||
        'C/ Castillo Esq. 27 de Febrero, Edificio Plaza Park 2do. Nivel, San Fernando de la Maguana, Samaná, República Dominicana',
      zoom: 14,
    });
  }

  return blocks;
}

function buildDonate(ctx: Context): Block[] {
  const headings = byType(ctx.widgets, 'heading');
  const texts = byType(ctx.widgets, 'text-editor');

  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Haz tu donación y cambia vidas',
    text: textMatching(texts, 'Cada aporte'),
    buttons: [],
  });

  const donationUses = iconListContaining(
    ctx.widgets,
    'Alimentación para familias vulnerables',
  );
  if (donationUses.length > 0) {
    blocks.push({
      type: 'list',
      title: '¿A qué destinamos tu donación?',
      items: donationUses,
    });
  }

  const whatToDonate = iconListContaining(ctx.widgets, 'Alimentos no perecederos');
  if (whatToDonate.length > 0) {
    blocks.push({
      type: 'list',
      title: '¿Qué se puede donar?',
      items: whatToDonate,
    });
  }

  blocks.push({
    type: 'cta',
    title: 'Completa el formulario y haz tu aporte',
    text: 'Indícanos cómo te gustaría apoyar nuestro trabajo. Te contactaremos para coordinar el proceso.',
    buttons: [],
  });

  blocks.push({ type: 'form', form: 'donar' });

  const contact = iconListContaining(ctx.widgets, '(809) 290-2255');
  if (contact.length > 0) {
    blocks.push({
      type: 'cards',
      title: 'Más información',
      items: contact.map((item) => ({ title: item, text: '' })),
    });
  }

  const contactHeading = headings.find((widget) =>
    /informaci/i.test(headingTitle(widget)),
  );
  if (contactHeading) {
    blocks.push({
      type: 'cta',
      title: headingTitle(contactHeading),
      text: 'Escríbenos o llámanos para resolver tus dudas.',
      buttons: [],
    });
  }

  return blocks;
}

function buildVolunteer(ctx: Context): Block[] {
  const headings = byType(ctx.widgets, 'heading');
  const texts = byType(ctx.widgets, 'text-editor');

  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Alianzas y Voluntariado',
    text: textMatching(texts, 'acción social') || textMatching(texts, 'voluntario'),
    buttons: [],
  });

  const howToHelp = iconListContaining(ctx.widgets, 'Ser voluntario en jornadas');
  if (howToHelp.length > 0) {
    blocks.push({
      type: 'list',
      title: '¿En qué puedes participar o colaborar?',
      items: howToHelp,
    });
  }

  const donationUses = iconListContaining(
    ctx.widgets,
    'Alimentación para familias vulnerables',
  );
  if (donationUses.length > 0) {
    blocks.push({
      type: 'list',
      title: '¿A qué destinamos tu donación?',
      items: donationUses,
    });
  }

  blocks.push({
    type: 'cta',
    title: 'Completa el formulario y únete a nosotros',
    text: 'Cuéntanos en qué te gustaría colaborar. Nuestro equipo se pondrá en contacto contigo.',
    buttons: [],
  });

  blocks.push({ type: 'form', form: 'voluntariado' });

  const contact = iconListContaining(ctx.widgets, '(809) 290-2255');
  if (contact.length > 0) {
    blocks.push({
      type: 'cards',
      title: 'Más información',
      items: contact.map((item) => ({ title: item, text: '' })),
    });
  }

  const contactHeading = headings.find((widget) =>
    /informaci/i.test(headingTitle(widget)),
  );
  if (contactHeading) {
    blocks.push({
      type: 'cta',
      title: headingTitle(contactHeading),
      text: 'Escríbenos o llámanos para resolver tus dudas.',
      buttons: [],
    });
  }

  return blocks;
}

function buildGallery(ctx: Context): Block[] {
  const galleries = byType(ctx.widgets, 'image-gallery');
  const gallery = galleries[0];

  return [
    {
      type: 'hero',
      title: 'Galería de Imágenes',
      text: 'Un vistazo a nuestro trabajo en las comunidades.',
      buttons: [],
    },
    {
      type: 'gallery',
      title: 'Galería',
      images: gallery ? galleryImages(ctx.db, gallery) : [],
    },
  ];
}

function buildInterlatitudes(ctx: Context): Block[] {
  const texts = byType(ctx.widgets, 'text-editor');
  const videos = videoWidgets(ctx.widgets);
  const images = byType(ctx.widgets, 'image');
  const headings = byType(ctx.widgets, 'heading');

  const blocks: Block[] = [];

  blocks.push({
    type: 'hero',
    title: 'Interlatitudes Médicos',
    text: 'Convenio de cooperación médica internacional.',
    buttons: [],
  });

  const intro = textMatching(texts, 'Este convenio');
  if (intro) blocks.push({ type: 'richText', html: `<p>${intro}</p>` });

  if (images[0]) {
    blocks.push({
      type: 'imageText',
      title: headings[0] ? headingTitle(headings[0]) : undefined,
      text: intro,
      image: mediaOf(ctx.db, images[0]),
      imageAlt: mediaAltOf(images[0]) || 'Interlatitudes Médicos',
      reverse: false,
      buttons: [],
    });
  }

  const videoTitles = [
    'Presentación del proyecto',
    'Presentación del equipo médico base',
    'Firma del convenio de cooperación',
  ];

  videos.forEach((video, index) => {
    blocks.push({
      type: 'video',
      title: videoTitles[index] ?? `Video ${index + 1}`,
      youtubeId: youtubeId(video),
    });
  });

  return blocks;
}

function buildPolicy(ctx: Context): Block[] {
  const texts = byType(ctx.widgets, 'text-editor');

  const blocks: Block[] = [
    {
      type: 'hero',
      title: 'Política de Ética y Seguridad',
      text: 'Nuestro compromiso con la ética, la transparencia y la seguridad de las personas que atendemos.',
      buttons: [],
    },
  ];

  for (const widget of texts) {
    const html = editorHtml(widget);
    if (html) blocks.push({ type: 'richText', html });
  }

  return blocks;
}

function buildTeam(): Block[] {
  return [
    {
      type: 'hero',
      title: 'Nuestro Equipo',
      text: 'Las personas que hacen posible nuestro trabajo.',
      buttons: [],
    },
    {
      type: 'team',
      title: 'Equipo de la Fundación Rosario Gatón',
      intro: 'Las personas que sostienen nuestro trabajo en las comunidades.',
    },
  ];
}

function buildNewsIndex(): Block[] {
  return [
    {
      type: 'hero',
      title: 'Actualidades',
      text: 'Noticias, informes y actividades de la Fundación Rosario Gatón.',
      buttons: [],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Page table                                                                 */
/* -------------------------------------------------------------------------- */

interface PageSpec {
  slug: string;
  file: string;
  title: string;
  order: number;
  nav: boolean;
  navLabel?: string;
  navParent?: string;
  legacyPath: string;
  description?: string;
  noAutoTranslate?: boolean;
  recipe: (ctx: Context) => Block[];
}

const PAGE_SPECS: PageSpec[] = [
  {
    slug: '',
    file: 'inicio',
    title: 'Inicio',
    order: 10,
    nav: true,
    navLabel: 'Inicio',
    legacyPath: '/inicio/',
    description:
      'La Fundación Rosario Gatón trabaja por un mundo más justo, humano y sostenible.',
    recipe: buildHome,
  },
  {
    slug: 'actualidades',
    file: 'actualidades',
    title: 'Actualidades',
    order: 20,
    nav: true,
    legacyPath: '/actualidades/',
    description: 'Noticias, informes y actividades de la Fundación Rosario Gatón.',
    recipe: buildNewsIndex,
  },
  {
    slug: 'programas-y-proyectos',
    file: 'programas-y-proyectos',
    title: 'Programas y Proyectos',
    order: 30,
    nav: true,
    legacyPath: '/programas-y-proyectos/',
    description: 'Áreas de acción de la Fundación Rosario Gatón.',
    recipe: buildPrograms,
  },
  {
    slug: 'galeria-de-imagenes',
    file: 'galeria-de-imagenes',
    title: 'Galería de Imágenes',
    order: 31,
    nav: true,
    navParent: 'programas-y-proyectos',
    legacyPath: '/galeria-de-imagenes/',
    description: 'Galería de imágenes del trabajo de la Fundación Rosario Gatón.',
    recipe: buildGallery,
  },
  {
    slug: 'interlatitudes-medicos',
    file: 'interlatitudes-medicos',
    title: 'Interlatitudes Médicos',
    order: 32,
    nav: true,
    navParent: 'programas-y-proyectos',
    legacyPath: '/interlatitudes-medicos/',
    description: 'Convenio de cooperación médica internacional.',
    recipe: buildInterlatitudes,
  },
  {
    slug: 'nosotros',
    file: 'nosotros',
    title: 'Nosotros',
    order: 40,
    nav: true,
    legacyPath: '/nosotros/',
    description: 'Conoce la Fundación Rosario Gatón: misión, visión, valores y equipo.',
    recipe: buildAbout,
  },
  {
    slug: 'nuestro-equipo',
    file: 'nuestro-equipo',
    title: 'Nuestro Equipo',
    order: 41,
    nav: true,
    legacyPath: '/nuestro-equipo/',
    description: 'El equipo de la Fundación Rosario Gatón.',
    recipe: buildTeam,
  },
  {
    slug: 'politica-de-etica-y-seguridad',
    file: 'politica-de-etica-y-seguridad',
    title: 'Política de Ética y Seguridad',
    order: 50,
    nav: true,
    legacyPath: '/politica-de-etica-y-seguridad/',
    description: 'Política de ética y seguridad de la Fundación Rosario Gatón.',
    noAutoTranslate: true,
    recipe: buildPolicy,
  },
  {
    slug: 'donar',
    file: 'donar',
    title: 'Donar',
    order: 60,
    nav: false,
    legacyPath: '/donar/',
    description: 'Realiza tu donación y cambia vidas con la Fundación Rosario Gatón.',
    noAutoTranslate: true,
    recipe: buildDonate,
  },
  {
    slug: 'voluntariado',
    file: 'voluntariado',
    title: 'Voluntariado',
    order: 61,
    nav: false,
    legacyPath: '/voluntariado/',
    description: 'Únete como voluntario o aliado de la Fundación Rosario Gatón.',
    recipe: buildVolunteer,
  },
  {
    slug: 'contacto',
    file: 'contacto',
    title: 'Contacto',
    order: 70,
    nav: true,
    legacyPath: '/contacto/',
    description:
      'Escríbenos o llámanos. Estamos en San Fernando de la Maguana, Samaná.',
    recipe: buildContact,
  },
];

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function writeDocument(
  folder: string,
  file: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<string> {
  const directory = path.join(CONTENT_DIR, LOCALE, folder);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${file}.md`);
  await writeFile(target, markdownDocument(frontmatter, body), 'utf8');
  return target;
}

async function main(): Promise<void> {
  console.log(`→ reading ${SQL_PATH}`);
  const sql = await readFile(SQL_PATH, 'utf8');
  const db = loadDatabase(sql);
  console.log(`  ${db.posts.size} posts, ${db.attachments.size} attachments`);

  const programsContext: Context = {
    db,
    widgets: [],
    programs: [],
  };

  const programsPage = [...db.posts.values()].find(
    (post) =>
      post.type === 'page' &&
      post.status === 'publish' &&
      post.name === 'programas-y-proyectos',
  );

  if (!programsPage) throw new Error('The "programas-y-proyectos" page was not found.');

  const programsWidgets = elementorWidgets(
    parseElementor(getMeta(db, programsPage.id, '_elementor_data')),
  );
  const programs = extractProgramEntries({
    ...programsContext,
    widgets: programsWidgets,
  });
  console.log(`  ${programs.length} areas of action`);

  // Remove the previous content of this locale so the import is idempotent.
  const localeDir = path.join(CONTENT_DIR, LOCALE);
  await rm(localeDir, { recursive: true, force: true });

  /* --- programs ---------------------------------------------------------- */
  for (const program of programs) {
    await writeDocument(
      'programs',
      program.slug,
      {
        title: program.title,
        slug: program.slug,
        locale: LOCALE,
        summary: program.summary,
        image: program.image,
        imageAlt: program.imageAlt,
        order: program.order,
      },
      '',
    );
  }

  /* --- pages ------------------------------------------------------------- */
  for (const spec of PAGE_SPECS) {
    const page = [...db.posts.values()].find(
      (post) =>
        post.type === 'page' && post.status === 'publish' && post.name === spec.file,
    );

    if (!page) {
      console.warn(`  ! page "${spec.file}" not found — skipped`);
      continue;
    }

    const widgets = elementorWidgets(
      parseElementor(getMeta(db, page.id, '_elementor_data')),
    );
    const blocks = spec.recipe({ db, widgets, programs });

    await writeDocument(
      'pages',
      spec.file,
      {
        title: spec.title,
        slug: spec.slug,
        locale: LOCALE,
        order: spec.order,
        nav: spec.nav,
        navLabel: spec.navLabel,
        navParent: spec.navParent,
        description: spec.description,
        legacyPath: spec.legacyPath,
        noAutoTranslate: spec.noAutoTranslate ?? false,
        blocks,
      },
      '',
    );

    console.log(`  page ${spec.file.padEnd(28)} ${blocks.length} blocks`);
  }

  /* --- team -------------------------------------------------------------- */
  const aboutPage = [...db.posts.values()].find(
    (post) =>
      post.type === 'page' && post.status === 'publish' && post.name === 'nosotros',
  );

  if (aboutPage) {
    const widgets = elementorWidgets(
      parseElementor(getMeta(db, aboutPage.id, '_elementor_data')),
    );

    const members = extractTeamMembers({ db, widgets, programs: [] });

    let order = 1;
    for (const member of members) {
      const slug = slugify(member.name);

      await writeDocument(
        'team',
        slug,
        {
          name: member.name,
          slug,
          locale: LOCALE,
          role: member.role,
          bio: member.bio,
          image: member.image,
          imageAlt: member.imageAlt,
          order,
        },
        '',
      );

      order += 1;
    }

    console.log(`  ${members.length} team members`);
  }

  /* --- categories & tags ------------------------------------------------- */ const published =
    [...db.posts.values()].filter(
      (post) => post.type === 'post' && post.status === 'publish',
    );

  const usedTerms = new Map<number, { taxonomy: string; count: number }>();
  for (const post of published) {
    for (const relation of db.relationships.get(post.id) ?? []) {
      const current = usedTerms.get(relation.termId);
      usedTerms.set(relation.termId, {
        taxonomy: relation.taxonomy,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  let categoryOrder = 10;
  for (const [termId, usage] of [...usedTerms.entries()].sort((a, b) => a[0] - b[0])) {
    const term = db.terms.get(termId);
    if (!term) continue;

    const taxonomy = db.taxonomies.get(termId);
    const description = taxonomy?.description ?? '';

    if (usage.taxonomy === 'category') {
      await writeDocument(
        'categories',
        term.slug,
        {
          title: CATEGORY_TITLE_OVERRIDES[term.slug] ?? term.name,
          slug: term.slug,
          locale: LOCALE,
          description: description || undefined,
          order: categoryOrder,
        },
        '',
      );
      categoryOrder += 10;
    } else if (usage.taxonomy === 'post_tag') {
      await writeDocument(
        'tags',
        term.slug,
        { title: term.name, slug: term.slug, locale: LOCALE },
        '',
      );
    }
  }

  /* --- posts ------------------------------------------------------------- */
  const takenSlugs = new Set<string>();
  let publishedCount = 0;

  for (const post of published.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )) {
    const override = POST_OVERRIDES[post.name] ?? {};
    const body = htmlToMarkdown(post.content);
    const yoastDescription = getMeta(db, post.id, '_yoast_wpseo_metadesc').trim();

    const title = override.title ?? oneLine(post.title);
    const resolvedTitle = title || titleFromBody(body) || 'Sin título';

    const slug = uniqueSlug(
      override.slug ?? post.name ?? slugify(resolvedTitle),
      takenSlugs,
    );
    const relations = db.relationships.get(post.id) ?? [];

    const categories = relations
      .filter((relation) => relation.taxonomy === 'category')
      .map((relation) => db.terms.get(relation.termId)?.slug)
      .filter((value): value is string => Boolean(value));

    const tags = relations
      .filter((relation) => relation.taxonomy === 'post_tag')
      .map((relation) => db.terms.get(relation.termId)?.slug)
      .filter((value): value is string => Boolean(value));

    const thumbnailId = Number.parseInt(getMeta(db, post.id, '_thumbnail_id'), 10);
    const attachment = Number.isFinite(thumbnailId)
      ? db.attachments.get(thumbnailId)
      : undefined;

    const excerpt = yoastDescription || stripHtml(post.excerpt) || buildExcerpt(body);

    await writeDocument(
      'posts',
      slug,
      {
        title: resolvedTitle,
        slug,
        locale: LOCALE,
        date: post.date.replace(' ', 'T'),
        excerpt: excerpt.trim(),
        categories,
        tags,
        image: attachment?.file,
        imageAlt: attachment?.alt || undefined,
        legacyPath: `/${post.name}/`,
        noAutoTranslate: false,
      },
      body,
    );

    publishedCount += 1;
  }

  console.log(`  ${publishedCount} posts, ${usedTerms.size} terms`);
  console.log('✓ done');
}

await main();

/**
 * The main navigation menu.
 *
 * The menu tree was migrated from the WordPress menu "menu 1" (id 6). The
 * `nav`, `navLabel` and `navParent` fields of a page decide where it shows up,
 * so the menu can be reshaped by editing frontmatter only.
 */
import { localePath, type Locale } from './locales.ts';
import { getPages, type PageEntry } from './content.ts';

export interface NavItem {
  label: string;
  href: string;
  /** Child items, rendered as a dropdown on desktop. */
  children: NavItem[];
}

/** The slug of the donation page, linked from the header button. */
export const donateSlug = 'donar';

function toItem(page: PageEntry, locale: Locale): NavItem {
  return {
    label: page.data.navLabel ?? page.data.title,
    href: localePath(locale, page.data.slug),
    children: [],
  };
}

/**
 * Build the navigation tree for a locale.
 *
 * Top-level pages come first (ordered by `order`), then their children
 * (matched through `navParent`).
 */
export async function buildNavigation(locale: Locale): Promise<NavItem[]> {
  const pages = await getPages(locale);
  const visible = pages.filter((page) => page.data.nav);

  const childrenByParent = new Map<string, NavItem[]>();

  for (const page of visible) {
    const parent = page.data.navParent;
    if (!parent) continue;

    const siblings = childrenByParent.get(parent) ?? [];
    siblings.push(toItem(page, locale));
    childrenByParent.set(parent, siblings);
  }

  const items: NavItem[] = [];

  for (const page of visible) {
    if (page.data.navParent) continue;

    items.push({
      ...toItem(page, locale),
      children: childrenByParent.get(page.data.slug) ?? [],
    });
  }

  return items;
}

/** The URL of the "Donar" button in the header. */
export function donatePath(locale: Locale): string {
  return localePath(locale, donateSlug);
}

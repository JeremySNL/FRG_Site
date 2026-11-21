/**
 * How the team page is organised.
 *
 * The page used to print every person in one grid ordered by `order`, which
 * left presidency, directors, continental and country ambassadors looking
 * alike (and the country ambassadors in no fixed order). Each team document
 * now says which `group` it belongs to and, for country ambassadors, which
 * `continent` it represents (directors name an `area` instead); `order`
 * only sorts people inside a group or area.
 */

/** The sections of the page, in the order they are shown. */
export const TEAM_GROUPS = [
  'presidencia',
  'direccion',
  'continental',
  'nacional',
] as const;
export type TeamGroup = (typeof TEAM_GROUPS)[number];

/** Continents a country ambassador can belong to, in the order they are shown. */
export const TEAM_CONTINENTS = [
  'africa',
  'asia',
  'america',
  'europa',
  'oceania',
] as const;
export type TeamContinent = (typeof TEAM_CONTINENTS)[number];

/**
 * Areas the `direccion` group is split into, in the order they are shown.
 * A director without an area still gets shown, after the areas.
 */
export const TEAM_AREAS = ['prensa', 'gestion', 'salud', 'representaciones'] as const;
export type TeamArea = (typeof TEAM_AREAS)[number];

interface Groupable {
  data: {
    name: string;
    order: number;
    group: TeamGroup;
    continent?: TeamContinent | undefined;
    area?: TeamArea | undefined;
  };
}

export interface TeamSection<T> {
  group: TeamGroup;
  /** Only set for the country ambassadors, who are split by continent. */
  continent?: TeamContinent;
  /** Only set for `direccion`, which is split by area. */
  area?: TeamArea;
  members: T[];
}

/** `order` first, then the name, so people sharing an order are stable. */
function byOrderThenName(locale: string) {
  return (a: Groupable, b: Groupable): number =>
    a.data.order - b.data.order || a.data.name.localeCompare(b.data.name, locale);
}

/**
 * Splits the members into the sections of the page. A section with nobody in
 * it is left out, so a group can exist in the schema before it has members.
 */
export function groupTeam<T extends Groupable>(
  members: readonly T[],
  locale: string,
): TeamSection<T>[] {
  const sorted = [...members].sort(byOrderThenName(locale));
  const sections: TeamSection<T>[] = [];

  for (const group of TEAM_GROUPS) {
    const inGroup = sorted.filter((member) => member.data.group === group);

    if (group === 'direccion') {
      for (const area of TEAM_AREAS) {
        const inArea = inGroup.filter((member) => member.data.area === area);
        if (inArea.length > 0) sections.push({ group, area, members: inArea });
      }

      // Directors that did not say an area still get shown.
      const loose = inGroup.filter((member) => member.data.area === undefined);
      if (loose.length > 0) sections.push({ group, members: loose });
      continue;
    }

    if (group !== 'nacional') {
      if (inGroup.length > 0) sections.push({ group, members: inGroup });
      continue;
    }

    for (const continent of TEAM_CONTINENTS) {
      const inContinent = inGroup.filter(
        (member) => member.data.continent === continent,
      );
      if (inContinent.length > 0)
        sections.push({ group, continent, members: inContinent });
    }

    // Country ambassadors that did not say a continent still get shown.
    const loose = inGroup.filter((member) => member.data.continent === undefined);
    if (loose.length > 0) sections.push({ group, members: loose });
  }

  return sections;
}

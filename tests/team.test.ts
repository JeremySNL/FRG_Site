import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  groupTeam,
  TEAM_AREAS,
  TEAM_CONTINENTS,
  TEAM_GROUPS,
} from '../src/lib/team.ts';
import type { TeamArea, TeamContinent, TeamGroup } from '../src/lib/team.ts';

function member(
  name: string,
  group: TeamGroup,
  order: number,
  continent?: TeamContinent,
  area?: TeamArea,
) {
  return { data: { name, group, order, continent, area } };
}

describe('groupTeam', () => {
  it('shows the groups in order and splits country ambassadors by continent', () => {
    const sections = groupTeam(
      [
        member('Nacional Asia', 'nacional', 3, 'asia'),
        member('Nacional África', 'nacional', 3, 'africa'),
        member('Continental', 'continental', 2, 'africa'),
        member('Presidente', 'presidencia', 1),
      ],
      'es',
    );

    expect(sections.map((s) => [s.group, s.continent])).toEqual([
      ['presidencia', undefined],
      ['continental', undefined],
      ['nacional', 'africa'],
      ['nacional', 'asia'],
    ]);
  });

  it('sorts by order and then by name, so equal orders are stable', () => {
    const [section] = groupTeam(
      [
        member('Zoe', 'direccion', 5),
        member('Álvaro', 'direccion', 5),
        member('Primero', 'direccion', 1),
      ],
      'es',
    );

    expect(section?.members.map((m) => m.data.name)).toEqual([
      'Primero',
      'Álvaro',
      'Zoe',
    ]);
  });

  it('leaves empty sections out and keeps country ambassadors without continent', () => {
    const sections = groupTeam([member('Sin continente', 'nacional', 3)], 'es');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.group).toBe('nacional');
    expect(sections[0]?.continent).toBeUndefined();
  });
});

describe('groupTeam by area', () => {
  it('splits direccion by area in the declared order and keeps directors without one', () => {
    const sections = groupTeam(
      [
        member('Salud', 'direccion', 3, undefined, 'salud'),
        member('Prensa', 'direccion', 3, undefined, 'prensa'),
        member('Sin área', 'direccion', 3),
        member('Otra prensa', 'direccion', 3, undefined, 'prensa'),
      ],
      'es',
    );

    expect(sections.map((s) => [s.group, s.area, s.members.length])).toEqual([
      ['direccion', 'prensa', 2],
      ['direccion', 'salud', 1],
      ['direccion', undefined, 1],
    ]);
  });

  it('does not split the other groups by area', () => {
    const sections = groupTeam([member('Continental', 'continental', 2)], 'es');

    expect(sections).toHaveLength(1);
    expect(sections[0]?.area).toBeUndefined();
  });
});

describe('team documents', () => {
  it('give every member a valid group and every country ambassador a continent', async () => {
    const root = join(import.meta.dirname, '..', 'src', 'content');

    for (const locale of await readdir(root)) {
      const dir = join(root, locale, 'team');
      const files = await readdir(dir).catch(() => []);

      for (const file of files.filter((name) => name.endsWith('.md'))) {
        const text = await readFile(join(dir, file), 'utf8');
        const group = /^group:\s*"?([\w-]+)"?/m.exec(text)?.[1];
        const continent = /^continent:\s*"?([\w-]+)"?/m.exec(text)?.[1];

        expect(TEAM_GROUPS as readonly string[], `${locale}/${file} group`).toContain(
          group,
        );
        const area = /^area:\s*"?([\w-]+)"?/m.exec(text)?.[1];

        if (group === 'direccion') {
          expect(TEAM_AREAS as readonly string[], `${locale}/${file} area`).toContain(
            area,
          );
        }
        if (group === 'nacional') {
          expect(
            TEAM_CONTINENTS as readonly string[],
            `${locale}/${file} continent`,
          ).toContain(continent);
        }
      }
    }
  });
});

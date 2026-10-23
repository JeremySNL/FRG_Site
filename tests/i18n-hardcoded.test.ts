/**
 * User-visible copy must live in `src/i18n/*.json`, never hardcoded inside
 * components. A hardcoded string does not translate when the locale changes
 * (the reader would see Spanish under /en/), so the known offenders are
 * pinned out of `src/components` by this scan.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const root = process.cwd();
const componentsDir = join(root, 'src', 'components');

/** Spanish phrases that must never be hardcoded in a component again. */
const hardcodedSpanish = [
  // Stats block heading + subtitle
  'Impacto y Logros',
  'Resultados que construyen confianza',
  // Ambassadors block
  'Embajador General Continental',
  'Embajadores por País / Área',
  'Representante principal y portavoz',
  // Form + newsletter client-side fallbacks
  '¡Gracias! Te has suscrito',
  '¡Gracias! Hemos recibido',
  // Contact page: contact details card
  'Información de Contacto',
  'Correo Electrónico',
  'Teléfono',
  'Dirección',
  // Footer quick-link labels
  'Actualidades',
  'Programas y Proyectos',
  'Galería de Imágenes',
  'Nuestro Equipo',
  'Política de Ética y Seguridad',
  'Contacto',
];

function listAstroFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const entry = join(dir, name);
    if (statSync(entry).isDirectory()) {
      files.push(...listAstroFiles(entry));
    } else if (name.endsWith('.astro')) {
      files.push(entry);
    }
  }
  return files;
}

const offenders: string[] = [];
for (const file of listAstroFiles(componentsDir)) {
  // Comments may mention Spanish page titles legitimately; copy in markup,
  // attributes and scripts does not.
  const withoutComments = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  for (const phrase of hardcodedSpanish) {
    if (withoutComments.includes(phrase)) {
      offenders.push(
        `${relative(root, file)} → "${phrase}" (move it to src/i18n/*.json and consume it through getUi)`,
      );
    }
  }
}

it('components contain no hardcoded Spanish copy', () => {
  expect(offenders).toEqual([]);
});

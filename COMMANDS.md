# Manual de comandos

Qué puedes hacer en este proyecto, por tarea, con el comando exacto.

Todo se ejecuta desde la raíz del proyecto (`D:\Devspace\Astro\FRG_Site`).

## Cómo leer esto

| Marca | Significa                                                   |
| ----- | ----------------------------------------------------------- |
| 🟢    | Seguro. No rompe nada aunque lo repitas.                    |
| 🟡    | Escribe archivos o llama una API. Revisa el resultado.      |
| 🔴    | Borra o reescribe contenido. Solo con intención y respaldo. |

Dos reglas de sintaxis:

1. Todo es `npm run <nombre>`.
2. Las banderas van **después de `--`**: `npm run post:ready -- --slug mi-post`.

---

## T1. Empezar a trabajar (primera vez o máquina nueva) 🟢

```bash
node -v            # tiene que ser >= 22.23.4 (mira .nvmrc)
npm install
npm run dev        # http://localhost:4321
```

El archivo `.env` **no está en el repo** (está ignorado por git). Si no lo tienes, pídemelo: sin él no funcionan las traducciones ni las subidas.

Necesita estas claves: `OPENAI_API_KEY` (traducir), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (subir imágenes). `MEDIA_BASE_URL` es opcional: por defecto apunta al dominio de media.

## T2. El día a día 🟢

```bash
npm run dev        # servidor local con recarga
npm run check      # valida .astro, frontmatter y content collections
```

`check` es el que te avisa si un bloque o un campo de frontmatter está mal. `dev` puede verse bien y `check` fallar igual: ejecuta `check` antes de hacer push.

## T3. Publicar un post nuevo 🟡

Son cinco pasos. Los idiomas **no los escribes tú**.

**1. Crea el archivo** `src/content/es/posts/<slug>.md`

```yaml
---
title: 'Jornada médica en Santo Domingo Este'
slug: 'jornada-medica-santo-domingo-este'
locale: 'es'
date: '2026-11-05T10:00:00'
excerpt: 'Más de 300 familias recibieron atención gratuita.'
categories: ['salud']
tags: ['jornada-medica']
image: 'PENDIENTE'
imageAlt: 'Pacientes esperando atención'
---
Escribe el cuerpo en Markdown normal.

![Pacientes esperando atención](https://media.fundacionrosariogaton.org/photos/.../01-foto.webp)
```

El nombre del archivo y el `slug` tienen que ser **idénticos**. `categories` y `tags` solo aceptan slugs que ya existan en `src/content/es/categories/` y `src/content/es/tags/`.

Si el post tiene video, va en el frontmatter como `videoUrl` con una URL de YouTube (`watch?v=`, `youtu.be` o `/shorts/`). Nunca dentro del cuerpo ni como iframe: el sitio construye el reproductor.

**2. Sube las fotos**

```bash
npm run media:add -- --post jornada-medica-santo-domingo-este --file ./fotos/entrega.jpg ./fotos/IMG-2025.jpg
```

Codifica a WebP, las sube y te imprime dos bloques listos para copiar. Agrega `--dry-run` para ver qué haría sin subir nada.

**3. Pega lo que imprimió**

- `image:` del frontmatter → **key relativa** (`photos/2026-11-05-.../01.webp`)
- imágenes del cuerpo → **URL absoluta** (`https://media.fundacionrosariogaton.org/photos/...`)

Esto no es opcional: Astro resuelve una ruta relativa del cuerpo como archivo local y **rompe el build** con `ImageNotFound`.

**4. Prepara el post**

```bash
npm run post:ready -- --slug jornada-medica-santo-domingo-este
```

Traduce ese post a `en`, `fr`, `ja` y `zh-TW`, y después ejecuta `check`, `typecheck`, `lint`, los tests y el build. Si algo falla, te dice qué.

Opcional: `--locales en,fr` para traducir solo algunos idiomas. `--dry-run` para ver el alcance sin llamar a la API ni escribir.

**5. Commit y push**

El push a `main` dispara el deploy en Cloudflare solo. No hay que hacer nada más.

## T4. Agregar fotos a un post que ya existe 🟡

Igual que el paso 2 de T3: `media:add` lista la carpeta y **continúa la numeración**. Si ya hay `01` a `05`, arranca en `06`. Nunca pisa una imagen existente.

## T5. Editar una página 🟡

Las páginas viven en `src/content/es/pages/<slug>.md` y se arman con **bloques** (a diferencia de los posts, que son Markdown libre).

```bash
npm run check      # después de editar
```

Ojo: los otros idiomas ya están generados. Si cambias el texto en español, la versión traducida **no se actualiza sola**. Para regenerarla:

```bash
npm run translate -- --locale en
```

Y si quieres ver qué haría antes: `npm run translate -- --locale en --dry-run`.

## T6. Traducir contenido 🟡

```bash
npm run translate -- --dry-run                  # ver el plan, sin API ni escrituras
npm run translate -- --locale en                # un idioma
npm run translate -- --post mi-post             # un post
npm run translate                               # todo lo que falte
```

Lo que ya existe **no se sobrescribe** en una corrida normal.

Los posts con fecha anterior a `2025-01-01` **no se traducen a propósito** (quedan solo en español). Es una regla del proyecto, no un error.

`--force` rehace un idioma completo. No lo uses para "arreglar" algo: puede reemplazar traducciones ya revisadas.

## T7. Programas y equipo 🟡

Cada programa tiene su portada en `programs/<slug>/cover.webp` y su texto en `src/content/es/programs/<slug>.md`. Cada persona del equipo tiene su retrato en `team/<persona>.webp`.

```bash
npm run media:add -- --program vivienda-digna-e-infraestructura-basica --file ./nueva-portada.jpg
npm run media:add -- --team rosario-gaton --file ./retrato.jpg
```

Estos dos destinos usan una **clave fija**, así que el comando no sobrescribe: si la portada ya existe, sube `cover-2.webp`, y la próxima `cover-3.webp`. Eso es a propósito (los objetos se cachean un año como inmutables, y pisar la misma clave dejaría la imagen vieja en los navegadores). El comando te imprime la línea de `image` que tenés que pegar en el `.md` del programa o de la persona, y te recuerda la ruta exacta del archivo a editar. La portada vieja queda en el bucket.

La tarjeta de programa muestra la imagen con recorte 4:3, así que conviene una foto apaisada.

## T7b. Imágenes de una página o de una carpeta cualquiera 🟡

```bash
npm run media:add -- --page nosotros --file ./foto.jpg
npm run media:add -- --dir brand --file ./logo-nuevo.png
```

`--page` escribe en `pages/<slug>/` y `--dir` en la carpeta que le pases (con barra incluida, ej. `brand/` o `photos/2026-11-05-evento`). Los dos **numeran**: si la carpeta ya tiene `01`, la nueva entra como `02`, y nunca pisan nada.

## T8. Cambiar colores o tipografías 🔴 (por el test, no por riesgo)

Los tokens están en **dos lugares que deben coincidir**:

- `design/tokens.ts`
- `src/styles/global.css` (bloque `@theme`)

```bash
npm run test       # tests/tokens.test.ts falla si uno de los dos quedó atrás
```

Si cambias uno solo, el test lo detecta. Es a propósito.

## T9. Agregar un tipo de bloque nuevo 🔴 (toca cuatro archivos)

1. `src/lib/blocks.ts` — el tipo TypeScript
2. `src/content.config.ts` — el schema Zod del bloque
3. `src/components/blocks/BlockRenderer.astro` — el mapeo tipo → componente
4. `src/components/blocks/<Nuevo>.astro` — el componente

```bash
npm run test       # tests/blocks.test.ts exige que tipo y schema coincidan
npm run check
```

## T10. Probar antes de hacer push 🟢

```bash
npm run check      # Astro + content collections
npm run typecheck  # solo TypeScript
npm run lint       # ESLint
npm run test       # suite de Vitest
npm run build      # build de producción completo
```

`check` y `typecheck` no son lo mismo: el primero entiende archivos `.astro` y el frontmatter de las colecciones; el segundo solo TypeScript.

E2E (navegador real, más lento):

```bash
npm run test:e2e
```

Levanta solo el servidor de desarrollo en el puerto 4321. Si falta el navegador: `npx playwright install chromium`.

Un test suelto: `npx vitest run tests/tokens.test.ts` o `npx vitest run -t "texto del test"`.

### Atajos que conviene conocer

```bash
npm run test:watch   # tests en modo escucha, al guardar un archivo
npm run lint:fix     # ESLint corrige lo que puede
```

Formato: **no uses `npm run format`**. Ese comando reescribe el formato de **todo el repo** (más de 1200 archivos hoy están fuera de estilo), y termina mezclado en tu commit. Para un archivo puntual:

```bash
npx prettier --write src/components/blocks/MiBloque.astro
```

`npm run format:check` existe, pero falla por ese mismo estado de base. No es tu cambio.

## T11. Ver el sitio construido y desplegar 🟢

```bash
npm run preview          # sirve el último build local
npm run deploy:preview   # build + wrangler en seco, sin publicar
```

El deploy real es **automático**: push a `main` y Cloudflare construye y publica.

```bash
npm run deploy           # deploy manual directo con Wrangler
```

Ese último existe, pero el camino normal es el push. Ojo: **no** agregues `main` ni `assets` a `wrangler.jsonc`; el build los genera.

## T12. Migración desde WordPress — histórico 🔴 NO REPETIR

Estos comandos ya se ejecutaron una vez. Existen como registro de cómo se hizo el sitio, no como herramientas de trabajo.

| Comando                     | Qué hace                                                                         | Riesgo                          |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `npm run migrate:extract`   | Importa el dump de WordPress y **borra `src/content/es/`** antes de reescribirlo | 🔴 destruye el contenido actual |
| `npm run migrate:media`     | Recrea las keys viejas `YYYY/MM/...` en el bucket                                | 🔴 desordena el bucket          |
| `npm run migrate:redirects` | Regenera `public/_redirects` desde el frontmatter                                | 🟢 seguro, determinista         |

Si alguna vez hay que tocarlos, hablemos primero.

Las herramientas de media modernas (`plan-media-keys`, `apply-media-keys`) tampoco son de uso diario: ya cumplieron. Para imágenes nuevas, siempre `media:add`.

---

## Referencia rápida

| Quiero…                           | Comando                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| Levantar el sitio                 | `npm run dev`                                                   |
| Publicar un post                  | `media:add` → pegar referencias → `post:ready -- --slug <slug>` |
| Agregar fotos a un post           | `npm run media:add -- --post <slug> --file <rutas...>`          |
| Cambiar la portada de un programa | `npm run media:add -- --program <slug> --file <imagen>`         |
| Cambiar la foto del equipo        | `npm run media:add -- --team <persona> --file <imagen>`         |
| Imagen de una página              | `npm run media:add -- --page <slug> --file <imagen>`            |
| Imagen en otra carpeta            | `npm run media:add -- --dir <carpeta> --file <imagen>`          |
| Ver qué haría una subida          | `npm run media:add -- ... --dry-run`                            |
| Traducir un idioma                | `npm run translate -- --locale <locale>`                        |
| Ver el plan de traducción         | `npm run translate -- --dry-run`                                |
| Validar todo                      | `check` → `typecheck` → `lint` → `test` → `build`               |
| Test suelto                       | `npx vitest run tests/<archivo>.test.ts`                        |
| Tests en escucha                  | `npm run test:watch`                                            |
| Corregir lint                     | `npm run lint:fix`                                              |
| Formatear un archivo              | `npx prettier --write <archivo>`                                |
| Probar en navegador               | `npm run test:e2e`                                              |
| Ver el build local                | `npm run preview`                                               |
| Publicar                          | push a `main`                                                   |
| Deploy manual                     | `npm run deploy`                                                |

## Errores que ya conocemos

| Error                                       | Qué significa                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ImageNotFound` al construir                | Una imagen del cuerpo usa ruta relativa. Tiene que ser URL absoluta.                                                   |
| `tests/tokens.test.ts` falla                | Cambiaste un color en un solo archivo. Toca `design/tokens.ts` y `global.css`.                                         |
| `tests/blocks.test.ts` falla                | El tipo del bloque y el schema Zod no coinciden.                                                                       |
| `format:check` falla en cientos de archivos | Es el estado actual del repo, no tu cambio. No lo mezcles con otro trabajo.                                            |
| Un post nuevo no aparece traducido          | Revisa que `date` no sea anterior a 2025-01-01, o si tiene `noAutoTranslate: true`.                                    |
| Una imagen da 404                           | La key del contenido no coincide con el objeto del bucket. Confirma con `media:add --dry-run` o mira el campo `image`. |
| El deploy no arranca                        | El push tiene que ir a `main`. Revisa el estado en el panel de Cloudflare.                                             |

# Guía de administración de FRG_Site

Esta guía cubre el trabajo editorial habitual y las verificaciones técnicas del sitio de FRG_Site. El proyecto guarda el contenido en Markdown con Astro Content Collections: la preparación del artículo es local y la publicación se dispara al hacer push a `main`.

## Camino rápido: preparar y publicar un post

1. Usa [`POST_AUTHORING_PROMPT.md`](POST_AUTHORING_PROMPT.md) con los datos del artículo y el material de origen. El prompt devuelve un post en Markdown en español; las traducciones se manejan aparte en el flujo de publicación.
2. Guárdalo como `src/content/es/posts/<slug>.md`. El nombre del archivo y el `slug` del frontmatter tienen que ser idénticos.
3. Sube las imágenes del post con `npm run media:add -- --post <slug> --file <rutas...>`. El comando las codifica, las sube e imprime la key relativa para el frontmatter y las URL absolutas para el cuerpo. `post:ready` sigue sin subir medios nunca.
4. Ejecuta `npm run post:ready -- --slug <slug>`. Para elegir idiomas, agrega `--locales en,fr`; si lo omites, se seleccionan todos los idiomas de traducción configurados. Agrega `--dry-run` para ver el alcance de la traducción sin llamadas a la API ni escrituras en disco.
5. Revisa el Markdown traducido y las rutas de vista previa que informa el comando. Ejecuta `npm run preview` para inspeccionar el build en local.
6. Haz commit de los cambios revisados y push a `main`. Según el flujo de publicación configurado, ese push dispara el despliegue automático de Cloudflare. El comando de preparación no hace commit, push ni deploy.

El comando de preparación necesita `OPENAI_API_KEY` en el archivo `.env` (ignorado por git) cuando hace falta traducción automática. Nunca copies secretos dentro del contenido ni hagas commit de `.env`.

## Cómo se estructuran los posts

Los posts son archivos Markdown dentro de `src/content/<locale>/posts/`. La fuente en español es `src/content/es/posts/`. Los campos obligatorios del frontmatter son:

```yaml
title: 'Título del artículo'
slug: 'slug-del-articulo'
locale: 'es'
date: '2026-10-26'
```

Los campos opcionales son `updated`, `excerpt`, `author`, `categories`, `tags`, `image`, `imageAlt`, `videoUrl`, `legacyPath`, `seo` y `noAutoTranslate`. Usa slugs de categoría y etiqueta que ya existan en los directorios de taxonomía en español. El prompt de redacción lista los valores permitidos actuales.

`PostView.astro` renderiza el título, la fecha, el extracto opcional y la imagen destacada. El cuerpo es Markdown normal, así que títulos, párrafos, listas, enlaces e imágenes en línea pueden aparecer en cualquier orden editorial.

Las referencias a imágenes son asimétricas a propósito: el campo `image` del frontmatter lleva la **key relativa del medio** (se resuelve con `mediaUrl()`), mientras que las imágenes del cuerpo en Markdown necesitan la **URL absoluta del medio**. El pipeline de contenido de Astro interpreta una ruta relativa suelta del cuerpo como un asset local y rompe el build con `ImageNotFound`.

Los posts no usan el sistema de bloques tipados de las páginas. Para un video, usa el campo `videoUrl` del frontmatter con una URL de YouTube (`watch?v=`, `youtu.be`, `/shorts/` o `/live/`): el sitio lo renderiza como un reproductor con carga diferida, que solo crea el iframe cuando el visitante hace clic. No escribas HTML de embed ni pongas el enlace del video dentro del cuerpo, y no uses `videoUrl` con plataformas distintas de YouTube porque el reproductor no lo reconocería.

## Comportamiento de la traducción

- `npm run post:ready -- --slug <slug> [--locales en,fr]` traduce solo el post seleccionado y no toca los archivos de traducción de páginas, categorías, etiquetas, programas, equipo ni interfaz.
- Las copias ya traducidas se conservan en el modo normal (sin `--force`). Si una traducción existente se omite, revísala a mano cuando cambie la fuente en español; el comando de preparación no la sobrescribe.
- Los posts marcados con `noAutoTranslate: true` y los anteriores a la fecha de corte del traductor se omiten a propósito.
- El comando por idioma sigue disponible: `npm run translate -- --locale en --dry-run` muestra el trabajo de un idioma destino. Ejecutar `npm run translate` sin idioma procesa todos los idiomas destino configurados y todas las colecciones admitidas.
- Evita `--force` para publicar de rutina. Puede reconstruir un idioma destino completo y reemplazar traducciones ya generadas.

## Validación y vista previa local

`post:ready` valida la fuente con Astro antes de traducir y, después de traducir, ejecuta typecheck, lint, tests y un build de producción:

| Comando                                | Para qué sirve                                              |
| -------------------------------------- | ----------------------------------------------------------- |
| `npm run check`                        | Validación de Astro y content collections antes de traducir |
| `npm run typecheck`                    | Validación de TypeScript                                    |
| `npm run lint`                         | Comprobaciones de ESLint                                    |
| `npm run test -- --test-timeout=30000` | Suite de Vitest con el timeout que admite el repositorio     |
| `npm run build`                        | Genera y valida el sitio estático                           |
| `npm run preview`                      | Sirve el build local para revisión visual                   |

Si un comando falla después de que se escribieron las traducciones, esos archivos generados quedan en el árbol de trabajo. Corrige el problema informado y vuelve a ejecutar el comando de preparación; no uses `--force` para recuperarte.

## Otro contenido editorial

### Páginas

Las páginas viven en `src/content/<locale>/pages/`. Su frontmatter incluye un arreglo `blocks` tipado, a diferencia de los posts. El schema de `blocks` se declara en `src/content.config.ts`, los tipos de TypeScript están en `src/lib/blocks.ts` y `src/components/blocks/BlockRenderer.astro` mapea cada tipo a un componente. Agregar un bloque nuevo obliga a mantener sincronizados esas definiciones, el renderer y los tests de bloques.

La navegación se controla con el frontmatter de la página: `nav`, `navLabel` y `navParent`. Antes de cambiar la composición de una página, usa una página o un bloque existente como referencia.

### Categorías y etiquetas

Los registros de categorías y etiquetas en español viven en `src/content/es/categories/` y `src/content/es/tags/`. Sus traducciones generadas viven en los directorios del idioma correspondiente. Los posts referencian sus slugs, no los nombres visibles.

### Textos de interfaz

Las cadenas compartidas de la interfaz viven en `src/i18n/<locale>.json`. La traducción de contenido y la de interfaz las maneja `scripts/translate.mts`; el comando de preparación de un post excluye a propósito las cadenas de interfaz.

## Imágenes y otros medios

Los medios del sitio se sirven desde la base pública de R2 (`https://media.fundacionrosariogaton.org`). Para una imagen nueva de un artículo:

1. Ejecuta `npm run media:add -- --post <slug> --file <rutas...>` (o `--event <AAAA-MM-DD-slug>` para medios que no pertenecen a un post). Agrega `--dry-run` para ver qué haría sin subir nada.
2. El comando codifica cada archivo a un único WebP, lo numera dentro de la carpeta del evento del post, lo sube, verifica la URL pública e imprime dos bloques:
   - la key relativa para el campo `image` del frontmatter,
   - las URL absolutas para las imágenes en línea del Markdown.
3. Revisa el texto alternativo y el build local antes de hacer push.

Las keys son inmutables en la caché, así que el comando se niega a sobrescribir una key existente con otros bytes. Para reemplazar una foto, súbela con una key nueva y actualiza la referencia. Las utilidades antiguas de migración desde WordPress (`npm run migrate:media`) son para trabajo de migración, no para el flujo de subida de cada artículo. No pongas credenciales ni URL privadas dentro del Markdown.

## Código del sitio y formularios

- El ruteo y la selección de idioma están en `src/pages/[...path].astro` y `src/lib/locales.ts`; el español es el idioma por defecto.
- Los endpoints de formularios están en `src/pages/api/`. Usan los ayudantes compartidos de validación y rate limit de `src/lib/api.ts`, y secretos del entorno de despliegue.
- Nunca pongas secretos de Turnstile o Resend en el contenido, en archivos de cliente ni en configuración versionada. Manéjalos con el flujo de secretos de Cloudflare.
- El `wrangler.jsonc` de la raíz omite a propósito `main`/`assets`, que son generados. Los despliegues de rutina deben usar el pipeline de push a `main`, no editar la configuración generada.

## Problemas frecuentes

- **Un post falta en otro idioma:** revisa su archivo traducido en `src/content/<locale>/posts/`; vuelve a ejecutar `post:ready` para ese slug e idioma. Las traducciones existentes no se sobrescriben automáticamente.
- **Una categoría o etiqueta no se muestra bien:** verifica el slug exacto contra los archivos de `src/content/es/categories/` o `src/content/es/tags/`.
- **Una imagen aparece rota:** confirma que el `image` del frontmatter sea la key relativa y que las imágenes del cuerpo usen la URL absoluta. Una ruta relativa en el cuerpo rompe el build con `ImageNotFound`; una key mal escrita devuelve 404 desde el host de medios.
- **Falla `astro check` o el build:** corrige el problema de frontmatter, schema o Markdown que se informe antes de hacer push.
- **El despliegue no arranca:** verifica que el cambio se haya pusheado a `main` y revisa el estado del despliegue en Cloudflare. Los archivos del repositorio por sí solos no exponen el estado del panel de Cloudflare.

## Referencia de comandos

| Tarea                        | Comando                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| Iniciar desarrollo local     | `npm run dev`                                                |
| Subir las imágenes de un post | `npm run media:add -- --post <slug> --file <rutas...>`       |
| Preparar un post             | `npm run post:ready -- --slug <slug>`                        |
| Ver el trabajo de traducción | `npm run translate -- --locale <locale> --dry-run`           |
| Validar Astro y contenido    | `npm run check`                                              |
| Ejecutar los tests           | `npm run test -- --test-timeout=30000`                       |
| Generar el sitio estático    | `npm run build`                                              |
| Ver el build estático        | `npm run preview`                                            |
| Publicar                     | Commit y push a `main` (Cloudflare despliega automáticamente) |

`npm run deploy` es un comando aparte de despliegue directo con Wrangler y no forma parte del camino normal de publicación por push a `main`.

import { isMediaPath, webpDeliveryKey } from './media.ts';

export interface UploadKeyManifest {
  keys: string[];
  collisions: string[];
}

/** Validate the public read URL used to build the site media URLs. */
export function isValidR2PublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.r2.dev') ||
        url.hostname === 'media.fundacionrosariogaton.org') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '' || url.pathname === '/')
    );
  } catch {
    return false;
  }
}

/** Require an exact non-multipart ETag match before reusing an existing object. */
export function isMatchingR2Etag(
  etag: string | null | undefined,
  expectedMd5: string,
): boolean {
  if (!etag || !/^[a-f0-9]{32}$/i.test(expectedMd5)) return false;
  const normalized = etag.trim().replace(/^"|"$/g, '').toLowerCase();
  return normalized === expectedMd5.toLowerCase();
}

/** Build original and variant keys, detecting collisions before any R2 writes. */
export function buildUploadKeyManifest(
  mediaPaths: readonly string[],
  withVariants: boolean,
): UploadKeyManifest {
  const owners = new Map<string, string>();
  const keys: string[] = [];
  const collisions = new Set<string>();

  const add = (key: string, owner: string): void => {
    const previousOwner = owners.get(key);
    if (previousOwner !== undefined) {
      if (previousOwner !== owner) collisions.add(key);
      return;
    }

    owners.set(key, owner);
    keys.push(key);
  };

  for (const mediaPath of new Set(mediaPaths)) {
    if (!isMediaPath(mediaPath)) {
      throw new Error(`Unsafe or unsupported R2 media key: ${mediaPath}`);
    }

    add(mediaPath, `original:${mediaPath}`);

    const webp = withVariants ? webpDeliveryKey(mediaPath) : undefined;
    if (webp && webp !== mediaPath) add(webp, `webp:${mediaPath}`);
  }

  return { keys, collisions: [...collisions].sort() };
}

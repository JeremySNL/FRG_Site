/**
 * YouTube URL / id parsing used by the `video` block.
 *
 * Accepts full YouTube URLs (`watch?v=`, `youtu.be`, `/shorts/`, `/embed/`,
 * `/live/`) or a raw video id. Returns the canonical id and, for Shorts,
 * a vertical aspect hint.
 */

export type YouTubeAspect = 'landscape' | 'vertical';

export interface YouTubeVideoInfo {
  /** The canonical YouTube video id. */
  id: string;
  /** Best-guess aspect ratio based on the source URL. */
  aspect: YouTubeAspect;
}

/**
 * Matches YouTube video ids inside common URL shapes.
 * Captures group 1 as the id.
 */
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

/** A raw video id, without any URL wrapping. */
const RAW_ID_RE = /^[A-Za-z0-9_-]{6,}$/;

/**
 * Extract the video id and aspect ratio from a YouTube URL or raw id.
 * Returns `null` when the input does not look like a YouTube reference.
 */
export function parseYouTubeUrl(input: string): YouTubeVideoInfo | null {
  const value = input.trim();
  if (!value) return null;

  // Raw id — safest fallback, assume landscape.
  if (RAW_ID_RE.test(value)) {
    return { id: value, aspect: 'landscape' };
  }

  const match = YOUTUBE_URL_RE.exec(value);
  if (!match?.[1]) return null;

  const id = match[1];
  const isShorts = /youtube\.com\/shorts\//i.test(value);
  return { id, aspect: isShorts ? 'vertical' : 'landscape' };
}

/** Shape needed to resolve a video block to a playable embed. */
export interface YouTubeBlockSource {
  youtubeId?: string | undefined;
  url?: string | undefined;
  aspect?: YouTubeAspect | undefined;
}

/**
 * Resolve a video block to a canonical id + aspect ratio.
 *
 * Precedence:
 * 1. `youtubeId` if present (canonical id, assumed landscape unless overridden).
 * 2. `url` if present and parseable (aspect derived from `/shorts/`).
 * 3. `aspect` overrides any derived value when provided explicitly.
 */
export function normalizeYouTubeVideo(
  source: YouTubeBlockSource,
): YouTubeVideoInfo | null {
  let info: YouTubeVideoInfo | null = null;

  if (source.youtubeId?.trim()) {
    info = { id: source.youtubeId.trim(), aspect: 'landscape' };
  } else if (source.url?.trim()) {
    info = parseYouTubeUrl(source.url.trim());
  }

  if (!info) return null;

  const aspect = source.aspect ?? info.aspect;
  return { id: info.id, aspect };
}

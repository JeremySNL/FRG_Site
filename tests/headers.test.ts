import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `public/_headers` is copied into the build and applied by Cloudflare to
 * every static page. These headers are the browser-side hardening of the
 * site; the adapter appends its own cache rule for `/_astro/*` at build time.
 */

/** The headers of one `_headers` path rule, by lowercase name. */
function headersFor(file: string, path: string): Map<string, string> {
  const headers = new Map<string, string>();
  let inRule = false;

  for (const line of file.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inRule = line.trim() === path;
      continue;
    }
    if (!inRule) continue;

    const separator = line.indexOf(':');
    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return headers;
}

describe('public/_headers', () => {
  const headers = headersFor(
    readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8'),
    '/*',
  );

  it('stops MIME sniffing and limits the referrer sent to other sites', () => {
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('refuses to be framed by other sites', () => {
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('keeps forms, plugins and the base URL on the site itself', () => {
    const policy = headers.get('content-security-policy') ?? '';
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it('turns off device features the site never uses', () => {
    expect(headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
  });
});

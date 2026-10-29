import { afterEach, expect, it, vi } from 'vitest';

import { Translator } from '../scripts/lib/translate.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends OpenCode Go session identification headers', async () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"translations":["こんにちは"]}' } }],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);

  const translator = new Translator({
    apiKey: 'test-key',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    model: 'glm-5.3-flash',
    batchSize: 10,
  });

  await expect(translator.translate('Japanese', ['Hola'])).resolves.toEqual([
    'こんにちは',
  ]);

  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  const headers = new Headers(init?.headers);
  expect(headers.get('user-agent')).toBe('frg-site-translator/1.0');
  expect(headers.get('x-opencode-session')).toMatch(/^[0-9a-f-]{36}$/);
});

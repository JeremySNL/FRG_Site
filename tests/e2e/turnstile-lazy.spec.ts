import { expect, test } from '@playwright/test';

/**
 * Every page carries the newsletter form in its footer, and that form is
 * protected by Turnstile. Loading Cloudflare's script on every page view cost
 * a third-party request on 365 of 366 pages, so it is fetched only when a
 * widget comes close to the screen or a protected form gets the focus.
 *
 * The real script is replaced by a stub that records the explicit renders,
 * so the test needs no network and no Cloudflare account.
 */
test('loads Turnstile only when a protected form comes into view', async ({ page }) => {
  const scriptRequests: string[] = [];

  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    const url = route.request().url();
    scriptRequests.push(url);
    const onload = new URL(url).searchParams.get('onload') ?? '';
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
        window.__turnstileRenders = [];
        window.turnstile = {
          render(container, options) {
            window.__turnstileRenders.push(options.sitekey);
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'cf-turnstile-response';
            input.value = 'stub-token';
            container.append(input);
            return 'widget';
          },
        };
        window[${JSON.stringify(onload)}]?.();
      `,
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  expect(scriptRequests).toEqual([]);

  await page.locator('#newsletter-form').scrollIntoViewIfNeeded();

  await expect.poll(() => scriptRequests.length).toBe(1);
  expect(scriptRequests[0]).toContain('render=explicit');

  const renders = await page.evaluate(
    () => (window as unknown as { __turnstileRenders: string[] }).__turnstileRenders,
  );
  expect(renders.length).toBeGreaterThan(0);
  expect(
    renders.every((sitekey) => typeof sitekey === 'string' && sitekey !== ''),
  ).toBe(true);
  await expect(
    page.locator('#newsletter-form input[name="cf-turnstile-response"]'),
  ).toHaveValue('stub-token');
});

test('renders the widget of a page form once the reader focuses it', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    requests += 1;
    const onload = new URL(route.request().url()).searchParams.get('onload') ?? '';
    await route.fulfill({
      contentType: 'text/javascript',
      body: `
        window.__renders = 0;
        window.turnstile = { render() { window.__renders += 1; return 'widget'; } };
        window[${JSON.stringify(onload)}]?.();
      `,
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/voluntariado/');
  await page.locator('form[action="/api/voluntariado/"] input[name="name"]').focus();

  await expect.poll(() => requests).toBe(1);
  const widgets = await page.locator('.cf-turnstile').count();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __renders: number }).__renders),
    )
    .toBe(widgets);
});

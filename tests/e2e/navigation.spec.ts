import { expect, test } from '@playwright/test';

test('desktop navigation dropdown stays open while crossing to its submenu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Only the site under test is reached; third-party requests are dropped.
  const siteOrigin = new URL(test.info().project.use.baseURL ?? '').origin;
  await page.route('**/*', (route) => {
    const requestUrl = new URL(route.request().url());
    return requestUrl.origin === siteOrigin ? route.continue() : route.abort();
  });
  await page.goto('/');

  const desktopNav = page.locator('header nav').first();
  const dropdownParent = desktopNav
    .locator('li.group:has(> ul), li.group:has(> div > ul)')
    .first();
  const trigger = dropdownParent.locator(':scope > a');
  const submenu = dropdownParent.locator(':scope > ul, :scope > div > ul').first();

  await trigger.hover();
  await expect(submenu).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  if (!triggerBox) throw new Error('Dropdown trigger has no layout box');

  await page.mouse.move(
    triggerBox.x + triggerBox.width / 2,
    triggerBox.y + triggerBox.height + 4,
  );
  await expect(submenu).toBeVisible();

  const firstSubmenuLink = submenu.getByRole('link').first();
  await firstSubmenuLink.hover();
  await expect(firstSubmenuLink).toBeVisible();
});

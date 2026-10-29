import { expect, test } from '@playwright/test';

/**
 * A vacancy chip on the home page sends the reader to the volunteering form
 * with the country in the query. The form has to honour that: preselect the
 * ambassador option and write the country into the message, or the whole
 * invitation is just a link to a nine-checkbox list.
 */

test('a vacancy chip opens the volunteering form with the vacancy preselected', async ({
  page,
}) => {
  await page.goto('/');

  const chip = page.getByRole('link', { name: /representas españa/i });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page).toHaveURL(
    /\/voluntariado\/\?pais=Espa.*continente=Europa#formulario$/,
  );

  const ambassador = page.locator('input[data-vacancy]');
  await expect(ambassador).toBeChecked();
  await expect(page.locator('textarea[name="message"]')).toHaveValue(
    'Me interesa representar a España (Europa).',
  );
});

test('the form stays untouched when it is opened without a vacancy', async ({
  page,
}) => {
  await page.goto('/voluntariado/');

  await expect(page.locator('input[data-vacancy]')).not.toBeChecked();
  // The Astro template leaves whitespace inside the textarea, so compare trimmed.
  await expect(page.locator('textarea[name="message"]')).toHaveValue(/^\s*$/);
});

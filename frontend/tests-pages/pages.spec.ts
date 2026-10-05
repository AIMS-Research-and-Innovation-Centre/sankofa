import { test, expect } from '@playwright/test';

test('Pages assets, hash links, refresh, history and disconnected archive status', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/sankofa/');
  await expect(page.getByRole('heading', { name: 'The scholarly archive of the AIMS network' })).toBeVisible();
  await expect(page.locator('.service-notice')).toContainText('not connected');
  await expect(page.getByRole('alert')).toContainText('not connected');
  await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('href', '/sankofa/#/about');
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page).toHaveURL(/\/sankofa\/#\/about$/);
  await expect(page.getByRole('heading', { name: 'Return to what matters.' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Return to what matters.' })).toBeVisible();
  await page.goBack(); await expect(page.getByRole('heading', { name: 'The scholarly archive of the AIMS network' })).toBeVisible();
  await page.keyboard.press('g'); await page.keyboard.press('g');
  await expect(page).toHaveURL(/\/sankofa\/#\/graph$/);
  await expect(page.getByRole('heading', { name: 'Knowledge graph', exact: true })).toBeVisible();
  await expect(page.locator('.graph-page')).toContainText('not connected');
  await page.goto('/sankofa/#/centres'); await expect(page.locator('.centre-card')).toHaveCount(6); await expect(page.locator('.centre-card').first()).toContainText('—');
  await page.goto('/sankofa/#/connect'); await expect(page.locator('.service-notice').last()).toContainText('placeholder');
  await page.goto('/sankofa/#/oracle'); await expect(page.getByRole('heading', { name: 'The Oracle' })).toBeVisible();
  await page.getByRole('link', { name: 'Dreams', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Dreams', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

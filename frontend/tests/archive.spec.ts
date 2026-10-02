import { test, expect, type Page } from '@playwright/test';

const records = [
  { id: 'aims-demo-2019-gh-001', title: 'Stochastic SIR Models for Malaria in Northern Ghana', campus: 'ghana', year: 2019, abstract: 'We develop a stochastic SIR model for malaria transmission in Northern Ghana, calibrating rainfall and temperature covariates.', concepts: ['stochastic', 'sir', 'malaria', 'bayesian', 'rainfall'] },
  { id: 'aims-demo-2022-rw-002', title: 'Topological Data Analysis of Climate Networks', author: 'keza', campus: 'rwanda', year: 2022, abstract: 'We apply persistent homology to East African rainfall networks, revealing manifold structure in climate teleconnections.', concepts: ['topology', 'manifold', 'rainfall'] },
];
async function setup(page: Page) {
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace('/api', '');
    let body: unknown;
    if (path === '/theses/') body = records.map(({ id, title, campus, year }) => ({ id, title, campus, year, author: null }));
    else if (path === '/theses/search') { expect(request.method()).toBe('POST'); expect(request.postDataJSON().query).toBe('malaria'); body = [{ thesis_id: records[0].id, score: 0.8 }]; }
    else if (path.endsWith('/neighbors')) body = [{ id: 'ada', label: 'ada', labels: ['Student'] }, { id: records[1].id, label: records[1].title, labels: ['Thesis'] }];
    else if (path.startsWith('/theses/')) { const t = records.find(t => path.endsWith(t.id)); if (!t) return route.fulfill({ status: 404, json: { detail: 'Thesis not found' } }); const { concepts, ...record } = t; body = { thesis: record, concepts }; }
    else if (path === '/chat/') { expect(request.postDataJSON()).toEqual({ thesis_id: records[0].id, question: 'What model does this use?' }); body = { answer: 'The abstract describes a stochastic SIR model.' }; }
    else if (path === '/oracle/propose') { expect(request.postDataJSON()).toEqual({ topic: 'malaria', top_k: 5 }); body = [{ title: 'On the intersection of malaria and topology', concepts: ['malaria', 'topology'], novelty: 0.3, feasible: 0.1, rationale: 'Untested pairing suggested by graph neighbours.' }]; }
    else if (path === '/dreams/recent') body = [];
    else if (path === '/dreams/dream-now') body = { id: 'dream-test', emitted_at: '2026-10-01T12:55:00Z', text: 'Last night I dreamt of\n  rainfall (thinking about)\nand I woke up believing they belong together.', path: [] };
    else return route.fulfill({ status: 404, json: {} });
    await route.fulfill({ json: body });
  });
  await page.routeWebSocket('**/ws/constellation', ws => {
    ws.send(JSON.stringify({ nodes: records, edges: [{ source: records[0].id, target: records[1].id, via: 'rainfall' }] }));
  });
}
test.beforeEach(async ({ page }) => { await setup(page); });

test('archive hydrates abstracts, concepts, and graph-linked authors; filters and sorts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('2 theses');
  await expect(page.locator('.thesis-row').first()).toContainText('Topological');
  await expect(page.locator('.thesis-row').last()).toContainText('ada');
  await expect(page.locator('.abstract-snippet').last()).toContainText('calibrating rainfall');
  await page.screenshot({ path: 'test-results/archive-light.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Campus', exact: true }).selectOption('ghana'); await expect(page.locator('.thesis-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear filters' }).click(); await expect(page.locator('.thesis-row')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('oldest'); await expect(page.locator('.thesis-row').first()).toContainText('Stochastic');
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2022'); await expect(page.locator('.thesis-row')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(r => /Graph-/.test(r.name)))).toBe(false);
});
test('keyboard search, result movement, open, and history navigation', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('2 theses');
  await page.keyboard.press('/'); await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('searchbox').fill('malaria'); await page.keyboard.press('Enter'); await expect(page.getByRole('status')).toContainText('1 thesis');
  await page.keyboard.press('Escape'); await expect(page.getByRole('status')).toContainText('2 theses');
  await page.keyboard.press('j'); await expect(page.locator('.thesis-row h2 a').first()).toBeFocused();
  await page.keyboard.press('j'); await expect(page.locator('.thesis-row h2 a').last()).toBeFocused();
  await page.keyboard.press('k'); await expect(page.locator('.thesis-row h2 a').first()).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('heading', { level: 1 })).toContainText('Topological');
  await page.keyboard.press('g'); await page.keyboard.press('h'); await expect(page).toHaveURL(/\/$/);
  await page.goBack(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Topological');
  await page.keyboard.press('g'); await page.keyboard.press('g'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Graph');
});
test('thesis questions, metadata honesty, citation files, and direct links', async ({ page }) => {
  await page.goto(`/thesis/${records[0].id}`); await expect(page.getByRole('heading', { level: 1 })).toHaveText(records[0].title);
  await expect(page.locator('.metadata')).toContainText('ada'); await expect(page.locator('.metadata')).toContainText('Not recorded');
  await page.screenshot({ path: 'test-results/thesis-light.png', fullPage: true });
  await page.getByLabel('Question for this thesis').fill('What model does this use?'); await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.answer')).toContainText('stochastic SIR');
  const bib = page.waitForEvent('download'); await page.getByRole('button', { name: 'BibTeX' }).click(); const download = await bib;
  expect(download.suggestedFilename()).toBe(`${records[0].id}.bib`);
  const fs = await import('node:fs/promises'); const citation = await fs.readFile((await download.path())!, 'utf8');
  expect(citation).toContain('@mastersthesis'); expect(citation).toContain('author = {ada}'); expect(citation).not.toContain('AGPL');
  const ris = page.waitForEvent('download'); await page.getByRole('button', { name: 'RIS', exact: true }).click(); expect((await ris).suggestedFilename()).toMatch(/\.ris$/);
  await page.getByRole('link', { name: 'rainfall', exact: true }).first().click(); await expect(page.locator('.thesis-row')).toHaveCount(2);
});
test('Oracle and Dreams use existing mutation contracts', async ({ page }) => {
  await page.goto('/oracle'); await page.getByRole('searchbox').fill('malaria'); await page.getByRole('button', { name: 'Explore' }).click();
  await expect(page.locator('.proposal')).toContainText('01'); await expect(page.locator('.proposal')).toContainText('Feasibility 0.10');
  await page.getByRole('link', { name: 'Dreams', exact: true }).click(); await page.getByRole('button', { name: 'Trigger a dream' }).click(); await expect(page.locator('.dream')).toContainText('rainfall'); await expect(page.locator('.dream time')).toContainText('UTC');
});
test('graph streams snapshots, filters, clears and offers keyboard links', async ({ page }) => {
  await page.goto('/graph'); await expect(page.getByRole('status')).toContainText('2 theses');
  await expect(page.locator('.graph-canvas canvas')).toBeVisible();
  await expect(page.locator('.error')).toHaveCount(0);
  await expect(page.locator('.graph-records li')).toHaveCount(2);
  await page.getByRole('searchbox').fill('malaria'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.locator('.graph-records li')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.graph-records li')).toHaveCount(2);
  await page.locator('.graph-records a').first().click(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Stochastic');
});
test('errors retry, empty filters, unknown routes, and missing theses', async ({ page }) => {
  await page.route('**/api/theses/?limit=500', route => route.fulfill({ status: 503, json: {} })); await page.goto('/'); await expect(page.getByRole('alert')).toContainText('503');
  await page.unroute('**/api/theses/?limit=500'); await page.getByRole('button', { name: 'Retry' }).click(); await expect(page.getByRole('status')).toContainText('2 theses');
  await page.goto('/?campus=senegal'); await expect(page.getByRole('heading', { name: 'No theses found' })).toBeVisible();
  await page.goto('/thesis/missing'); await expect(page.getByRole('alert')).toContainText('not found');
  await page.goto('/unknown'); await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
test('light default, persistent dark theme, mobile layout, and About', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click(); await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 375, height: 812 }); await expect(page.getByRole('status')).toContainText('2 theses');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(`/thesis/${records[0].id}`); await expect(page.locator('.metadata')).toContainText('Metadata'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'About', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ethics and stewardship' })).toBeVisible();
});

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
    else if (path === '/notebook/ask') { const ids = request.postDataJSON().thesis_ids as string[]; body = { answer: 'Rainfall drives transmission in the malaria model [1].', mode: 'model', sources: ids.map((id, i) => ({ n: i + 1, id, title: records.find(r => r.id === id)!.title })) }; }
    else if (path === '/dreams/recent') body = [];
    else if (path === '/dreams/dream-now') body = { id: 'dream-test', emitted_at: '2026-10-01T12:55:00Z', text: 'Last night I dreamt of\n  rainfall (thinking about)\nand I woke up believing they belong together.', path: [] };
    else return route.fulfill({ status: 404, json: {} });
    await route.fulfill({ json: body });
  });
}
test.beforeEach(async ({ page }) => { await setup(page); });

test('archive hydrates abstracts, concepts, and graph-linked authors; filters and sorts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('2 theses');
  await expect(page.locator('.thesis-row').first()).toContainText('Topological');
  await expect(page.locator('.thesis-row').last()).toContainText('ada');
  await expect(page.locator('.abstract-snippet').last()).toContainText('calibrating rainfall');
  await page.getByRole('combobox', { name: 'Centre', exact: true }).selectOption('ghana'); await expect(page.locator('.thesis-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Clear filters' }).click(); await expect(page.locator('.thesis-row')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('oldest'); await expect(page.locator('.thesis-row').first()).toContainText('Stochastic');
  await page.getByRole('combobox', { name: 'Year', exact: true }).selectOption('2022'); await expect(page.locator('.thesis-row')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(r => /KnowledgeGraph-/.test(r.name)))).toBe(false);
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
  await page.keyboard.press('g'); await page.keyboard.press('g'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Knowledge graph');
  await page.keyboard.press('Escape'); await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('g'); await page.keyboard.press('n'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask your sources');
});
test('thesis questions, metadata honesty, citation files, and direct links', async ({ page }) => {
  await page.goto(`/thesis/${records[0].id}`); await expect(page.getByRole('heading', { level: 1 })).toHaveText(records[0].title);
  await expect(page.locator('.metadata')).toContainText('ada'); await expect(page.locator('.metadata')).toContainText('Not recorded');
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
test('knowledge graph shows typed nodes, searches, inspects and links out', async ({ page }) => {
  await page.goto('/graph'); await expect(page.getByRole('status')).toContainText('nodes');
  await expect(page.locator('.graph-svg .node')).toHaveCount(2 + 7 + 2 + 2); // theses, concepts, Centres, authors (ada comes from the graph lookup)
  await expect(page.locator('.graph-svg .n-centre')).toHaveCount(2);
  await page.getByLabel('Find a node').fill('rainfall'); await page.getByLabel('Find a node').press('Enter');
  await expect(page.locator('.inspector h2')).toHaveText('rainfall'); await expect(page.locator('.inspector-group')).toContainText('Topological Data Analysis');
  await page.getByRole('checkbox', { name: /Authors/ }).uncheck(); await expect(page.locator('.graph-svg .n-author')).toHaveCount(0);
  await page.getByLabel('Find a node').fill('manifold'); await page.getByLabel('Find a node').press('Enter');
  // Two hops from manifold: its thesis, that thesis's other concepts and its Centre.
  await page.getByRole('checkbox', { name: /neighbourhood/ }).check(); await expect(page.locator('.graph-svg .node')).toHaveCount(5);
  await page.getByRole('checkbox', { name: /neighbourhood/ }).uncheck(); await page.getByLabel('Find a node').fill('rainfall'); await page.getByLabel('Find a node').press('Enter');
  await page.locator('.inspector').getByRole('button', { name: /Stochastic SIR/ }).click(); await expect(page.locator('.inspector h2')).toContainText('Stochastic SIR');
  await page.getByRole('link', { name: 'Open thesis' }).click(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Stochastic');
  await page.getByRole('link', { name: 'Explore in the graph' }).first().click(); await expect(page.locator('.inspector h2')).toContainText('Stochastic SIR');
});
test('Centres: all six are listed, counted, and have scoped pages', async ({ page }) => {
  await page.goto('/centres'); await expect(page.locator('.centre-card')).toHaveCount(6);
  await expect(page.locator('.centre-card', { hasText: 'AIMS Ghana' })).toContainText('1 thesis');
  await expect(page.locator('.centre-card', { hasText: 'AIMS Cameroon' })).toContainText('0 theses');
  await expect(page.locator('.centre-card', { hasText: 'Research and Innovation' })).toContainText('Kigali');
  await page.locator('.centre-card', { hasText: 'AIMS Rwanda' }).click(); await expect(page.getByRole('heading', { level: 1 })).toHaveText('AIMS Rwanda');
  await expect(page.locator('.thesis-row')).toHaveCount(1); await expect(page.locator('.thesis-row')).toContainText('Topological');
  await page.goto('/'); await page.getByRole('button', { name: /^Cameroon/ }).click(); await expect(page.getByRole('heading', { name: 'No theses found' })).toBeVisible();
});
test('Browse by subject, author and Centre scope', async ({ page }) => {
  await page.goto('/browse?by=subject'); await expect(page.locator('#browse-R')).toContainText('rainfall');
  await page.getByRole('tab', { name: 'Authors' }).click(); await expect(page.locator('.browse-groups')).toContainText('keza');
  await page.getByRole('combobox', { name: 'Centre' }).selectOption('ghana'); await expect(page.locator('.browse-groups')).not.toContainText('keza');
});
test('notebook: add sources, ask with citations, fall back offline, keep notes', async ({ page }) => {
  await page.goto('/'); await page.locator('.thesis-row', { hasText: 'Stochastic' }).getByRole('button', { name: /Add to notebook/ }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: /Notebook/ })).toContainText('1');
  await nav.getByRole('link', { name: /Notebook/ }).click();
  await page.getByLabel('Add from the archive').fill('topology'); await page.getByRole('button', { name: /Add Topological/ }).click();
  await expect(page.locator('.source-list li')).toHaveCount(2); await expect(page.locator('.overview')).toContainText('rainfall');
  await page.getByLabel('Question for your sources').fill('What drives transmission?'); await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('.answer-card .cite')).toHaveText('1'); await expect(page.locator('.answer-card .cite')).toHaveAttribute('href', /aims-demo-2019-gh-001/);
  await page.getByRole('button', { name: 'Save to notes' }).click(); await expect(page.locator('.note')).toHaveCount(1);
  await page.getByRole('button', { name: /Bibliography/ }).click(); await expect(page.locator('.note').first()).toContainText('Master');
  await page.route('**/api/notebook/ask', route => route.fulfill({ status: 404, json: {} }));
  await page.getByLabel('Question for your sources').fill('persistent homology'); await page.keyboard.press('Enter');
  await expect(page.locator('.answer-card').last()).toContainText('persistent homology'); await expect(page.locator('.answer-card').last()).toContainText('Quoted from the selected abstracts');
  await page.reload(); await expect(page.locator('.source-list li')).toHaveCount(2); await expect(page.locator('.note')).toHaveCount(2); await expect(page.locator('.answer-card')).toHaveCount(2);
  const md = page.waitForEvent('download'); await page.getByRole('button', { name: /Export/ }).click(); expect((await md).suggestedFilename()).toBe('sankofa-notebook.md');
});
test('agents page gives Hermes an MCP endpoint, and the interface speaks French', async ({ page }) => {
  await page.goto('/connect'); await expect(page.locator('.snippet').first()).toContainText('mcp_servers:');
  await expect(page.locator('.snippet').first()).toContainText('/api/mcp/'); await expect(page.locator('.tool-list')).toContainText('search_theses');
  await page.getByRole('button', { name: 'Afficher en français' }).click(); await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connecter un agent'); await expect(page.getByRole('navigation', { name: 'Main navigation' })).toContainText('Carnet');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
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
  for (const path of ['/centres', '/graph', '/notebook', '/connect']) { await page.goto(path); await page.waitForTimeout(200); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true); }
});

import { test, expect, type Page } from '@playwright/test';

const base = { id: 'aims-2019-gh-001', title: 'Stochastic SIR Models for Malaria', title_fr: null, authors: [{ family: 'Owusu', given: 'Ama', orcid: null }], supervisors: [], abstract: 'We model malaria.', abstract_fr: null, keywords: ['malaria'], msc: [], year: 2019, date_issued: null, centre: 'ghana', programme: null, degree: 'Master of Science', language: 'en', licence: null, access: 'open', embargo_end: null, funders: [], related: [], doi: null, doi_state: null };
type Meta = typeof base & Record<string, unknown>;

/** A stateful stand-in for the curation API. */
async function mockApi(page: Page, start: Partial<Meta> = {}) {
  const state = { meta: { ...base, ...start } as Meta, puts: [] as { auth: string | null; body: Meta }[] };
  const completeness = (m: Meta) => { const missing = [['Licence', m.licence], ['Abstract', m.abstract], ['Author(s)', (m.authors as unknown[]).length]].filter(([, v]) => !v).map(([l]) => l); return { score: 60, required_score: missing.length ? 75 : 100, missing_required: missing, missing_recommended: ['Supervisor(s)'], doi_ready: !missing.length }; };
  const record = () => ({ metadata: state.meta, completeness: completeness(state.meta), datacite: { types: { resourceTypeGeneral: 'Dissertation' }, titles: [{ title: state.meta.title }] }, doi_service: { configured: true, test: true, prefix: '10.80000', curation_enabled: true, landing_pages: true } });
  await page.route('**/api/**', async route => {
    const r = route.request(); const path = new URL(r.url()).pathname.replace('/api', '');
    if (path.endsWith('/metadata') && r.method() === 'GET') return route.fulfill({ json: record() });
    if (path.endsWith('/metadata') && r.method() === 'PUT') {
      const auth = r.headers()['authorization'] || null; state.puts.push({ auth, body: r.postDataJSON() });
      if (auth !== 'Bearer secret') return route.fulfill({ status: 401, json: { detail: 'A valid curator token is required.' } });
      state.meta = { ...r.postDataJSON(), doi: state.meta.doi, doi_state: state.meta.doi_state }; return route.fulfill({ json: record() });
    }
    if (path.endsWith('/doi')) {
      const action = r.postDataJSON().action;
      if (action === 'reserve') state.meta = { ...state.meta, doi: '10.80000/aims.aims-2019-gh-001', doi_state: 'draft' };
      if (action === 'register') state.meta = { ...state.meta, doi_state: 'findable' };
      return route.fulfill({ json: { doi: state.meta.doi, doi_state: state.meta.doi_state } });
    }
    if (path === '/curation/report') return route.fulfill({ json: { theses: 2, required_completeness: 88, doi_ready: 1, registered: 0, doi_service: record().doi_service, rows: [
      { id: base.id, title: base.title, ...completeness(state.meta), doi: null, doi_state: null },
      { id: 'aims-2022-rw-002', title: 'Topological Data Analysis', score: 100, required_score: 100, missing_required: [], missing_recommended: [], doi_ready: true, doi: null, doi_state: null }] } });
    if (path.endsWith('/neighbors')) return route.fulfill({ json: [] });
    if (path.startsWith('/theses/')) { const { keywords, ...thesis } = state.meta; return route.fulfill({ json: { thesis: { ...thesis, campus: thesis.centre, author: 'Ama Owusu' }, concepts: keywords } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  return state;
}

test('a registered DOI is shown and cited; ORCID, supervisors and licence appear', async ({ page }) => {
  await mockApi(page, { doi: '10.80000/aims.aims-2019-gh-001', doi_state: 'findable', licence: 'CC-BY-4.0', authors: [{ family: 'Owusu', given: 'Ama', orcid: '0000-0002-1825-0097' }], supervisors: [{ family: 'Mensah', given: 'Kofi', orcid: null }], title_fr: 'Modèles SIR stochastiques' });
  await page.goto('/thesis/aims-2019-gh-001');
  await expect(page.locator('.doi-line a')).toHaveAttribute('href', 'https://doi.org/10.80000/aims.aims-2019-gh-001');
  await expect(page.locator('.subtitle')).toHaveText('Modèles SIR stochastiques');
  await expect(page.locator('.metadata')).toContainText('Kofi Mensah'); await expect(page.locator('.metadata')).toContainText('CC BY 4.0');
  await expect(page.getByRole('link', { name: 'ORCID record for Ama Owusu' }).first()).toHaveAttribute('href', 'https://orcid.org/0000-0002-1825-0097');
  await expect(page.locator('.apa')).toHaveText("Owusu, A. (2019). Stochastic SIR Models for Malaria [Master's thesis, AIMS Ghana]. Sankofa. https://doi.org/10.80000/aims.aims-2019-gh-001");
  const bib = page.waitForEvent('download'); await page.getByRole('button', { name: 'BibTeX' }).click();
  const fs = await import('node:fs/promises'); expect(await fs.readFile((await (await bib).path())!, 'utf8')).toContain('doi = {10.80000/aims.aims-2019-gh-001}');
});

test('a draft DOI is never cited', async ({ page }) => {
  await mockApi(page, { doi: '10.80000/aims.aims-2019-gh-001', doi_state: 'draft' });
  await page.goto('/thesis/aims-2019-gh-001');
  await expect(page.locator('.doi-line')).toContainText('registration pending');
  await expect(page.locator('.apa')).not.toContainText('doi.org'); await expect(page.locator('.apa')).toContainText('/thesis/aims-2019-gh-001');
});

test('curators complete the record, then reserve and register a DOI', async ({ page }) => {
  const state = await mockApi(page);
  await page.goto('/thesis/aims-2019-gh-001'); await page.getByRole('link', { name: 'Curate metadata and DOI' }).click();
  await expect(page.locator('.missing').first()).toContainText('Licence');
  await expect(page.getByRole('button', { name: 'Reserve a DOI' })).toBeDisabled();
  await page.getByLabel('Licence').selectOption('CC-BY-4.0');
  await expect(page.locator('.missing').first()).not.toContainText('Licence'); // live check before saving
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // no token yet
  await page.getByLabel('Curator token').fill('wrong'); await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('valid curator token');
  await page.getByLabel('Curator token').fill('secret');
  await page.getByRole('button', { name: '+ Add supervisor' }).click(); await page.getByLabel('Family name').nth(1).fill('Mensah'); await page.getByLabel('Given names').nth(1).fill('Kofi');
  await page.getByRole('button', { name: 'Save changes' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(state.puts.at(-1)!.body.supervisors).toEqual([{ family: 'Mensah', given: 'Kofi', orcid: null }]);
  expect(state.puts.at(-1)!.body.licence).toBe('CC-BY-4.0');
  await page.getByRole('button', { name: 'Reserve a DOI' }).click(); await expect(page.locator('.doi-card')).toContainText('Draft');
  await expect(page.getByRole('button', { name: 'Register DOI' })).toBeDisabled();
  await page.getByLabel(/Registration is permanent/).check(); await page.getByRole('button', { name: 'Register DOI' }).click();
  await expect(page.locator('.doi-card')).toContainText('Registered'); await expect(page.locator('.doi-card a')).toHaveAttribute('href', 'https://doi.org/10.80000/aims.aims-2019-gh-001');
  await page.reload(); await expect(page.getByLabel('Curator token')).toHaveValue('secret'); // kept for this browser session
});

test('the curation dashboard tracks the 95% target and filters records', async ({ page }) => {
  await mockApi(page); await page.goto('/curation');
  await expect(page.locator('.stat-warn')).toContainText('88%'); await expect(page.locator('.stat-warn')).toContainText('Below the 95% target');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1); await expect(page.locator('.data-table')).toContainText('Licence');
  await page.getByRole('tab', { name: 'Ready for a DOI' }).click(); await expect(page.locator('.data-table tbody tr')).toContainText('Topological');
  await page.getByRole('link', { name: 'Topological Data Analysis' }).click(); await expect(page).toHaveURL(/\/thesis\/aims-2022-rw-002\/curate$/);
});

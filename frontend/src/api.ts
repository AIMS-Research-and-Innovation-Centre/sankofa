export interface Thesis {
  id: string; title: string; author?: string; campus?: string; year?: number;
  abstract?: string; concepts: string[]; consented?: boolean; consent?: boolean;
  license?: string; citations?: string[] | number; reads?: number; pdf_url?: string;
  programme?: string; supervisor?: string; language?: string; doi?: string;
  // Curated metadata (see /theses/:id/metadata).
  authors?: Person[]; supervisors?: Person[]; title_fr?: string; abstract_fr?: string; msc?: string[];
  date_issued?: string; licence?: string; access?: Access; embargo_end?: string; doi_state?: 'draft' | 'findable' | null; degree?: string;
}
export type Access = 'open' | 'embargoed' | 'restricted' | 'metadata-only';
export interface Person { family: string; given?: string; orcid?: string | null }
export interface Funder { name: string; identifier?: string | null; award?: string | null }
export interface Related { identifier: string; kind: 'DOI' | 'URL' | 'Handle' | 'arXiv'; relation: string }
export interface Metadata {
  id: string; title: string; title_fr: string | null; authors: Person[]; supervisors: Person[]; abstract: string | null; abstract_fr: string | null;
  keywords: string[]; msc: string[]; year: number | null; date_issued: string | null; centre: string | null; programme: string | null; degree: string | null;
  language: string | null; licence: string | null; access: Access; embargo_end: string | null; funders: Funder[]; related: Related[]; doi: string | null; doi_state: 'draft' | 'findable' | null;
}
export interface Completeness { score: number; required_score: number; missing_required: string[]; missing_recommended: string[]; doi_ready: boolean }
export interface DoiService { configured: boolean; test: boolean; prefix: string | null; curation_enabled: boolean; landing_pages: boolean }
export interface MetadataRecord { metadata: Metadata; completeness: Completeness; datacite: Record<string, unknown>; doi_service: DoiService; warning?: string }
export interface Neighbor { id?: string; label: string; labels: string[] }
export interface Proposal { title: string; concepts: string[]; novelty: number; feasible: number; rationale: string }
export interface Dream { id: string; emitted_at: string; text: string; path: { from: string; rel: string; to: string }[] }
export interface NotebookAnswer { answer: string; mode: 'model' | 'extractive' | 'none' | 'local'; sources: { n: number; id: string; title: string }[] }
export interface AuthUser { user: Record<string, unknown>; role: 'researcher' | 'librarian' | 'editor' | 'admin'; }

const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
export const archiveConnected = import.meta.env.VITE_PAGES !== 'true' || !!import.meta.env.VITE_API_BASE;
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal, options: { method?: string; token?: string } = {}): Promise<T> {
  if (!archiveConnected) throw new Error('The archive service is not connected to this website yet.');
  const response = await fetch(`${base}${path}`, {
    method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75000)]) : AbortSignal.timeout(75000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('This record was not found in the archive.');
    // Curator endpoints explain refusals; show their reason rather than a generic message.
    let detail: unknown; try { detail = (await response.json()).detail; } catch { /* No JSON body. */ }
    if (typeof detail === 'string') throw new Error(detail);
    if (Array.isArray(detail) && detail.length) throw new Error(detail.map((d: { loc?: (string | number)[]; msg?: string }) => `${(d.loc || []).filter(l => l !== 'body').join('.')}: ${(d.msg || '').replace(/^Value error, /, '')}`).join('\n'));
    throw new Error(`The archive could not complete the request (${response.status}). Check that the API and its services are running, then retry.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/auth/login', { email, password });
}

export async function signup(email: string, password: string, name: string): Promise<{ status: string }> {
  return request<{ status: string }>('/auth/signup', { email, password, name });
}

export async function currentUser(): Promise<AuthUser | null> {
  try { return await request<AuthUser>('/auth/me'); } catch { return null; }
}

export async function logout(): Promise<void> {
  await request<void>('/auth/logout', undefined, undefined, { method: 'POST' });
}

export async function workflowItems(): Promise<Record<string, unknown>[]> {
  return request<Record<string, unknown>[]>('/repository/workflow');
}

export async function workflowAction(id: string, action: string, reason = ''): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/repository/workflow/${encodeURIComponent(id)}/${action}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, undefined, undefined, { method: 'POST' });
}

const cache = new Map<string, Promise<Thesis>>();
export function thesis(id: string): Promise<Thesis> {
  let pending = cache.get(id);
  if (!pending) {
    pending = request<{ thesis: Omit<Thesis, 'concepts'>; concepts: string[] }>(`/theses/${encodeURIComponent(id)}`)
      .then(async result => {
        let author = result.thesis.author;
        if (!author) {
          try { const rows = await request<Neighbor[]>(`/theses/${encodeURIComponent(id)}/neighbors`); author = rows.find(n => n.labels.includes('Student'))?.label; } catch { /* The record remains readable without related metadata. */ }
        }
        return { ...result.thesis, id, author, concepts: result.concepts || [] };
      });
    cache.set(id, pending);
    pending.catch(() => cache.delete(id));
  }
  return pending;
}

export async function archive(query: string): Promise<Thesis[]> {
  const rows = query
    ? await request<{ thesis_id: string; score: number }[]>('/theses/search', { query, limit: 500 })
    : await request<(Omit<Thesis, 'concepts'> & { concepts?: string[] })[]>('/theses/?limit=500');
  // Search returns only IDs, and older list APIs return summaries without concepts. Hydrate those in bounded batches.
  const result: Thesis[] = [];
  for (let offset = 0; offset < rows.length; offset += 8) {
    const batch = rows.slice(offset, offset + 8);
    result.push(...await Promise.all(batch.map(async row => {
      if ('concepts' in row && Array.isArray(row.concepts)) return { ...row, concepts: row.concepts };
      const id = 'thesis_id' in row ? row.thesis_id : row.id;
      const record = await thesis(id);
      return 'title' in row ? { ...record, ...row, author: row.author || record.author, concepts: record.concepts } : record;
    })));
  }
  return result;
}

// The whole archive (up to 500 records), shared by every view that needs it.
let everything: Promise<Thesis[]> | undefined;
export function allTheses(): Promise<Thesis[]> {
  if (!everything) { everything = archive(''); everything.catch(() => { everything = undefined; }); }
  return everything;
}

export async function askNotebook(sources: Thesis[], question: string): Promise<NotebookAnswer> {
  try { return await request<NotebookAnswer>('/notebook/ask', { thesis_ids: sources.map(s => s.id), question }); }
  catch (error) {
    // Older APIs have no notebook route; answer from the abstracts already loaded.
    if (error instanceof Error && error.message.includes('not found')) return { answer: extract(question, sources), mode: 'local', sources: sources.map((s, i) => ({ n: i + 1, id: s.id, title: s.title })) };
    throw error;
  }
}

const STOP = new Set('a an and are as at be by do does for from has have how in is it its of on or that the their this to was were what which who why with use uses used about any'.split(' '));
const terms = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9\u00c0-\u024f]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)));
/** Extractive answer: the abstract sentences that best match the question, cited as [n]. Mirrors the API's fallback. */
export function extract(question: string, sources: Thesis[], limit = 4): string {
  const wanted = terms(question);
  const scored = sources.flatMap((s, n) => (s.abstract || '').split(/(?<=[.!?])\s+/).filter(Boolean).map((sentence, i) => ({ overlap: [...terms(sentence)].filter(w => wanted.has(w)).length, i, n: n + 1, sentence: sentence.trim() })));
  scored.sort((a, b) => b.overlap - a.overlap || a.i - b.i || a.n - b.n);
  const picked = scored.filter(s => s.overlap > 0).slice(0, limit);
  const chosen = picked.length ? picked : scored.slice(0, Math.min(limit, sources.length));
  return chosen.length ? chosen.map(s => `${s.sentence} [${s.n}]`).join(' ') : 'The selected sources have no recorded abstracts to answer from.';
}

/** Where agents reach the archive's MCP endpoint. */
export function mcpUrl(): string {
  const api = new URL(import.meta.env.VITE_API_BASE || '/api', location.href);
  return `${api.href.replace(/\/$/, '')}/mcp/`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed. Please retry.';
}

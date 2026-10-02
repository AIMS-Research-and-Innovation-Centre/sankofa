export interface Thesis {
  id: string; title: string; author?: string; campus?: string; year?: number;
  abstract?: string; concepts: string[]; consented?: boolean; consent?: boolean;
  license?: string; citations?: string[] | number; reads?: number; pdf_url?: string;
}
export interface Neighbor { id?: string; label: string; labels: string[] }
export interface Proposal { title: string; concepts: string[]; novelty: number; feasible: number; rationale: string }
export interface Dream { id: string; emitted_at: string; text: string; path: { from: string; rel: string; to: string }[] }
export interface GraphNode { id: string; title: string; year?: number; campus?: string; concepts: string[] }
export interface GraphData { nodes: GraphNode[]; edges: { source: string; target: string; via: string }[] }

const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
export const archiveConnected = import.meta.env.VITE_PAGES !== 'true' || !!import.meta.env.VITE_API_BASE;
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!archiveConnected) throw new Error('The archive service is not connected to this website yet.');
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75000)]) : AbortSignal.timeout(75000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('This record was not found in the archive.');
    throw new Error(`The archive could not complete the request (${response.status}). Check that the API and its services are running, then retry.`);
  }
  return response.json() as Promise<T>;
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
    : await request<Omit<Thesis, 'concepts'>[]>('/theses/?limit=500');
  // The list/search API only returns summaries or IDs. Hydrate in bounded batches.
  const result: Thesis[] = [];
  for (let offset = 0; offset < rows.length; offset += 8) {
    const batch = rows.slice(offset, offset + 8);
    result.push(...await Promise.all(batch.map(async row => {
      const id = 'thesis_id' in row ? row.thesis_id : row.id;
      const record = await thesis(id);
      return 'title' in row ? { ...record, ...row, author: row.author || record.author, concepts: record.concepts } : record;
    })));
  }
  return result;
}

export function graphUrl(): string {
  if (import.meta.env.VITE_GRAPH_WS) return import.meta.env.VITE_GRAPH_WS;
  const url = import.meta.env.VITE_API_BASE ? new URL(import.meta.env.VITE_API_BASE, location.href) : new URL(location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/constellation'; url.search = ''; url.hash = '';
  return url.href;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed. Please retry.';
}

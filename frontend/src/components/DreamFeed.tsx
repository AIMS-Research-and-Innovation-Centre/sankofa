import { useEffect, useState } from 'react';
import { errorMessage, request, type Dream } from '../api';

export default function DreamFeed() {
  const [dreams, setDreams] = useState<Dream[]>([]); const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); request<Dream[]>('/dreams/recent?limit=50', undefined, controller.signal).then(setDreams).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retry]);
  async function trigger() { if (busy) return; setBusy(true); setError(''); try { const dream = await request<Dream>('/dreams/dream-now', {}); setDreams(previous => [dream, ...previous.filter(d => d.id !== dream.id)]); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <div className="reading-page"><p className="eyebrow">Archive passages</p><h1>Dreams</h1><p className="page-description">The archive walks its own graph and records what it sees. These are not predictions. They are passages.</p><button onClick={trigger} disabled={busy || loading}>{busy ? 'Walking the graph…' : 'Trigger a dream'}</button>
    {error && <div className="error" role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Reload feed</button></div>}
    {loading ? <p role="status">Loading passages…</p> : !dreams.length && !error ? <p className="empty">No passages recorded yet. Trigger a dream to begin.</p> : null}
    <div aria-live="polite">{dreams.map(d => <article className="dream" key={d.id}><time className="mono meta" dateTime={d.emitted_at}>{new Date(d.emitted_at).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time><p>{d.text.replace(/—/g, '').trim()}</p></article>)}</div>
  </div>;
}

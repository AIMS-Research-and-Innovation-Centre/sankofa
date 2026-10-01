import { useRef, useEffect, useState } from 'react';
import { errorMessage, request, type Proposal } from '../api';
import { Link } from '../router';
import SearchForm from './SearchForm';

export default function Oracle() {
  const [topic, setTopic] = useState(''); const [results, setResults] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [searched, setSearched] = useState(false);
  const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function propose() {
    if (!topic.trim() || busy) return; setBusy(true); setError(''); setResults([]); setSearched(false);
    try { const rows = await request<Proposal[]>('/oracle/propose', { topic: topic.trim(), top_k: 5 }); if (active.current) { setResults(rows); setSearched(true); } }
    catch (e) { if (active.current) setError(errorMessage(e)); }
    finally { if (active.current) setBusy(false); }
  }
  return <div className="reading-page"><p className="eyebrow">Research directions</p><h1>The Oracle</h1><p className="page-description">Reads the shape of the archive and proposes what’s missing.</p><SearchForm label="Explore a topic, for example malaria" value={topic} onChange={setTopic} onSubmit={propose} button="Explore" busy={busy} /><p className="meta">Scores describe patterns in this archive. They do not establish scientific novelty or feasibility.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <p role="status">{busy ? 'Reading the archive…' : searched ? `${results.length} ${results.length === 1 ? 'direction' : 'directions'} found` : ''}</p>
    {searched && !results.length && <p>No directions found. Try another concept or a broader topic.</p>}
    {results.map((p, i) => <article className="proposal" key={`${p.title}-${i}`}><span className="proposal-number">{String(i + 1).padStart(2, '0')}</span><div><h2>{p.title}</h2><p className="meta mono">Novelty {p.novelty.toFixed(2)} · Feasibility {p.feasible.toFixed(2)}</p><p>{p.rationale}</p><div className="concepts">{p.concepts.map(c => <Link key={c} href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link>)}</div></div></article>)}
  </div>;
}

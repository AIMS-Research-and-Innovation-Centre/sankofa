import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, request, thesis, type Neighbor, type Thesis } from '../api';
import { downloadCitation } from '../citations';
import { Link } from '../router';

interface Message { question: string; answer?: string; error?: string }
export default function ThesisView({ id }: { id: string }) {
  const [record, setRecord] = useState<Thesis>();
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [neighborError, setNeighborError] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; setError(''); setNeighborError(''); setRecord(undefined); setNeighbors([]); setMessages([]); setBusy(false); setQuestion('');
    thesis(id).then(t => { if (mounted.current) setRecord(t); }).catch(e => { if (mounted.current) setError(errorMessage(e)); });
    request<Neighbor[]>(`/theses/${encodeURIComponent(id)}/neighbors`).then(rows => { if (mounted.current) setNeighbors(rows); }).catch(() => { if (mounted.current) setNeighborError('Related records are unavailable.'); });
    return () => { mounted.current = false; };
  }, [id, retry]);
  async function ask(event: FormEvent) {
    event.preventDefault(); const q = question.trim(); if (!q || busy) return;
    setMessages(previous => [...previous, { question: q }]); setQuestion(''); setBusy(true);
    try {
      const result = await request<{ answer: string }>('/chat/', { thesis_id: id, question: q });
      if (mounted.current) setMessages(previous => previous.map((m, i) => i === previous.length - 1 ? { ...m, answer: result.answer } : m));
    } catch (e) {
      if (mounted.current) setMessages(previous => previous.map((m, i) => i === previous.length - 1 ? { ...m, error: errorMessage(e) } : m));
    } finally { if (mounted.current) setBusy(false); }
  }
  if (error) return <div className="error" role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Retry</button><p><Link href="/">Back to archive</Link></p></div>;
  if (!record) return <p role="status">Loading thesis…</p>;
  const author = record.author || neighbors.find(n => n.labels.includes('Student'))?.label;
  const consent = record.consented ?? record.consent;
  const related = neighbors.filter(n => n.labels.includes('Thesis') && n.id && n.id !== id);
  const pdf = record.pdf_url && /^https?:\/\//i.test(record.pdf_url) ? record.pdf_url : undefined;
  return <div className="detail-layout">
    <article className="thesis-detail">
      <Link href="/" className="back-link">← Archive</Link>
      <p className="record-id">{record.id}</p>
      <h1>{record.title}</h1>
      <p className="meta">{author || 'Author not recorded'} · <span className="capitalize">{record.campus || 'Campus not recorded'}</span> · {record.year || 'Year not recorded'}</p>
      <section><h2>Abstract</h2><p className="abstract-full">{record.abstract || 'No abstract recorded.'}</p></section>
      <section><h2>Concepts</h2><p className="concept-line">{record.concepts.length ? record.concepts.map((c, i) => <span key={c}>{i > 0 ? ' · ' : ''}<Link href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link></span>) : 'No concepts recorded.'}</p></section>
      <section className="chat-section"><h2>Ask this thesis</h2><p className="meta">Responses use the recorded abstract. Check claims against the original thesis.</p>
        <form className="search-form" onSubmit={ask}><label className="sr-only" htmlFor="question">Question for this thesis</label><input id="question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What model does this thesis use?" required /><button disabled={busy || !question.trim()}>{busy ? 'Asking…' : 'Ask'}</button></form>
        <div className="chat-thread" aria-live="polite" aria-busy={busy}>{messages.map((m, i) => <div className="exchange" key={i}><span className="label">You</span><p>{m.question}</p><span className="label">Thesis</span><p className={m.error ? 'error' : 'answer'}>{m.answer || m.error || 'Reading the abstract…'}</p></div>)}</div>
      </section>
      <section><h2>Related theses</h2>{neighborError ? <p className="meta">{neighborError}</p> : related.length ? <ul className="related-list">{related.map(n => <li key={n.id}><Link href={`/thesis/${encodeURIComponent(n.id!)}`}>{n.label}</Link></li>)}</ul> : <p className="meta">No related theses recorded.</p>}</section>
    </article>
    <aside className="metadata" aria-label="Thesis metadata"><h2>Metadata</h2><dl>
      <dt>ID</dt><dd className="mono">{id}</dd><dt>Author</dt><dd>{author || 'Not recorded'}</dd><dt>Campus</dt><dd className="capitalize">{record.campus || 'Not recorded'}</dd><dt>Year</dt><dd>{record.year || 'Not recorded'}</dd><dt>Concepts</dt><dd>{record.concepts.length ? record.concepts.map(c => <Link key={c} href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link>) : 'Not recorded'}</dd>
      <dt>Consented</dt><dd>{consent === undefined ? 'Not recorded' : consent ? 'Yes' : 'No'}</dd><dt>Licence</dt><dd>{record.license || 'Not recorded'}</dd><dt>Citations</dt><dd>{Array.isArray(record.citations) ? record.citations.length : record.citations ?? 'Not recorded'}</dd><dt>Reads</dt><dd>{record.reads ?? 'Not recorded'}</dd>
    </dl>
      <div className="aside-section"><span className="label">Graph</span><svg className="graph-preview" viewBox="0 0 200 140" role="img" aria-label={`This thesis connects to ${record.concepts.length} recorded concepts`}><title>Concept connections</title>{record.concepts.slice(0, 8).map((c, i, all) => { const angle = i / all.length * Math.PI * 2; const x = 100 + Math.cos(angle) * 60, y = 70 + Math.sin(angle) * 48; return <g key={c}><line x1="100" y1="70" x2={x} y2={y} /><circle cx={x} cy={y} r="3"><title>{c}</title></circle></g>; })}<circle cx="100" cy="70" r="4" /></svg><Link href={`/graph?focus=${encodeURIComponent(id)}`}>Explore connections</Link></div>
      <div className="aside-section"><span className="label">Export citation</span><button className="text-button" onClick={() => downloadCitation({ ...record, author }, 'bib')}>BibTeX</button><button className="text-button" onClick={() => downloadCitation({ ...record, author }, 'ris')}>RIS</button><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setCopied('Link copied.'); } catch { setCopied('Copy the page URL from your address bar.'); } }}>Copy link</button><span role="status" className="meta">{copied}</span></div>
      <div className="aside-section"><span className="label">Full text</span>{pdf ? <a href={pdf} target="_blank" rel="noreferrer">Download PDF</a> : <p className="meta">No public PDF link recorded.</p>}</div>
    </aside>
  </div>;
}

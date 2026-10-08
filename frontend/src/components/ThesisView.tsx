import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage, request, thesis, type Neighbor, type Person, type Thesis } from '../api';
import { centreOf } from '../centres';
import { apa, doiUrl, downloadCitation, fullName, people } from '../citations';
import { ACCESS, LANGUAGES, LICENCES } from '../metadata';
import { useT } from '../i18n';
import { Link } from '../router';
import { NotebookToggle } from './ThesisCard';
import { Shape } from './Shapes';

interface Message { question: string; answer?: string; error?: string }
function PersonName({ person }: { person: Person }) {
  return <span className="person">{fullName(person)}{person.orcid && <a className="orcid" href={`https://orcid.org/${person.orcid}`} target="_blank" rel="noreferrer" aria-label={`ORCID record for ${fullName(person)}`} title={`ORCID ${person.orcid}`}>iD</a>}</span>;
}
function Names({ list, fallback }: { list: Person[]; fallback: string }) {
  return list.length ? <>{list.map((p, i) => <span key={i}>{i > 0 && (i === list.length - 1 ? ' and ' : ', ')}<PersonName person={p} /></span>)}</> : <>{fallback}</>;
}
export default function ThesisView({ id }: { id: string }) {
  const t = useT();
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
  const centre = centreOf(record.campus);
  const authors = people({ ...record, author }); const doi = doiUrl(record);
  const licence = record.licence ? LICENCES[record.licence] : undefined;
  const cite = apa({ ...record, author });
  const pdf = record.pdf_url && /^https?:\/\//i.test(record.pdf_url) ? record.pdf_url : undefined;
  return <div className="detail-layout">
    <article className="thesis-detail">
      <Link href="/" className="back-link">← {t('Discover')}</Link>
      <p className="record-id">{record.id}</p>
      <h1>{record.title}</h1>
      {record.title_fr && <p className="subtitle" lang="fr">{record.title_fr}</p>}
      <p className="meta"><Names list={authors} fallback={t('Author not recorded')} /> · {centre ? <Link href={`/centres/${centre.slug}`}>{centre.name}</Link> : <span className="capitalize">{record.campus || t('Centre not recorded')}</span>} · {record.year || t('Year not recorded')}</p>
      {doi ? <p className="doi-line"><span className="label-inline">DOI</span><a href={doi}>{doi}</a></p> : record.doi_state === 'draft' && <p className="doi-line pending"><span className="label-inline">DOI</span>{record.doi} · reserved, registration pending</p>}
      <div className="button-row"><NotebookToggle id={id} /><Link className="button ghost" href={`/graph?focus=${encodeURIComponent(id)}`}>{t('Explore in the graph')}</Link></div>
      <section><h2>{t('Abstract')}</h2><p className="abstract-full">{record.abstract || 'No abstract recorded.'}</p></section>
      {record.abstract_fr && <section lang="fr"><h2>Résumé</h2><p className="abstract-full">{record.abstract_fr}</p></section>}
      <section><h2>{t('Concepts')}</h2><p className="concept-line">{record.concepts.length ? record.concepts.map((c, i) => <span key={c}>{i > 0 ? ' · ' : ''}<Link href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link></span>) : 'No concepts recorded.'}</p></section>
      <section className="chat-section"><h2>{t('Ask this thesis')}</h2><p className="meta">Responses use the recorded abstract. Check claims against the original thesis.</p>
        <form className="search-form" onSubmit={ask}><label className="sr-only" htmlFor="question">Question for this thesis</label><input id="question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What model does this thesis use?" required /><button disabled={busy || !question.trim()}>{busy ? 'Asking…' : 'Ask'}</button></form>
        <div className="chat-thread" aria-live="polite" aria-busy={busy}>{messages.map((m, i) => <div className="exchange" key={i}><span className="label">You</span><p>{m.question}</p><span className="label">Thesis</span><p className={m.error ? 'error' : 'answer'}>{m.answer || m.error || 'Reading the abstract…'}</p></div>)}</div>
      </section>
      <section className="citation-block"><h2>{t('Suggested citation (APA 7)')}</h2><p className="apa">{cite}</p><button className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(cite); setCopied(t('Copied.')); } catch { setCopied('Select the citation to copy it.'); } }}>{t('Copy')}</button></section>
      <section><h2>{t('Related theses')}</h2>{neighborError ? <p className="meta">{neighborError}</p> : related.length ? <ul className="related-list">{related.map(n => <li key={n.id}><Link href={`/thesis/${encodeURIComponent(n.id!)}`}>{n.label}</Link></li>)}</ul> : <p className="meta">No related theses recorded.</p>}</section>
    </article>
    <aside className="metadata panel" aria-label="Thesis metadata"><h2>{t('Metadata')}</h2><dl>
      {doi && <><dt>DOI</dt><dd><a className="mono" href={doi}>{doi.replace('https://doi.org/', '')}</a></dd></>}<dt>ID</dt><dd className="mono">{id}</dd><dt>{authors.length > 1 ? 'Authors' : 'Author'}</dt><dd>{authors.length ? authors.map((p, i) => <PersonName key={i} person={p} />) : 'Not recorded'}</dd>{record.supervisors?.length ? <><dt>{record.supervisors.length > 1 ? 'Supervisors' : 'Supervisor'}</dt><dd>{record.supervisors.map((p, i) => <PersonName key={i} person={p} />)}</dd></> : null}<dt>{t('Centre')}</dt><dd>{centre ? <Link href={`/centres/${centre.slug}`}>{centre.name}</Link> : <span className="capitalize">{record.campus || 'Not recorded'}</span>}</dd>{record.programme && <><dt>Programme</dt><dd>{record.programme}</dd></>}{!record.supervisors?.length && record.supervisor && <><dt>Supervisor</dt><dd>{record.supervisor}</dd></>}<dt>{record.date_issued ? 'Date issued' : 'Year'}</dt><dd>{record.date_issued || record.year || 'Not recorded'}</dd>{record.language && <><dt>Language</dt><dd>{LANGUAGES[record.language] || record.language}</dd></>}<dt>Concepts</dt><dd>{record.concepts.length ? record.concepts.map(c => <Link key={c} href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link>) : 'Not recorded'}</dd>
      <dt>Consented</dt><dd>{consent === undefined ? 'Not recorded' : consent ? 'Yes' : 'No'}</dd><dt>Licence</dt><dd>{licence ? licence.url ? <a href={licence.url} target="_blank" rel="noreferrer">{licence.name}</a> : licence.name : record.license || 'Not recorded'}</dd>{record.access && <><dt>Access</dt><dd>{ACCESS[record.access]}{record.access === 'embargoed' && record.embargo_end ? ` until ${record.embargo_end}` : ''}</dd></>}{record.msc?.length ? <><dt>MSC 2020</dt><dd className="mono">{record.msc.join(', ')}</dd></> : null}<dt>Citations</dt><dd>{Array.isArray(record.citations) ? record.citations.length : record.citations ?? 'Not recorded'}</dd><dt>Reads</dt><dd>{record.reads ?? 'Not recorded'}</dd>
    </dl>
      <div className="aside-section"><span className="label">Graph</span><svg className="graph-preview" viewBox="0 0 200 140" role="img" aria-label={`This thesis connects to ${record.concepts.length} recorded concepts`}><title>Concept connections</title>{record.concepts.slice(0, 8).map((c, i, all) => { const angle = i / all.length * Math.PI * 2; const x = 100 + Math.cos(angle) * 60, y = 70 + Math.sin(angle) * 48; return <g key={c}><line className="edge" x1="100" y1="70" x2={x} y2={y} /><Shape node={{ type: 'concept' }} x={x} y={y} r={4} /><title>{c}</title></g>; })}<Shape node={{ type: 'thesis' }} x={100} y={70} r={6} /></svg><Link href={`/graph?focus=${encodeURIComponent(id)}`}>{t('Explore in the graph')}</Link></div>
      <div className="aside-section"><span className="label">{t('Export citation')}</span><button className="text-button" onClick={() => downloadCitation({ ...record, author }, 'bib')}>BibTeX</button><button className="text-button" onClick={() => downloadCitation({ ...record, author }, 'ris')}>RIS</button><button className="text-button" onClick={() => downloadCitation({ ...record, author }, 'csv')}>CSV</button><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setCopied('Link copied.'); } catch { setCopied('Copy the page URL from your address bar.'); } }}>Copy link</button><span role="status" className="meta">{copied}</span></div>
      <div className="aside-section"><span className="label">{t('Full text')}</span>{pdf ? <a href={pdf} target="_blank" rel="noreferrer">Download PDF</a> : <p className="meta">No public PDF link recorded.</p>}</div>
      <div className="aside-section"><Link href={`/thesis/${encodeURIComponent(id)}/curate`}>Curate metadata and DOI</Link></div>
    </aside>
  </div>;
}

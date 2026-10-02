import { useEffect, useRef, useState } from 'react';
import { archive, errorMessage, type Thesis } from '../api';
import { Link } from '../router';
import SearchForm from './SearchForm';

export default function Archive({ search, navigate }: { search: string; navigate: (href: string) => void }) {
  const params = new URLSearchParams(search);
  const query = params.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [records, setRecords] = useState<Thesis[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const campus = params.get('campus') || '';
  const concept = params.get('concept') || '';
  const year = params.get('year') || '';
  const sort = params.get('sort') || (query ? 'relevance' : 'newest');
  const links = useRef<HTMLAnchorElement[]>([]);
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setRecords([]);
    archive(query).then(rows => { if (active) setRecords(rows); })
      .catch(err => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, retry]);
  function update(name: string, value: string) {
    const next = new URLSearchParams(search);
    if (value) next.set(name, value); else next.delete(name);
    navigate(`/${next.size ? `?${next}` : ''}`);
  }
  const campuses = [...new Set(records.map(t => t.campus).filter((s): s is string => !!s))].sort();
  const concepts = [...new Set(records.flatMap(t => t.concepts))].sort();
  const years = [...new Set(records.map(t => t.year).filter((y): y is number => !!y))].sort((a, b) => b - a);
  const visible = records.filter(t => (!campus || t.campus === campus) && (!concept || t.concepts.includes(concept)) && (!year || String(t.year) === year));
  if (sort === 'newest') visible.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (sort === 'oldest') visible.sort((a, b) => (a.year || 0) - (b.year || 0));
  if (sort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title));
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      event.preventDefault();
      const items = links.current.slice(0, visible.length);
      const current = items.findIndex(item => item === document.activeElement);
      const index = current < 0 ? (event.key === 'j' ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, current + (event.key === 'j' ? 1 : -1)));
      items[index]?.focus();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [visible.length]);
  return <>
    <section className="search-hero" aria-labelledby="archive-heading">
      <p className="eyebrow">African Institute for Mathematical Sciences</p>
      <h1 id="archive-heading">Search AIMS theses</h1>
      <SearchForm value={draft} onChange={setDraft} onSubmit={() => update('q', draft.trim())} label="Search by title, author, concept…" busy={busy} />
      <div className="quick-filters" aria-label="Quick filters">
        <Link href="/">Recent</Link>
        {['ghana', 'rwanda', 'senegal'].map(c => <button key={c} aria-pressed={campus === c} onClick={() => update('campus', campus === c ? '' : c)}>{c}</button>)}
        {['epidemiology', 'topology'].map(c => <button key={c} aria-pressed={concept === c} onClick={() => update('concept', concept === c ? '' : c)}>{c}</button>)}
      </div>
    </section>
    <div className="archive-layout">
      <aside className="filters" aria-label="Filter theses">
        <h2>Refine your search</h2>
        <label>Campus<select value={campus} onChange={e => update('campus', e.target.value)}><option value="">All campuses</option>{[...new Set([...campuses, ...(campus ? [campus] : [])])].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Year<select value={year} onChange={e => update('year', e.target.value)}><option value="">All years</option>{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <label>Concept<select value={concept} onChange={e => update('concept', e.target.value)}><option value="">All concepts</option>{[...new Set([...concepts, ...(concept ? [concept] : [])])].map(c => <option key={c}>{c}</option>)}</select></label>
        {(campus || concept || year) && <Link href={query ? `/?q=${encodeURIComponent(query)}` : '/'}>Clear filters</Link>}
        <div className="aside-section"><span className="label">Explore the archive</span><Link href="/oracle">The Oracle</Link><Link href="/dreams">Dreams</Link><Link href="/graph">Browse the graph</Link></div>
        <p className="keyboard-help"><kbd>/</kbd> search<br /><kbd>j</kbd> / <kbd>k</kbd> move through results<br /><kbd>Enter</kbd> open a thesis</p>
      </aside>
      <section className="results" aria-label="Thesis results" aria-busy={busy}>
        <div className="results-toolbar"><p role="status">{busy ? 'Loading the archive…' : `${visible.length} ${visible.length === 1 ? 'thesis' : 'theses'}${query ? ` for “${query}”` : ''}`}</p><label>Sort <select value={sort} onChange={e => update('sort', e.target.value)}>{query && <option value="relevance">Relevance</option>}<option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title</option></select></label></div>
        {error && <div className="error" role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
        {!busy && !error && !visible.length && <div className="empty"><h2>No theses found</h2><p>Try another topic or clear your filters.</p></div>}
        {visible.map((t, i) => <article className="thesis-row" key={t.id}>
          <div className="record-id"><span>{t.id}</span><span>{t.year || 'Year not recorded'}</span></div>
          <h2><Link href={`/thesis/${encodeURIComponent(t.id)}`} ref={el => { if (el) links.current[i] = el; }}>{t.title}</Link></h2>
          <p className="meta">{t.author || 'Author not recorded'} · <span className="capitalize">{t.campus || 'Campus not recorded'}</span> · {t.concepts.length} concepts</p>
          <p className="abstract-snippet">{t.abstract || 'No abstract recorded.'}</p>
          <div className="concepts">{t.concepts.map(c => <Link key={c} href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link>)}</div>
        </article>)}
        {!busy && records.length >= 500 && <p className="meta">Showing up to 500 records. Refine the search to explore further.</p>}
      </section>
    </div>
  </>;
}

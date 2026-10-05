import { useEffect, useRef, useState } from 'react';
import { archive, errorMessage, type Thesis } from '../api';
import { CENTRES, centreOf } from '../centres';
import { useT } from '../i18n';
import { notebook } from '../notebook';
import { Link } from '../router';
import SearchForm from './SearchForm';
import ThesisCard from './ThesisCard';

export default function Archive({ search, navigate }: { search: string; navigate: (href: string) => void }) {
  const t = useT();
  const params = new URLSearchParams(search);
  const query = params.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [records, setRecords] = useState<Thesis[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  // `campus` is the pre-Centre parameter; old links keep working.
  const centre = params.get('centre') || centreOf(params.get('campus'))?.slug || '';
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
    if (name === 'centre') next.delete('campus');
    if (value) next.set(name, value); else next.delete(name);
    navigate(`/${next.size ? `?${next}` : ''}`);
  }
  const concepts = [...new Set(records.flatMap(r => r.concepts))].sort();
  const years = [...new Set(records.map(r => r.year).filter((y): y is number => !!y))].sort((a, b) => b - a);
  const perCentre = new Map<string, number>();
  records.forEach(r => { const c = centreOf(r.campus); if (c) perCentre.set(c.slug, (perCentre.get(c.slug) || 0) + 1); });
  const visible = records.filter(r => (!centre || centreOf(r.campus)?.slug === centre) && (!concept || r.concepts.includes(concept)) && (!year || String(r.year) === year));
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
  const stats = [[records.length, t('theses')], [perCentre.size, t('Centres')], [concepts.length, t('concepts')], [new Set(records.map(r => r.author).filter(Boolean)).size, t('authors')]] as const;
  return <>
    <section className="hero" aria-labelledby="archive-heading">
      <p className="eyebrow">African Institute for Mathematical Sciences</p>
      <h1 id="archive-heading">{t('The scholarly archive of the AIMS network')}</h1>
      <SearchForm value={draft} onChange={setDraft} onSubmit={() => update('q', draft.trim())} label={t('Search theses, authors, concepts and Centres…')} button={t('Search')} busy={busy} />
      <div className="centre-chips" aria-label={t('AIMS Centres')}>
        {CENTRES.map(c => <button key={c.slug} aria-pressed={centre === c.slug} onClick={() => update('centre', centre === c.slug ? '' : c.slug)}>{c.short}{perCentre.get(c.slug) ? <span className="chip-count">{perCentre.get(c.slug)}</span> : null}</button>)}
      </div>
      {!query && !busy && !error && <dl className="stat-row">{stats.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </section>
    <div className="archive-layout">
      <aside className="filters panel" aria-label="Filter theses">
        <h2>{t('Refine')}</h2>
        <label>{t('Centre')}<select value={centre} onChange={e => update('centre', e.target.value)}><option value="">{t('All Centres')}</option>{CENTRES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
        <label>{t('Year')}<select value={year} onChange={e => update('year', e.target.value)}><option value="">{t('All years')}</option>{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <label>{t('Concept')}<select value={concept} onChange={e => update('concept', e.target.value)}><option value="">{t('All concepts')}</option>{[...new Set([...concepts, ...(concept ? [concept] : [])])].map(c => <option key={c}>{c}</option>)}</select></label>
        {(centre || concept || year) && <Link href={query ? `/?q=${encodeURIComponent(query)}` : '/'}>{t('Clear filters')}</Link>}
        <div className="aside-section"><span className="label">Explore</span><Link href="/graph">{t('Knowledge graph')}</Link><Link href="/notebook">{t('Notebook')}</Link><Link href="/browse">{t('Browse')}</Link><Link href="/oracle">The Oracle</Link></div>
        <p className="keyboard-help"><kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>Enter</kbd> open<br /><kbd>g</kbd> <kbd>n</kbd> notebook · <kbd>g</kbd> <kbd>g</kbd> graph</p>
      </aside>
      <section className="results" aria-label="Thesis results" aria-busy={busy}>
        <div className="results-toolbar">
          <p role="status">{busy ? t('Loading the archive…') : `${visible.length} ${visible.length === 1 ? t('thesis') : t('theses')}${query ? ` for “${query}”` : ''}`}</p>
          <div className="toolbar-actions">
            {visible.length > 0 && <button className="ghost" onClick={() => notebook.add(visible.slice(0, 50).map(r => r.id))}>+ {t('Add all to notebook')}</button>}
            <label>{t('Sort')} <select value={sort} onChange={e => update('sort', e.target.value)}>{query && <option value="relevance">{t('Relevance')}</option>}<option value="newest">{t('Newest first')}</option><option value="oldest">{t('Oldest first')}</option><option value="title">{t('Title')}</option></select></label>
          </div>
        </div>
        {error && <div className="error" role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>{t('Retry')}</button></div>}
        {!busy && !error && !visible.length && <div className="empty"><h2>{t('No theses found')}</h2><p>{t('Try another topic or clear your filters.')}</p></div>}
        {visible.map((r, i) => <ThesisCard key={r.id} thesis={r} linkRef={el => { if (el) links.current[i] = el; }} />)}
        {!busy && records.length >= 500 && <p className="meta">Showing up to 500 records. Refine the search to explore further.</p>}
      </section>
    </div>
  </>;
}

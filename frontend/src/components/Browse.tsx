import type { ReactNode } from 'react';
import type { Thesis } from '../api';
import { CENTRES, centreOf } from '../centres';
import { useT } from '../i18n';
import { Link } from '../router';
import { useArchive } from '../useArchive';

// Browse menu from the roadmap (Section 6.1), scoped to the whole archive or one Centre.
const TABS = [['centre', 'By Centre'], ['date', 'By issue date'], ['author', 'Authors'], ['title', 'Titles'], ['subject', 'Subjects']] as const;
type Group = { key: string; items: { key: string; node: ReactNode }[] };
const thesisLink = (r: Thesis) => <Link href={`/thesis/${encodeURIComponent(r.id)}`}>{r.title}</Link>;
const initial = (s: string) => { const c = s.trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
const surname = (name: string) => name.includes(',') ? name : name.trim().split(/\s+/).slice(-1)[0];

function byInitial<T>(values: T[], name: (v: T) => string, render: (v: T) => ReactNode, sortKey = name): Group[] {
  const groups = new Map<string, { key: string; node: ReactNode }[]>();
  [...values].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).forEach(v => { const g = initial(sortKey(v)); groups.set(g, [...groups.get(g) || [], { key: name(v), node: render(v) }]); });
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
}

export default function Browse({ search, navigate }: { search: string; navigate: (href: string) => void }) {
  const t = useT(); const params = new URLSearchParams(search);
  const by = (TABS.find(([k]) => k === params.get('by'))?.[0]) || 'centre';
  const scope = params.get('centre') || '';
  const { records: all, busy, error, retry } = useArchive();
  const records = scope ? all.filter(r => centreOf(r.campus)?.slug === scope) : all;
  const go = (next: Record<string, string>) => { const p = new URLSearchParams(search); Object.entries(next).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k)); navigate(`/browse?${p}`); };
  let groups: Group[] = [];
  if (by === 'centre') groups = CENTRES.map(c => ({ key: c.name, items: records.filter(r => centreOf(r.campus)?.slug === c.slug).map(r => ({ key: r.id, node: <>{thesisLink(r)} <span className="meta">{r.year || ''}</span></> })) })).filter(g => g.items.length);
  if (by === 'date') { const years = [...new Set(records.map(r => r.year || 0))].sort((a, b) => b - a); groups = years.map(y => ({ key: y ? String(y) : t('Year not recorded'), items: records.filter(r => (r.year || 0) === y).map(r => ({ key: r.id, node: <>{thesisLink(r)} <span className="meta">{r.author || ''}</span></> })) })); }
  if (by === 'title') groups = byInitial(records, r => r.id, r => <>{thesisLink(r)} <span className="meta">{r.year || ''}</span></>, r => r.title);
  if (by === 'author') { const authors = [...new Set(records.map(r => r.author).filter((a): a is string => !!a))]; groups = byInitial(authors, a => a, a => <><strong>{a}</strong><ul>{records.filter(r => r.author === a).map(r => <li key={r.id}>{thesisLink(r)}</li>)}</ul></>, surname); }
  if (by === 'subject') { const counts = new Map<string, number>(); records.forEach(r => r.concepts.forEach(c => counts.set(c, (counts.get(c) || 0) + 1))); groups = byInitial([...counts.keys()], c => c, c => <><Link href={`/?concept=${encodeURIComponent(c)}${scope ? `&centre=${scope}` : ''}`}>{c}</Link> <span className="chip-count">{counts.get(c)}</span></>); }
  const letters = by === 'author' || by === 'title' || by === 'subject';
  return <div className="page">
    <header className="page-header"><p className="eyebrow">{t('Browse')}</p><h1>{t('Browse')}</h1></header>
    <div className="browse-bar">
      <div className="tabs" role="tablist" aria-label={t('Browse')}>{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={by === k} onClick={() => go({ by: k })}>{t(label)}</button>)}</div>
      <label>{t('Centre')} <select value={scope} onChange={e => go({ centre: e.target.value })}><option value="">{t('All Centres')}</option>{CENTRES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
    </div>
    {error && <div className="error" role="alert"><p>{error}</p><button onClick={retry}>{t('Retry')}</button></div>}
    {busy ? <p role="status">{t('Loading the archive…')}</p> : <>
      {letters && groups.length > 0 && <nav className="letter-jump" aria-label="Jump to letter">{groups.map(g => <a key={g.key} href={`#browse-${g.key}`} onClick={e => { e.preventDefault(); document.getElementById(`browse-${g.key}`)?.scrollIntoView(); }}>{g.key}</a>)}</nav>}
      {!groups.length && !error && <p className="empty">{t('No theses found')}</p>}
      <div className="browse-groups">{groups.map(g => <section key={g.key} id={`browse-${g.key}`} className="browse-group"><h2>{g.key} <span className="chip-count">{g.items.length}</span></h2><ul>{g.items.map(i => <li key={i.key}>{i.node}</li>)}</ul></section>)}</div>
    </>}
  </div>;
}

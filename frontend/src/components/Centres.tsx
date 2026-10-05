import { CENTRES, COMMUNITIES, centreBySlug, centreOf, type Centre } from '../centres';
import type { Thesis } from '../api';
import { useLang, useT } from '../i18n';
import { notebook } from '../notebook';
import { Link } from '../router';
import { useArchive } from '../useArchive';
import ThesisCard from './ThesisCard';

function topConcepts(theses: Thesis[], n = 6) {
  const counts = new Map<string, number>(); theses.forEach(t => t.concepts.forEach(c => counts.set(c, (counts.get(c) || 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
function Status({ busy, error, retry }: { busy: boolean; error: string; retry: () => void }) {
  const t = useT();
  if (error) return <div className="error" role="alert"><p>{error}</p><button onClick={retry}>{t('Retry')}</button></div>;
  return busy ? <p role="status">{t('Loading the archive…')}</p> : null;
}
function kindLabel(c: Centre, t: (s: string) => string) { return c.kind === 'research' ? t('Research and innovation') : t('Teaching Centre'); }

export default function Centres() {
  const t = useT(); const lang = useLang(); const { records, busy, error, retry } = useArchive();
  const unassigned = records.filter(r => !centreOf(r.campus)).length;
  return <div className="page">
    <header className="page-header"><p className="eyebrow">AIMS network</p><h1>{t('AIMS Centres')}</h1><p className="page-description">One community per Centre, as in the repository roadmap. Every item has an owning Centre and can also appear in programme communities.</p></header>
    <Status busy={busy} error={error} retry={retry} />
    <div className="centre-grid">{CENTRES.map(c => {
      const theses = records.filter(r => centreOf(r.campus)?.slug === c.slug);
      return <Link key={c.slug} href={`/centres/${c.slug}`} className="centre-card">
        <span className="centre-kind">{kindLabel(c, t)}</span>
        <h2>{c.name}</h2>
        <p className="meta">{c.city}, {c.country}{c.founded ? ` · ${t('Founded')} ${c.founded}` : ''}</p>
        <p className="centre-count"><strong>{busy ? '…' : error ? '—' : theses.length}</strong> {theses.length === 1 ? t('thesis') : t('theses')}</p>
        <p className="centre-concepts">{topConcepts(theses, 4).map(([c]) => c).join(' · ') || ' '}</p>
      </Link>;
    })}</div>
    {!busy && unassigned > 0 && <p className="meta">{unassigned} records have a campus value that does not match the Centre list and need curation.</p>}
    <section className="section"><h2>{t('Programme communities')}</h2><p className="meta">Communities C2 to C5. Items join a programme community through their recorded programme. C6 to C10 are reserved.</p>
      <div className="community-list">{COMMUNITIES.map(c => {
        const n = records.filter(r => r.programme && [c.slug, c.name.toLowerCase(), c.id.toLowerCase()].includes(r.programme.toLowerCase())).length;
        return <div key={c.id} className="community"><span className="mono">{c.id}</span><div><h3>{lang === 'fr' ? c.fr : c.name}</h3><p className="meta">{n ? `${n} ${n === 1 ? t('thesis') : t('theses')}` : t('No items mapped yet.')}</p></div></div>;
      })}</div>
    </section>
  </div>;
}

export function CentrePage({ slug }: { slug: string }) {
  const t = useT(); const centre = centreBySlug(slug); const { records, busy, error, retry } = useArchive();
  if (!centre) return <div className="empty"><h1>{t('Page not found')}</h1><Link href="/centres">{t('AIMS Centres')}</Link></div>;
  const theses = records.filter(r => centreOf(r.campus)?.slug === slug).sort((a, b) => (b.year || 0) - (a.year || 0));
  const years = theses.map(r => r.year).filter((y): y is number => !!y);
  const stats = [[theses.length, t('theses')], [new Set(theses.map(r => r.author).filter(Boolean)).size, t('authors')], [new Set(theses.flatMap(r => r.concepts)).size, t('concepts')], [years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—', t('Year')]] as const;
  return <div className="page">
    <Link href="/centres" className="back-link">← {t('AIMS Centres')}</Link>
    <header className="page-header"><p className="eyebrow">{kindLabel(centre, t)} · {centre.city}, {centre.country}</p><h1>{centre.name}</h1>
      <div className="button-row"><Link className="button" href={`/graph?centre=${slug}`}>{t('Explore in the graph')}</Link><Link className="button ghost" href={`/?centre=${slug}`}>{t('Search')}</Link>{theses.length > 0 && <button className="ghost" onClick={() => notebook.add(theses.slice(0, 50).map(r => r.id))}>+ {t('Add all to notebook')}</button>}</div>
    </header>
    <Status busy={busy} error={error} retry={retry} />
    {!busy && !error && <>
      <dl className="stat-row">{stats.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {theses.length > 0 && <section className="section"><h2>{t('Top concepts')}</h2><div className="concepts">{topConcepts(theses, 12).map(([c, n]) => <Link key={c} href={`/?centre=${slug}&concept=${encodeURIComponent(c)}`}>{c} <span className="chip-count">{n}</span></Link>)}</div></section>}
      <section className="section results"><h2>{theses.length} {theses.length === 1 ? t('thesis') : t('theses')}</h2>{theses.length ? theses.map(r => <ThesisCard key={r.id} thesis={r} />) : <p className="empty">No theses from {centre.name} are in the archive yet.</p>}</section>
    </>}
  </div>;
}

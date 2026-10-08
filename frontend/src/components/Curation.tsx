import { useEffect, useState } from 'react';
import { errorMessage, request, type Completeness, type DoiService } from '../api';
import { Link } from '../router';

interface Row extends Partial<Completeness> { id: string; title?: string; doi?: string | null; doi_state?: string | null; error?: string }
interface Report { theses: number; required_completeness: number | null; doi_ready: number; registered: number; doi_service: DoiService; rows: Row[] }

export default function Curation() {
  const [report, setReport] = useState<Report>(); const [error, setError] = useState(''); const [filter, setFilter] = useState<'all' | 'incomplete' | 'ready' | 'draft' | 'registered'>('incomplete'); const [attempt, setAttempt] = useState(0);
  useEffect(() => { setError(''); request<Report>('/curation/report').then(setReport).catch(e => setError(errorMessage(e))); }, [attempt]);
  if (error) return <div className="page"><h1>Curation</h1><div className="error" role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></div></div>;
  if (!report) return <p role="status">Loading the curation report…</p>;
  const rows = report.rows.filter(r => filter === 'all' || (filter === 'incomplete' ? !r.doi_ready : filter === 'ready' ? r.doi_ready && !r.doi_state : filter === 'draft' ? r.doi_state === 'draft' : r.doi_state === 'findable')).sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  const target = (report.required_completeness ?? 0) >= 95;
  return <div className="page">
    <header className="page-header"><p className="eyebrow">Repository quality</p><h1>Curation</h1><p className="page-description">Metadata completeness across the archive. The roadmap target is 95% of required fields, with a DOI for every thesis.</p></header>
    <dl className="stat-row">
      <div><dt>Theses</dt><dd>{report.theses}</dd></div>
      <div className={target ? 'stat-good' : 'stat-warn'}><dt>Required fields complete</dt><dd>{report.required_completeness ?? '—'}%</dd><p className="meta">{target ? 'Meets' : 'Below'} the 95% target</p></div>
      <div><dt>Ready for a DOI</dt><dd>{report.doi_ready}</dd></div>
      <div><dt>DOIs registered</dt><dd>{report.registered}</dd>{report.doi_service.test && <p className="meta">DataCite test system</p>}</div>
    </dl>
    <div className="browse-bar section"><div className="tabs" role="tablist" aria-label="Records">{([['incomplete', 'Incomplete'], ['ready', 'Ready for a DOI'], ['draft', 'Draft DOI'], ['registered', 'Registered'], ['all', 'All']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div><p className="meta">{rows.length} records</p></div>
    <table className="data-table"><thead><tr><th scope="col">Thesis</th><th scope="col">Complete</th><th scope="col">Missing</th><th scope="col">DOI</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>
        <td><Link href={`/thesis/${encodeURIComponent(r.id)}/curate`}>{r.title || r.id}</Link><div className="mono meta">{r.id}</div></td>
        <td>{r.error ? <span className="error-text">{r.error}</span> : <div className="mini-meter" title={`Required ${r.required_score}% · overall ${r.score}%`}><span style={{ width: `${r.score}%` }} className={r.doi_ready ? 'ok' : ''} /><b>{r.score}%</b></div>}</td>
        <td className="meta">{[...(r.missing_required || []), ...(r.missing_recommended || []).map(m => `${m} (recommended)`)].join(', ') || 'Nothing'}</td>
        <td>{r.doi_state === 'findable' ? <a className="mono" href={`https://doi.org/${r.doi}`}>{r.doi}</a> : r.doi_state === 'draft' ? <span className="state draft">Draft</span> : r.doi_ready ? <span className="state ready">Ready</span> : '—'}</td>
      </tr>)}</tbody></table>
    {!rows.length && <p className="empty">No records in this view.</p>}
  </div>;
}

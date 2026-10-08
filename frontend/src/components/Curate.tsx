import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage, request, type Completeness, type Metadata, type MetadataRecord, type Person } from '../api';
import { CENTRES } from '../centres';
import { ACCESS, LANGUAGES, LICENCES, PROGRAMMES } from '../metadata';
import { Link } from '../router';

const TOKEN_KEY = 'sankofa.curator.v1';
function storedToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
const list = (text: string) => text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);

/** Mirrors metadata.completeness() so curators see the effect of each edit before saving. */
function check(m: Metadata, keywords: string, msc: string): Completeness {
  const required: [string, boolean][] = [['Title', !!m.title.trim()], ['Author(s)', m.authors.some(a => a.family.trim())], ['Year or date issued', !!(m.year || m.date_issued)], ['Centre', !!m.centre], ['Abstract', !!m.abstract?.trim()], ['Keywords', list(keywords).length > 0], ['Licence', !!m.licence], ['Language', !!m.language]];
  const recommended: [string, boolean][] = [['Supervisor(s)', m.supervisors.some(s => s.family.trim())], ['Author ORCID', m.authors.length > 0 && m.authors.every(a => a.orcid)], ['Programme', !!m.programme], ['Full date issued', !!m.date_issued], ['MSC 2020 subject codes', list(msc).length > 0], ['French title', !!m.title_fr?.trim()], ['French abstract', !!m.abstract_fr?.trim()]];
  const missingRequired = required.filter(([, ok]) => !ok).map(([l]) => l), missingRecommended = recommended.filter(([, ok]) => !ok).map(([l]) => l);
  const total = required.length + recommended.length;
  return { score: Math.round(100 * (total - missingRequired.length - missingRecommended.length) / total), required_score: Math.round(100 * (required.length - missingRequired.length) / required.length), missing_required: missingRequired, missing_recommended: missingRecommended, doi_ready: !missingRequired.length };
}
function clean(m: Metadata, keywords: string, msc: string): Metadata {
  const person = (p: Person) => ({ family: p.family.trim(), given: p.given?.trim() || '', orcid: p.orcid?.trim() || null });
  const blank = (v: string | null) => v?.trim() || null;
  return { ...m, title_fr: blank(m.title_fr), abstract: blank(m.abstract), abstract_fr: blank(m.abstract_fr), date_issued: blank(m.date_issued), embargo_end: m.access === 'embargoed' ? blank(m.embargo_end) : null, programme: blank(m.programme), licence: blank(m.licence), centre: blank(m.centre), language: blank(m.language),
    authors: m.authors.filter(a => a.family.trim()).map(person), supervisors: m.supervisors.filter(a => a.family.trim()).map(person), keywords: list(keywords), msc: list(msc),
    funders: m.funders.filter(f => f.name.trim()).map(f => ({ name: f.name.trim(), identifier: f.identifier?.trim() || null, award: f.award?.trim() || null })), related: m.related.filter(r => r.identifier.trim()) };
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field${wide ? ' wide' : ''}`}><span>{label}</span>{children}{hint && <small className="meta">{hint}</small>}</label>;
}
function People({ label, people, onChange }: { label: string; people: Person[]; onChange: (p: Person[]) => void }) {
  const set = (i: number, patch: Partial<Person>) => onChange(people.map((p, j) => j === i ? { ...p, ...patch } : p));
  return <fieldset className="repeat"><legend>{label}</legend>
    {people.map((p, i) => <div key={i} className="repeat-row person-row">
      <Field label="Family name"><input value={p.family} onChange={e => set(i, { family: e.target.value })} /></Field>
      <Field label="Given names"><input value={p.given || ''} onChange={e => set(i, { given: e.target.value })} /></Field>
      <Field label="ORCID"><input value={p.orcid || ''} onChange={e => set(i, { orcid: e.target.value })} placeholder="0000-0000-0000-0000" /></Field>
      <button type="button" className="text-button remove" onClick={() => onChange(people.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}>Remove</button>
    </div>)}
    <button type="button" className="ghost small" onClick={() => onChange([...people, { family: '', given: '', orcid: '' }])}>+ Add {label.toLowerCase().replace(/\(s\)$/, '')}</button>
  </fieldset>;
}

export default function Curate({ id }: { id: string }) {
  const [rec, setRec] = useState<MetadataRecord>(); const [form, setForm] = useState<Metadata>();
  const [keywords, setKeywords] = useState(''); const [msc, setMsc] = useState('');
  const [token, setToken] = useState(storedToken); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false); const [attempt, setAttempt] = useState(0);
  function accept(r: MetadataRecord) { setRec(r); setForm(r.metadata); setKeywords(r.metadata.keywords.join(', ')); setMsc(r.metadata.msc.join(', ')); setConfirm(false); }
  useEffect(() => { setError(''); request<MetadataRecord>(`/theses/${encodeURIComponent(id)}/metadata`).then(accept).catch(e => setError(errorMessage(e))); }, [id, attempt]);
  useEffect(() => { try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* Token lasts for this page only. */ } }, [token]);
  if (!rec || !form) return error ? <div className="error" role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Retry</button></div> : <p role="status">Loading metadata…</p>;

  const set = (patch: Partial<Metadata>) => setForm({ ...form, ...patch });
  const draft = clean(form, keywords, msc);
  const live = check(form, keywords, msc);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rec.metadata);
  const service = rec.doi_service; const state = rec.metadata.doi_state;
  async function run(label: string, action: () => Promise<void>) { setBusy(label); setError(''); setNotice(''); try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); } }
  const reload = () => request<MetadataRecord>(`/theses/${encodeURIComponent(id)}/metadata`).then(accept);
  const save = (e: FormEvent) => { e.preventDefault(); run('save', async () => { const r = await request<MetadataRecord>(`/theses/${encodeURIComponent(id)}/metadata`, draft, undefined, { method: 'PUT', token }); await reload(); setNotice(r.warning || 'Saved.'); }); };
  const doi = (action: 'reserve' | 'register' | 'discard') => run(action, async () => { const r = await request<{ doi: string | null; doi_state: string | null }>(`/theses/${encodeURIComponent(id)}/doi`, { action }, undefined, { token }); await reload(); setNotice(action === 'discard' ? 'Draft DOI discarded.' : action === 'reserve' ? `Draft DOI ${r.doi} reserved. Review the record, then register it.` : `DOI ${r.doi} registered.`); });

  return <div className="page curate">
    <Link href={`/thesis/${encodeURIComponent(id)}`} className="back-link">← Back to the thesis</Link>
    <header className="page-header"><p className="eyebrow">Curation · {id}</p><h1>Metadata and DOI</h1><p className="page-description">Complete the record to the repository standard. A DOI can be reserved once every required field is filled, and registered after review.</p></header>
    <div className="curate-layout">
      <form className="curate-form" onSubmit={save} aria-label="Thesis metadata">
        <section className="panel form-section"><h2>Title</h2>
          <Field label="Title" wide><input required value={form.title} onChange={e => set({ title: e.target.value })} /></Field>
          <Field label="French title" hint="Shown as the translated title." wide><input lang="fr" value={form.title_fr || ''} onChange={e => set({ title_fr: e.target.value })} /></Field>
        </section>
        <section className="panel form-section"><h2>People</h2>
          <People label="Author(s)" people={form.authors} onChange={authors => set({ authors })} />
          <People label="Supervisor(s)" people={form.supervisors} onChange={supervisors => set({ supervisors })} />
        </section>
        <section className="panel form-section"><h2>Description</h2>
          <Field label="Abstract" wide><textarea rows={6} value={form.abstract || ''} onChange={e => set({ abstract: e.target.value })} /></Field>
          <Field label="French abstract" wide><textarea lang="fr" rows={4} value={form.abstract_fr || ''} onChange={e => set({ abstract_fr: e.target.value })} /></Field>
          <div className="field-grid">
            <Field label="Keywords" hint="Separate with commas."><input value={keywords} onChange={e => setKeywords(e.target.value)} /></Field>
            <Field label="MSC 2020 codes" hint="For example 92D30, 60H10."><input value={msc} onChange={e => setMsc(e.target.value)} /></Field>
          </div>
        </section>
        <section className="panel form-section"><h2>Context</h2>
          <div className="field-grid">
            <Field label="Centre"><select value={form.centre || ''} onChange={e => set({ centre: e.target.value || null })}><option value="">Choose a Centre</option>{CENTRES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
            <Field label="Programme"><select value={form.programme || ''} onChange={e => set({ programme: e.target.value || null })}><option value="">Not recorded</option>{PROGRAMMES.map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Year"><input type="number" min={1990} max={2100} value={form.year ?? ''} onChange={e => set({ year: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Date issued" hint="YYYY-MM-DD"><input value={form.date_issued || ''} onChange={e => set({ date_issued: e.target.value })} placeholder="2019-06-30" /></Field>
            <Field label="Language"><select value={form.language || ''} onChange={e => set({ language: e.target.value || null })}><option value="">Not recorded</option>{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Degree"><input value={form.degree || ''} onChange={e => set({ degree: e.target.value || null })} /></Field>
          </div>
        </section>
        <section className="panel form-section"><h2>Rights and access</h2>
          <div className="field-grid">
            <Field label="Licence"><select value={form.licence || ''} onChange={e => set({ licence: e.target.value || null })}><option value="">Choose a licence</option>{Object.entries(LICENCES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Field>
            <Field label="Access"><select value={form.access} onChange={e => set({ access: e.target.value as Metadata['access'] })}>{Object.entries(ACCESS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            {form.access === 'embargoed' && <Field label="Embargo ends" hint="12 to 24 months, with a reason on file."><input value={form.embargo_end || ''} onChange={e => set({ embargo_end: e.target.value })} placeholder="2027-06-30" /></Field>}
          </div>
        </section>
        <section className="panel form-section"><h2>Funding and related work</h2>
          <fieldset className="repeat"><legend>Funders</legend>
            {form.funders.map((f, i) => <div key={i} className="repeat-row">
              <Field label="Funder"><input value={f.name} onChange={e => set({ funders: form.funders.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="Mastercard Foundation" /></Field>
              <Field label="ROR or Funder ID"><input value={f.identifier || ''} onChange={e => set({ funders: form.funders.map((x, j) => j === i ? { ...x, identifier: e.target.value } : x) })} /></Field>
              <Field label="Award number"><input value={f.award || ''} onChange={e => set({ funders: form.funders.map((x, j) => j === i ? { ...x, award: e.target.value } : x) })} /></Field>
              <button type="button" className="text-button remove" onClick={() => set({ funders: form.funders.filter((_, j) => j !== i) })}>Remove</button>
            </div>)}
            <button type="button" className="ghost small" onClick={() => set({ funders: [...form.funders, { name: '', identifier: '', award: '' }] })}>+ Add funder</button>
          </fieldset>
          <fieldset className="repeat"><legend>Related articles, datasets and code</legend>
            {form.related.map((r, i) => <div key={i} className="repeat-row">
              <Field label="Identifier"><input value={r.identifier} onChange={e => set({ related: form.related.map((x, j) => j === i ? { ...x, identifier: e.target.value } : x) })} placeholder="10.1234/article" /></Field>
              <Field label="Type"><select value={r.kind} onChange={e => set({ related: form.related.map((x, j) => j === i ? { ...x, kind: e.target.value as typeof r.kind } : x) })}>{['DOI', 'URL', 'Handle', 'arXiv'].map(k => <option key={k}>{k}</option>)}</select></Field>
              <Field label="Relation"><select value={r.relation} onChange={e => set({ related: form.related.map((x, j) => j === i ? { ...x, relation: e.target.value } : x) })}>{[['IsSupplementedBy', 'Dataset or code for this thesis'], ['IsSourceOf', 'Article based on this thesis'], ['References', 'Work this thesis cites'], ['IsPartOf', 'Part of a larger work']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <button type="button" className="text-button remove" onClick={() => set({ related: form.related.filter((_, j) => j !== i) })}>Remove</button>
            </div>)}
            <button type="button" className="ghost small" onClick={() => set({ related: [...form.related, { identifier: '', kind: 'DOI', relation: 'IsSupplementedBy' }] })}>+ Add related work</button>
          </fieldset>
        </section>
        <div className="save-bar"><Field label="Curator token"><input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Required to save" /></Field>
          <button type="submit" disabled={!!busy || !dirty || !token}>{busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
          {dirty && <button type="button" className="ghost" onClick={() => accept(rec)}>Discard changes</button>}
        </div>
        {error && <p className="error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </form>
      <aside className="curate-side">
        <section className="panel side-card"><h2>Completeness</h2>
          <div className="meter" role="meter" aria-label="Required fields complete" aria-valuemin={0} aria-valuemax={100} aria-valuenow={live.required_score}><span style={{ width: `${live.required_score}%` }} className={live.doi_ready ? 'ok' : ''} /></div>
          <p className="meta">Required fields {live.required_score}% · overall {live.score}%</p>
          {live.missing_required.length > 0 && <><h3>Required for a DOI</h3><ul className="missing">{live.missing_required.map(m => <li key={m}>{m}</li>)}</ul></>}
          {live.missing_recommended.length > 0 && <><h3>Recommended</h3><ul className="missing soft">{live.missing_recommended.map(m => <li key={m}>{m}</li>)}</ul></>}
          {live.doi_ready && !live.missing_recommended.length && <p>Every field is complete.</p>}
        </section>
        <section className="panel side-card doi-card"><h2>DOI</h2>
          {service.test && <p className="badge-test">DataCite test system: these DOIs are for rehearsal and never resolve publicly.</p>}
          {!service.configured ? <p className="meta">DOI registration is not configured on this server. An administrator sets the DataCite repository account and prefix.</p>
          : !service.landing_pages ? <p className="meta">Set the website address (LA_PUBLIC_URL) on the server so each DOI can point to its thesis page.</p>
          : !state ? <>
            <p className="meta">No DOI yet. Reserving creates a draft: it can still change or be discarded, and it does not resolve.</p>
            <button onClick={() => doi('reserve')} disabled={!!busy || dirty || !live.doi_ready || !token}>{busy === 'reserve' ? 'Reserving…' : 'Reserve a DOI'}</button>
            {dirty && <p className="meta">Save your changes first.</p>}
          </> : state === 'draft' ? <>
            <p><span className="state draft">Draft</span> <span className="mono">{rec.metadata.doi}</span></p>
            <p className="meta">Saved edits update the draft. Check the DataCite record below, then register.</p>
            <label className="toggle"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />I have reviewed this record. Registration is permanent: the DOI can never be deleted.</label>
            <div className="button-row"><button onClick={() => doi('register')} disabled={!!busy || dirty || !confirm || !token}>{busy === 'register' ? 'Registering…' : 'Register DOI'}</button><button className="ghost" onClick={() => doi('discard')} disabled={!!busy || !token}>Discard draft</button></div>
          </> : <>
            <p><span className="state findable">Registered</span> <a className="mono" href={`https://doi.org/${rec.metadata.doi}`}>{rec.metadata.doi}</a></p>
            <p className="meta">Saved edits are sent to DataCite automatically.</p>
          </>}
        </section>
        <details className="panel side-card"><summary>DataCite record preview</summary><p className="meta">What DataCite receives for the saved record.</p><pre className="json">{JSON.stringify(rec.datacite, null, 2)}</pre></details>
      </aside>
    </div>
  </div>;
}

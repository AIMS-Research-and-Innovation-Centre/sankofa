import type { Ref } from 'react';
import type { Thesis } from '../api';
import { centreOf } from '../centres';
import { useT } from '../i18n';
import { notebook, useNotebook } from '../notebook';
import { Link } from '../router';

export function NotebookToggle({ id, compact = false }: { id: string; compact?: boolean }) {
  const t = useT(); const added = useNotebook().sources.includes(id);
  return <button className={`chip-button${added ? ' active' : ''}`} aria-pressed={added} onClick={() => notebook.toggle(id)} title={added ? t('In notebook') : t('Add to notebook')}>{added ? '✓' : '+'}{compact ? '' : ` ${added ? t('In notebook') : t('Add to notebook')}`}</button>;
}

export default function ThesisCard({ thesis, linkRef }: { thesis: Thesis; linkRef?: Ref<HTMLAnchorElement> }) {
  const t = useT(); const centre = centreOf(thesis.campus);
  return <article className="thesis-row">
    <div className="record-id"><span>{thesis.id}</span><span>{thesis.year || t('Year not recorded')}</span></div>
    <h2><Link href={`/thesis/${encodeURIComponent(thesis.id)}`} ref={linkRef}>{thesis.title}</Link></h2>
    <p className="meta">{thesis.author || t('Author not recorded')} · {centre ? <Link href={`/centres/${centre.slug}`}>{centre.name}</Link> : <span className="capitalize">{thesis.campus || t('Centre not recorded')}</span>} · {thesis.concepts.length} {t('concepts')}</p>
    <p className="abstract-snippet">{thesis.abstract || t('No abstract recorded.')}</p>
    <div className="row-footer"><div className="concepts">{thesis.concepts.map(c => <Link key={c} href={`/?concept=${encodeURIComponent(c)}`}>{c}</Link>)}</div><NotebookToggle id={thesis.id} /></div>
  </article>;
}

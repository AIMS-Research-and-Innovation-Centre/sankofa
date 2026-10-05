import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { askNotebook, errorMessage, type NotebookAnswer, type Thesis } from '../api';
import { centreOf } from '../centres';
import { apa, download } from '../citations';
import { useT } from '../i18n';
import { notebook, uid, useNotebook } from '../notebook';
import { Link } from '../router';
import { useArchive } from '../useArchive';

function sharedConcepts(sources: Thesis[]) {
  const by = new Map<string, Thesis[]>(); sources.forEach(s => new Set(s.concepts).forEach(c => by.set(c, [...by.get(c) || [], s])));
  return [...by].filter(([, list]) => list.length > 1).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
const firstSentence = (text?: string) => (text || '').split(/(?<=[.!?])\s+/)[0] || 'No abstract recorded.';

/** Answer text with [n] markers turned into links to the cited source. */
function Cited({ answer, sources }: { answer: NotebookAnswer; sources: Thesis[] }) {
  const parts: ReactNode[] = []; let last = 0;
  for (const m of answer.answer.matchAll(/\[(\d+)\]/g)) {
    parts.push(answer.answer.slice(last, m.index)); last = m.index! + m[0].length;
    const ref = answer.sources.find(s => s.n === Number(m[1])); const source = ref && (sources.find(s => s.id === ref.id) || ref);
    parts.push(ref ? <Link key={m.index} className="cite" href={`/thesis/${encodeURIComponent(ref.id)}`} title={source?.title}>{m[1]}</Link> : m[0]);
  }
  parts.push(answer.answer.slice(last));
  return <p className="answer">{parts}</p>;
}
const asText = (a: NotebookAnswer) => `${a.answer}\n\n${a.sources.map(s => `[${s.n}] ${s.title}`).join('\n')}`;

export default function Notebook() {
  const t = useT(); const state = useNotebook(); const { records, busy, error, retry } = useArchive();
  const [find, setFind] = useState(''); const [question, setQuestion] = useState(''); const [asking, setAsking] = useState(false);
  const [panel, setPanel] = useState<'sources' | 'chat' | 'studio'>('chat');
  const byId = new Map(records.map(r => [r.id, r]));
  const sources = state.sources.map(id => byId.get(id)).filter((s): s is Thesis => !!s);
  const active = sources.filter(s => !state.muted.includes(s.id));
  const missing = busy ? 0 : state.sources.length - sources.length;
  const q = find.trim().toLowerCase();
  const candidates = q ? records.filter(r => !state.sources.includes(r.id) && `${r.title} ${r.author || ''} ${r.concepts.join(' ')} ${centreOf(r.campus)?.name || r.campus || ''}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const overlaps = sharedConcepts(active);
  const suggestions = active.length ? ['What methods do these theses use?', overlaps[0] ? `How do these theses approach ${overlaps[0][0]}?` : 'What problems do these theses address?', 'Summarise the main findings of each source.', 'What open questions do these sources leave?'] : [];

  async function ask(text: string) {
    const qn = text.trim(); if (!qn || asking || !active.length) return;
    const id = uid(); setQuestion(''); setAsking(true);
    notebook.setMessages(m => [...m, { id, question: qn }]);
    try { const answer = await askNotebook(active, qn); notebook.setMessages(m => m.map(x => x.id === id ? { ...x, answer } : x)); }
    catch (e) { notebook.setMessages(m => m.map(x => x.id === id ? { ...x, error: errorMessage(e) } : x)); }
    finally { setAsking(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); ask(question); }
  function keys(e: KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question); } }
  const guide = () => notebook.addNote('Source guide', active.map((s, i) => `[${i + 1}] ${s.title}\n${s.author || 'Author not recorded'} · ${centreOf(s.campus)?.name || s.campus || 'Centre not recorded'} · ${s.year || 'n.d.'}\nConcepts: ${s.concepts.join(', ') || 'none recorded'}\n${firstSentence(s.abstract)}`).join('\n\n'));
  const bibliography = () => notebook.addNote('Bibliography (APA 7)', [...active].sort((a, b) => (a.author || '').localeCompare(b.author || '')).map(apa).join('\n\n'));
  const overlapNote = () => notebook.addNote('Shared concepts', overlaps.length ? overlaps.map(([c, list]) => `${c}: ${list.map(s => s.title).join('; ')}`).join('\n') : 'No concept is shared by two or more of the selected sources.');
  function exportMarkdown() {
    const md = [`# Sankofa notebook`, `Exported ${new Date().toISOString().slice(0, 10)}`, '', '## Sources', ...sources.map((s, i) => `${i + 1}. ${apa(s)}`), '', '## Notes', ...state.notes.flatMap(n => [`### ${n.title}`, n.body, '']), '## Conversation', ...state.messages.flatMap(m => [`**Q:** ${m.question}`, '', m.answer ? asText(m.answer) : m.error || '', ''])].join('\n');
    download('sankofa-notebook.md', md, 'md');
  }

  return <div className="notebook">
    <header className="notebook-header"><div><p className="eyebrow">{t('Notebook')}</p><h1>{t('Ask your sources')}</h1><p className="meta">Choose theses as sources, then ask questions. Answers draw only on the selected sources’ abstracts and cite them by number.</p></div>
      <div className="segmented" role="tablist" aria-label="Notebook panels">{(['sources', 'chat', 'studio'] as const).map(p => <button key={p} role="tab" aria-selected={panel === p} onClick={() => setPanel(p)}>{t(p === 'sources' ? 'Sources' : p === 'chat' ? 'Notebook' : 'Studio')}{p === 'sources' && sources.length ? ` (${sources.length})` : ''}</button>)}</div>
    </header>
    {error && <div className="error" role="alert"><p>{error}</p><button onClick={retry}>{t('Retry')}</button></div>}
    <div className="notebook-grid" data-panel={panel}>
      <section className="panel nb-sources" aria-labelledby="nb-sources-h">
        <div className="panel-head"><h2 id="nb-sources-h">{t('Sources')} <span className="chip-count">{active.length}/{sources.length}</span></h2>{sources.length > 0 && <button className="text-button" onClick={notebook.clearSources}>Clear</button>}</div>
        <label className="field">Add from the archive<input id="nb-find" type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Title, author, concept, Centre…" /></label>
        {q && <ul className="candidates">{candidates.map(c => <li key={c.id}><button className="ghost add" onClick={() => notebook.add([c.id])} aria-label={`Add ${c.title}`}>+</button><span>{c.title}<span className="meta"> · {centreOf(c.campus)?.short || c.campus} {c.year || ''}</span></span></li>)}{!candidates.length && <li className="meta">{busy ? t('Loading the archive…') : 'No matching theses.'}</li>}</ul>}
        {!sources.length && !busy && <div className="empty small"><p>No sources yet. Add theses here, from search results, or from the knowledge graph.</p>{records.length > 0 && <button onClick={() => notebook.add([...records].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 5).map(r => r.id))}>Add the 5 most recent theses</button>}</div>}
        <ol className="source-list">{sources.map((s, i) => <li key={s.id} className={state.muted.includes(s.id) ? 'muted' : ''}>
          <input type="checkbox" checked={!state.muted.includes(s.id)} onChange={() => notebook.mute(s.id)} aria-label={`Use ${s.title} in answers`} />
          <span className="source-n">{i + 1}</span>
          <div><Link href={`/thesis/${encodeURIComponent(s.id)}`}>{s.title}</Link><p className="meta">{centreOf(s.campus)?.short || s.campus || t('Centre not recorded')} · {s.year || 'n.d.'}</p></div>
          <button className="text-button" onClick={() => notebook.remove(s.id)} aria-label={`${t('Remove')} ${s.title}`}>×</button>
        </li>)}</ol>
        {missing > 0 && <p className="meta">{missing} saved sources are no longer in the archive.</p>}
      </section>
      <section className="panel nb-chat" aria-labelledby="nb-chat-h">
        <div className="panel-head"><h2 id="nb-chat-h">{t('Notebook')}</h2>{state.messages.length > 0 && <button className="text-button" onClick={notebook.clearChat}>Clear chat</button>}</div>
        <div className="chat-scroll" aria-live="polite" aria-busy={asking}>
          {active.length > 0 && <div className="overview"><p><strong>{active.length} {active.length === 1 ? 'source' : 'sources'}</strong> from {[...new Set(active.map(s => centreOf(s.campus)?.short || s.campus || '—'))].join(', ')}.{overlaps.length ? <> Shared concepts: {overlaps.slice(0, 6).map(([c]) => c).join(', ')}.</> : ' No concept is shared by two or more sources yet.'}</p></div>}
          {!active.length && <div className="empty"><h3>{sources.length ? 'All sources are switched off' : 'Add sources to begin'}</h3><p className="meta">{sources.length ? 'Tick at least one source to ask questions.' : 'A notebook answers from the theses you choose, nothing else.'}</p>{!sources.length && <button className="ghost" onClick={() => { setPanel('sources'); requestAnimationFrame(() => document.getElementById('nb-find')?.focus()); }}>Choose sources</button>}</div>}
          {state.messages.map(m => <div key={m.id} className="exchange">
            <p className="question">{m.question}</p>
            {m.answer ? <div className="answer-card"><Cited answer={m.answer} sources={sources} />
              <p className="meta answer-mode">{m.answer.mode === 'model' ? 'Written by the archive’s language model from the selected abstracts. Verify against the theses.' : 'Quoted from the selected abstracts (no language model was available).'}</p>
              <div className="button-row"><button className="ghost" onClick={() => notebook.addNote(m.question, asText(m.answer!))}>{t('Save to notes')}</button><button className="ghost" onClick={() => navigator.clipboard?.writeText(asText(m.answer!)).catch(() => {})}>{t('Copy')}</button></div>
            </div> : m.error ? <p className="error" role="alert">{m.error}</p> : <p className="meta" role="status">Reading the sources…</p>}
          </div>)}
        </div>
        {active.length > 0 && !state.messages.length && <div className="suggestions">{suggestions.map(s => <button key={s} className="chip-button" onClick={() => ask(s)}>{s}</button>)}</div>}
        <form className="ask-form" onSubmit={submit}><label className="sr-only" htmlFor="nb-question">Question for your sources</label><textarea id="nb-question" rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={keys} placeholder={active.length ? `Ask ${active.length} ${active.length === 1 ? 'source' : 'sources'}…` : 'Add sources to ask questions'} disabled={!active.length} /><button type="submit" disabled={asking || !question.trim() || !active.length}>{asking ? t('Working…') : 'Ask'}</button></form>
      </section>
      <section className="panel nb-studio" aria-labelledby="nb-studio-h">
        <div className="panel-head"><h2 id="nb-studio-h">{t('Studio')}</h2></div>
        <div className="studio-actions">
          <button className="studio-card" onClick={guide} disabled={!active.length}><strong>Source guide</strong><span>Each source in one paragraph</span></button>
          <button className="studio-card" onClick={overlapNote} disabled={active.length < 2}><strong>Shared concepts</strong><span>Where the sources meet</span></button>
          <button className="studio-card" onClick={bibliography} disabled={!active.length}><strong>Bibliography</strong><span>APA 7th edition</span></button>
          <button className="studio-card" onClick={exportMarkdown} disabled={!sources.length && !state.notes.length}><strong>Export</strong><span>Notes, sources and chat as Markdown</span></button>
        </div>
        <div className="panel-head"><h3>{t('Notes')} <span className="chip-count">{state.notes.length}</span></h3><button className="text-button" onClick={() => notebook.addNote('Note', '')}>+ New note</button></div>
        {!state.notes.length && <p className="meta">Saved answers and Studio outputs appear here.</p>}
        <ul className="notes">{state.notes.map(n => <li key={n.id} className="note"><div className="panel-head"><h4>{n.title}</h4><button className="text-button" onClick={() => notebook.removeNote(n.id)} aria-label={`Delete note ${n.title}`}>×</button></div><textarea aria-label={`Note: ${n.title}`} value={n.body} onChange={e => notebook.updateNote(n.id, e.target.value)} rows={Math.min(12, Math.max(3, n.body.split('\n').length + 1))} /></li>)}</ul>
      </section>
    </div>
  </div>;
}

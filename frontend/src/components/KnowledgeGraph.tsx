import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { CENTRES, centreBySlug, centreOf } from '../centres';
import { buildGraph, linksOf, neighbourhood, TYPES, type KGraph, type KLink, type KNode, type NodeType } from '../knowledge';
import { useT } from '../i18n';
import { notebook } from '../notebook';
import { Link } from '../router';
import { useArchive } from '../useArchive';
import { NotebookToggle } from './ThesisCard';
import { Shape, size, Swatch } from './Shapes';

const TYPE_LABEL: Record<NodeType, string> = { thesis: 'Thesis', concept: 'Concept', centre: 'Centre', author: 'Author' };
const PLURAL: Record<NodeType, string> = { thesis: 'Theses', concept: 'Concepts', centre: 'Centres', author: 'Authors' };
const REL: Record<KLink['rel'], string> = { about: 'about', authored: 'authored', at: 'at' };
const endId = (e: string | KNode) => typeof e === 'string' ? e : e.id;

function layout(graph: KGraph) {
  const sim = forceSimulation<KNode>(graph.nodes)
    .force('link', forceLink<KNode, KLink>(graph.links).id(n => n.id).distance(l => l.rel === 'at' ? 90 : l.rel === 'about' ? 45 : 28).strength(l => l.rel === 'at' ? 0.15 : 0.6))
    .force('charge', forceManyBody<KNode>().strength(n => n.type === 'centre' ? -600 : n.type === 'thesis' ? -140 : -60))
    .force('collide', forceCollide<KNode>(n => size(n) + 3))
    .force('x', forceX(0).strength(0.04)).force('y', forceY(0).strength(0.04))
    .stop();
  sim.tick(Math.min(400, 120 + graph.nodes.length / 2));
}

export default function KnowledgeGraph({ search, navigate }: { search: string; navigate: (href: string) => void }) {
  const t = useT(); const params = new URLSearchParams(search);
  const { records, busy, error, retry } = useArchive();
  const scope = params.get('centre') || '';
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());
  const [sharedOnly, setSharedOnly] = useState<boolean | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(() => params.get('focus') ? `thesis:${params.get('focus')}` : params.get('concept') ? `concept:${params.get('concept')!.toLowerCase()}` : scope ? `centre:${scope}` : null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [, redraw] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; id?: string; x: number; y: number; moved: boolean } | null>(null);

  const full = useMemo(() => buildGraph(scope ? records.filter(r => centreOf(r.campus)?.slug === scope) : records), [records, scope]);
  const shared = sharedOnly ?? full.nodes.length > 160;
  const graph = useMemo(() => {
    let keep = full.nodes.filter(n => !hidden.has(n.type) && (!shared || n.type !== 'concept' || n.degree > 1));
    if (focusOnly && selected) { const near = neighbourhood(full, selected, 2); keep = keep.filter(n => near.has(n.id)); }
    const ids = new Set(keep.map(n => n.id));
    const g: KGraph = { nodes: keep.map(n => ({ ...n })), links: full.links.filter(l => ids.has(endId(l.source)) && ids.has(endId(l.target))).map(l => ({ source: endId(l.source), target: endId(l.target), rel: l.rel })) };
    layout(g); return g;
  }, [full, hidden, shared, focusOnly, selected]);
  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph]);
  const node = selected ? byId.get(selected) || full.nodes.find(n => n.id === selected) : undefined;
  const near = useMemo(() => selected && byId.has(selected) ? neighbourhood(graph, selected, 1) : null, [graph, selected, byId]);
  const matches = useMemo(() => { const q = query.trim().toLowerCase(); return q ? new Set(graph.nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id)) : null; }, [graph, query]);

  function fit() {
    const box = svg.current?.getBoundingClientRect(); if (!box || !graph.nodes.length) return;
    const xs = graph.nodes.map(n => n.x || 0), ys = graph.nodes.map(n => n.y || 0);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(2.5, 0.9 * Math.min(box.width / Math.max(80, x1 - x0), box.height / Math.max(80, y1 - y0)));
    setView({ k, x: box.width / 2 - k * (x0 + x1) / 2, y: box.height / 2 - k * (y0 + y1) / 2 });
  }
  function centreOn(id: string) {
    const n = byId.get(id); const box = svg.current?.getBoundingClientRect(); if (!n || !box) return;
    setView(v => { const k = Math.max(v.k, 1.4); return { k, x: box.width / 2 - k * (n.x || 0), y: box.height / 2 - k * (n.y || 0) }; });
  }
  useEffect(() => { fit(); }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected && byId.has(selected) && (params.get('focus') || params.get('concept'))) centreOn(selected); }, [byId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setFocusOnly(false); setQuery(''); } }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);

  const local = (e: { clientX: number; clientY: number }) => { const box = svg.current!.getBoundingClientRect(); return { x: e.clientX - box.left, y: e.clientY - box.top }; };
  function wheel(e: WheelEvent) {
    const p = local(e); const factor = Math.exp(-e.deltaY * 0.0015);
    setView(v => { const k = Math.min(6, Math.max(0.15, v.k * factor)); return { k, x: p.x - (p.x - v.x) * k / v.k, y: p.y - (p.y - v.y) * k / v.k }; });
  }
  function down(e: ReactPointerEvent, id?: string) {
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: id ? 'node' : 'pan', id, x: e.clientX, y: e.clientY, moved: false };
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 3) d.moved = true; if (!d.moved) return;
    d.x = e.clientX; d.y = e.clientY;
    if (d.kind === 'pan') setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    else { const n = byId.get(d.id!); if (n) { n.x = (n.x || 0) + dx / view.k; n.y = (n.y || 0) + dy / view.k; redraw(i => i + 1); } }
  }
  function up() { const d = drag.current; drag.current = null; if (d && !d.moved) setSelected(d.kind === 'node' ? d.id! : null); }
  function zoom(f: number) { const box = svg.current?.getBoundingClientRect(); if (!box) return; const p = { x: box.width / 2, y: box.height / 2 }; setView(v => { const k = Math.min(6, Math.max(0.15, v.k * f)); return { k, x: p.x - (p.x - v.x) * k / v.k, y: p.y - (p.y - v.y) * k / v.k }; }); }
  function pick(id: string) { setSelected(id); requestAnimationFrame(() => centreOn(id)); }

  const showLabel = (n: KNode) => n.id === selected || matches?.has(n.id) || (near?.has(n.id) && view.k > 0.6) || n.type === 'centre' || (n.type === 'concept' && (n.degree >= 3 || view.k > 1.3)) || (n.type === 'thesis' && view.k > 1.7) || (n.type === 'author' && view.k > 2.4);
  // A selection outranks the search highlight, so its neighbours stay readable.
  const dim = (id: string) => near ? !near.has(id) : !!matches && !matches.has(id);
  const counts = Object.fromEntries(TYPES.map(type => [type, full.nodes.filter(n => n.type === type).length])) as Record<NodeType, number>;
  const connections = node ? linksOf(full, node.id) : [];
  const thesesOf = (n: KNode) => n.type === 'thesis' ? [n.ref] : connections.filter(c => c.node.type === 'thesis').map(c => c.node.ref);
  const thesis = node?.type === 'thesis' ? records.find(r => r.id === node.ref) : undefined;

  return <div className="graph-page">
    <header className="graph-header">
      <div><p className="eyebrow">{scope ? centreBySlug(scope)?.name : 'AIMS network'}</p><h1>{t('Knowledge graph')}</h1><p className="meta">Theses linked to the concepts they study, their authors and their Centre. Select any node to see what it connects.</p></div>
      <p className="mono meta" role="status">{busy ? t('Loading the archive…') : `${graph.nodes.length} nodes · ${graph.links.length} links`}</p>
    </header>
    {error && <div className="error" role="alert"><p>{error}</p><button onClick={retry}>{t('Retry')}</button></div>}
    <div className="graph-workspace">
      <aside className="panel graph-controls" aria-label="Graph controls">
        <label className="field">Find a node<input id="primary-search" type="search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && matches?.size) pick([...matches][0]); }} placeholder="Concept, thesis, author…" /></label>
        {matches && <p className="meta">{matches.size} {matches.size === 1 ? 'match' : 'matches'}{matches.size > 0 && ' · Enter selects the first'}</p>}
        <fieldset className="legend"><legend>Show</legend>{TYPES.map(type => <label key={type} className="legend-item"><input type="checkbox" checked={!hidden.has(type)} onChange={() => setHidden(h => { const n = new Set(h); if (n.has(type)) n.delete(type); else n.add(type); return n; })} /><Swatch type={type} />{PLURAL[type]}<span className="chip-count">{counts[type]}</span></label>)}</fieldset>
        <label className="toggle"><input type="checkbox" checked={shared} onChange={e => setSharedOnly(e.target.checked)} />Only concepts shared by two or more theses</label>
        <label className="toggle"><input type="checkbox" checked={focusOnly} disabled={!selected} onChange={e => setFocusOnly(e.target.checked)} />Only the selected node’s neighbourhood</label>
        <label className="field">{t('Centre')}<select value={scope} onChange={e => navigate(`/graph${e.target.value ? `?centre=${e.target.value}` : ''}`)}><option value="">{t('All Centres')}</option>{CENTRES.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
      </aside>
      <section className="graph-stage" aria-label="Knowledge graph view">
        <svg ref={svg} className="graph-svg" role="img" aria-label={`Knowledge graph of ${graph.nodes.length} nodes. A keyboard-accessible list follows.`} onWheel={wheel} onPointerDown={e => down(e)} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { drag.current = null; }}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            <g className="edges">{graph.links.map((l, i) => { const a = byId.get(endId(l.source))!, b = byId.get(endId(l.target))!; const hot = selected && (a.id === selected || b.id === selected); return <line key={i} className={`edge${hot ? ' hot' : ''}${dim(a.id) || dim(b.id) ? ' dim' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}</g>
            <g>{graph.nodes.map(n => <g key={n.id} className={`node${n.id === selected ? ' selected' : ''}${dim(n.id) ? ' dim' : ''}`} onPointerDown={e => down(e, n.id)}>
              <title>{`${TYPE_LABEL[n.type]}: ${n.label}`}</title>
              {n.id === selected && <circle className="halo" cx={n.x} cy={n.y} r={size(n) + 6} />}
              <Shape node={n} x={n.x} y={n.y} />
              {showLabel(n) && !dim(n.id) && <text className={`node-label t-${n.type}`} x={(n.x || 0) + size(n) + 4} y={(n.y || 0) + 4} fontSize={Math.max(9, 12 / Math.sqrt(view.k))}>{n.label.length > 48 ? `${n.label.slice(0, 46)}…` : n.label}</text>}
            </g>)}</g>
          </g>
        </svg>
        <div className="graph-tools"><button className="ghost" onClick={() => zoom(1.3)} aria-label="Zoom in">+</button><button className="ghost" onClick={() => zoom(1 / 1.3)} aria-label="Zoom out">−</button><button className="ghost" onClick={fit}>Fit</button></div>
        <p className="graph-hint">Scroll to zoom · drag to pan · drag a node to move it · Esc clears</p>
      </section>
      <aside className="panel inspector" aria-live="polite" aria-label="Selected node">
        {!node ? <div className="inspector-empty"><h2>Explore connections</h2><p className="meta">Select a node, or search for a concept. Concepts shared by several theses sit between them; Centres anchor their theses.</p>
          <ul className="legend-key">{TYPES.map(type => <li key={type}><Swatch type={type} />{TYPE_LABEL[type]}</li>)}</ul></div>
        : <>
          <p className="node-type"><Swatch type={node.type} />{TYPE_LABEL[node.type]}</p>
          <h2>{node.label}</h2>
          {thesis && <p className="meta">{thesis.author || t('Author not recorded')} · {thesis.year || t('Year not recorded')}</p>}
          {thesis?.abstract && <p className="abstract-snippet">{thesis.abstract}</p>}
          <div className="button-row">
            {node.type === 'thesis' && <Link className="button" href={`/thesis/${encodeURIComponent(node.ref)}`}>Open thesis</Link>}
            {node.type === 'thesis' && <NotebookToggle id={node.ref} />}
            {node.type === 'centre' && <Link className="button" href={`/centres/${node.ref}`}>Centre page</Link>}
            {node.type === 'concept' && <Link className="button" href={`/?concept=${encodeURIComponent(node.label)}`}>Theses on this concept</Link>}
            {node.type !== 'thesis' && thesesOf(node).length > 0 && <button className="ghost" onClick={() => notebook.add(thesesOf(node).slice(0, 50))}>+ Add {thesesOf(node).length} to notebook</button>}
          </div>
          <p className="meta">{connections.length} connections</p>
          {TYPES.map(type => { const items = connections.filter(c => c.node.type === type); return items.length ? <section key={type} className="inspector-group"><h3><Swatch type={type} />{PLURAL[type]} <span className="chip-count">{items.length}</span></h3><ul>{items.slice(0, 30).map(c => <li key={c.node.id}><button className="text-button" onClick={() => pick(c.node.id)}>{c.node.label}</button>{type === 'thesis' && node.type === 'concept' ? null : <span className="meta"> {REL[c.rel]}</span>}</li>)}</ul>{items.length > 30 && <p className="meta">and {items.length - 30} more</p>}</section> : null; })}
        </>}
      </aside>
    </div>
    <details className="graph-list"><summary>List view: every node and its links</summary>
      {TYPES.filter(type => !hidden.has(type)).map(type => <section key={type}><h3>{PLURAL[type]}</h3><ul>{graph.nodes.filter(n => n.type === type).sort((a, b) => b.degree - a.degree).map(n => <li key={n.id}><button className="text-button" onClick={() => pick(n.id)}>{n.label}</button> <span className="meta">{n.degree} links</span></li>)}</ul></section>)}
    </details>
  </div>;
}

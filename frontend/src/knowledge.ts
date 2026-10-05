import type { Thesis } from './api';
import { centreOf } from './centres';

// The archive as a typed knowledge graph: theses link to their concepts, authors and Centre.
export type NodeType = 'thesis' | 'concept' | 'author' | 'centre';
export interface KNode { id: string; type: NodeType; label: string; ref: string; degree: number; x?: number; y?: number; fx?: number | null; fy?: number | null }
export interface KLink { source: string | KNode; target: string | KNode; rel: 'about' | 'authored' | 'at' }
export interface KGraph { nodes: KNode[]; links: KLink[] }
export const TYPES: NodeType[] = ['thesis', 'concept', 'centre', 'author'];

export function buildGraph(theses: Thesis[]): KGraph {
  const nodes = new Map<string, KNode>(); const links: KLink[] = [];
  const node = (type: NodeType, ref: string, label: string) => {
    const id = `${type}:${type === 'thesis' ? ref : ref.toLowerCase()}`;
    let n = nodes.get(id); if (!n) { n = { id, type, label, ref, degree: 0 }; nodes.set(id, n); }
    return n;
  };
  const link = (a: KNode, b: KNode, rel: KLink['rel']) => { a.degree++; b.degree++; links.push({ source: a.id, target: b.id, rel }); };
  for (const t of theses) {
    const thesis = node('thesis', t.id, t.title);
    for (const c of new Set(t.concepts)) link(thesis, node('concept', c, c), 'about');
    if (t.author) link(node('author', t.author, t.author), thesis, 'authored');
    const centre = centreOf(t.campus);
    if (centre) link(thesis, node('centre', centre.slug, centre.short), 'at');
  }
  return { nodes: [...nodes.values()], links };
}

const endId = (end: string | KNode) => typeof end === 'string' ? end : end.id;
/** Node ids within `hops` links of `start`. */
export function neighbourhood(graph: KGraph, start: string, hops = 1): Set<string> {
  const adjacent = new Map<string, string[]>();
  for (const l of graph.links) { const a = endId(l.source), b = endId(l.target); adjacent.set(a, [...adjacent.get(a) || [], b]); adjacent.set(b, [...adjacent.get(b) || [], a]); }
  let frontier = [start]; const seen = new Set(frontier);
  for (let h = 0; h < hops; h++) { frontier = frontier.flatMap(id => adjacent.get(id) || []).filter(id => !seen.has(id)); frontier.forEach(id => seen.add(id)); }
  return seen;
}
export function linksOf(graph: KGraph, id: string): { node: KNode; rel: KLink['rel'] }[] {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  return graph.links.flatMap(l => { const a = endId(l.source), b = endId(l.target); return a === id ? [{ node: byId.get(b)!, rel: l.rel }] : b === id ? [{ node: byId.get(a)!, rel: l.rel }] : []; });
}

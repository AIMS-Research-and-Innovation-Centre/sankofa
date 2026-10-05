import type { NodeType } from '../knowledge';

type Shaped = { type: NodeType; degree?: number };
export const size = (n: Shaped) => n.type === 'centre' ? 13 : n.type === 'thesis' ? 6.5 : n.type === 'concept' ? 4.5 + Math.min(6, Math.sqrt(n.degree ?? 1) * 1.4) : 4.5;

/** Distinct shape per node type, so identity never rests on colour alone. */
export function Shape({ node, x = 0, y = 0, r = size(node) }: { node: Shaped; x?: number; y?: number; r?: number }) {
  const cls = `node-shape n-${node.type}`;
  if (node.type === 'concept') return <rect className={cls} x={x - r * 0.8} y={y - r * 0.8} width={r * 1.6} height={r * 1.6} transform={`rotate(45 ${x} ${y})`} />;
  if (node.type === 'author') return <rect className={cls} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} />;
  if (node.type === 'centre') return <polygon className={cls} points={Array.from({ length: 6 }, (_, i) => `${x + r * Math.cos(Math.PI / 3 * i)},${y + r * Math.sin(Math.PI / 3 * i)}`).join(' ')} />;
  return <circle className={cls} cx={x} cy={y} r={r} />;
}
export function Swatch({ type }: { type: NodeType }) { return <svg className="swatch" width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><Shape node={{ type }} r={type === 'centre' ? 7 : 5} /></svg>; }

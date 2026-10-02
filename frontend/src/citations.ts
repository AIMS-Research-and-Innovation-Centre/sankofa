import type { Thesis } from './api';
import { routeHref } from './router';

function bib(value: unknown): string { return String(value ?? '').replace(/\\/g, '\\textbackslash{}').replace(/[{}%&#_$]/g, '\\$&').replace(/\r?\n/g, ' '); }
function ris(value: unknown): string { return String(value ?? '').replace(/\r?\n/g, ' '); }
export function citation(t: Thesis, format: 'bib' | 'ris'): string {
  const url = `${location.origin}${routeHref(`/thesis/${encodeURIComponent(t.id)}`)}`;
  if (format === 'ris') return ['TY  - THES', `ID  - ${ris(t.id)}`, `TI  - ${ris(t.title)}`, ...(t.author ? [`AU  - ${ris(t.author)}`] : []), ...(t.year ? [`PY  - ${t.year}`] : []), `PB  - African Institute for Mathematical Sciences${t.campus ? `, ${ris(t.campus)}` : ''}`, `UR  - ${url}`, ...(t.abstract ? [`AB  - ${ris(t.abstract)}`] : []), ...t.concepts.map(c => `KW  - ${ris(c)}`), 'ER  -', ''].join('\n');
  const fields = [ ['title', t.title], ['author', t.author], ['year', t.year], ['school', `African Institute for Mathematical Sciences${t.campus ? `, ${t.campus}` : ''}`], ['url', url] ].filter(([, value]) => value);
  return `@mastersthesis{${t.id.replace(/[^a-zA-Z0-9:_-]/g, '_')},\n${fields.map(([key, value]) => `  ${key} = {${bib(value)}}`).join(',\n')}\n}\n`;
}
export function downloadCitation(t: Thesis, format: 'bib' | 'ris') {
  const url = URL.createObjectURL(new Blob([citation(t, format)], { type: format === 'bib' ? 'application/x-bibtex' : 'application/x-research-info-systems' }));
  const a = document.createElement('a'); a.href = url; a.download = `${t.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

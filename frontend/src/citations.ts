import type { Thesis } from './api';
import { centreOf } from './centres';
import { routeHref } from './router';

function bib(value: unknown): string { return String(value ?? '').replace(/\\/g, '\\textbackslash{}').replace(/[{}%&#_$]/g, '\\$&').replace(/\r?\n/g, ' '); }
function ris(value: unknown): string { return String(value ?? '').replace(/\r?\n/g, ' '); }
function csv(value: unknown): string { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const school = (t: Thesis) => centreOf(t.campus)?.name || `African Institute for Mathematical Sciences${t.campus ? `, ${t.campus}` : ''}`;
export const recordUrl = (t: Thesis) => `${location.origin}${routeHref(`/thesis/${encodeURIComponent(t.id)}`)}`;

/** APA 7th edition, the repository's suggested style (roadmap Section 2.2). */
export function apa(t: Thesis): string {
  const doi = t.doi ? (t.doi.startsWith('http') ? t.doi : `https://doi.org/${t.doi}`) : recordUrl(t);
  return `${t.author || 'Author not recorded'}. (${t.year || 'n.d.'}). ${t.title} [Master's thesis, ${school(t)}]. Sankofa. ${doi}`;
}
export function citation(t: Thesis, format: 'bib' | 'ris' | 'csv'): string {
  const url = recordUrl(t);
  if (format === 'csv') return ['id,title,author,year,centre,concepts,url', [t.id, t.title, t.author, t.year, centreOf(t.campus)?.name || t.campus, t.concepts.join('||'), url].map(csv).join(','), ''].join('\n');
  if (format === 'ris') return ['TY  - THES', `ID  - ${ris(t.id)}`, `TI  - ${ris(t.title)}`, ...(t.author ? [`AU  - ${ris(t.author)}`] : []), ...(t.year ? [`PY  - ${t.year}`] : []), `PB  - ${ris(school(t))}`, `UR  - ${url}`, ...(t.abstract ? [`AB  - ${ris(t.abstract)}`] : []), ...t.concepts.map(c => `KW  - ${ris(c)}`), 'ER  -', ''].join('\n');
  const fields = [['title', t.title], ['author', t.author], ['year', t.year], ['school', school(t)], ['url', url]].filter(([, value]) => value);
  return `@mastersthesis{${t.id.replace(/[^a-zA-Z0-9:_-]/g, '_')},\n${fields.map(([key, value]) => `  ${key} = {${bib(value)}}`).join(',\n')}\n}\n`;
}
const types = { bib: 'application/x-bibtex', ris: 'application/x-research-info-systems', csv: 'text/csv', md: 'text/markdown' };
export function download(name: string, text: string, kind: keyof typeof types) {
  const url = URL.createObjectURL(new Blob([text], { type: types[kind] }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCitation(t: Thesis, format: 'bib' | 'ris' | 'csv') { download(`${t.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`, citation(t, format), format); }

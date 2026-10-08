import type { Person, Thesis } from './api';
import { centreOf } from './centres';
import { routeHref } from './router';

function bib(value: unknown): string { return String(value ?? '').replace(/\\/g, '\\textbackslash{}').replace(/[{}%&#_$]/g, '\\$&').replace(/\r?\n/g, ' '); }
function ris(value: unknown): string { return String(value ?? '').replace(/\r?\n/g, ' '); }
function csv(value: unknown): string { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
const school = (t: Thesis) => centreOf(t.campus)?.name || `African Institute for Mathematical Sciences${t.campus ? `, ${t.campus}` : ''}`;
export const recordUrl = (t: Thesis) => `${location.origin}${routeHref(`/thesis/${encodeURIComponent(t.id)}`)}`;

/** Authors as people: curated records first, else the free-text author field. */
export function people(t: Thesis): Person[] {
  if (t.authors?.length) return t.authors;
  return (t.author || '').split(';').map(a => a.trim()).filter(Boolean).map(a => {
    if (a.includes(',')) { const [family, given] = a.split(',', 2).map(x => x.trim()); return { family, given }; }
    const parts = a.split(/\s+/); return { family: parts.pop()!, given: parts.join(' ') };
  });
}
export const fullName = (p: Person) => [p.given, p.family].filter(Boolean).join(' ');
const initials = (given = '') => given.split(/[\s-]+/).filter(Boolean).map(g => `${g[0].toUpperCase()}.`).join(' ');
/** A registered DOI as a link; drafts do not resolve, so they are never cited. */
export const doiUrl = (t: Thesis) => t.doi && t.doi_state !== 'draft' ? (t.doi.startsWith('http') ? t.doi : `https://doi.org/${t.doi}`) : undefined;
const isPhd = (t: Thesis) => t.programme === 'PhD' || /doctor/i.test(t.degree || '');

/** APA 7th edition, the repository's suggested style (roadmap Section 2.2). */
export function apa(t: Thesis): string {
  const names = people(t).map(p => p.given ? `${p.family}, ${initials(p.given)}` : p.family);
  const by = !names.length ? 'Author not recorded.' : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  return `${by}${by.endsWith('.') ? '' : '.'} (${t.year || 'n.d.'}). ${t.title} [${isPhd(t) ? 'Doctoral dissertation' : "Master's thesis"}, ${school(t)}]. Sankofa. ${doiUrl(t) || recordUrl(t)}`;
}
export function citation(t: Thesis, format: 'bib' | 'ris' | 'csv'): string {
  const url = recordUrl(t); const doi = doiUrl(t)?.replace('https://doi.org/', '');
  const authors = people(t);
  if (format === 'csv') return ['id,title,author,year,centre,concepts,doi,url', [t.id, t.title, authors.map(p => `${p.family}, ${p.given || ''}`.replace(/, $/, '')).join('||'), t.year, centreOf(t.campus)?.name || t.campus, t.concepts.join('||'), doi, url].map(csv).join(','), ''].join('\n');
  if (format === 'ris') return ['TY  - THES', `ID  - ${ris(t.id)}`, `TI  - ${ris(t.title)}`, ...authors.map(p => `AU  - ${ris(p.given ? `${p.family}, ${p.given}` : p.family)}`), ...(t.year ? [`PY  - ${t.year}`] : []), ...(t.date_issued ? [`DA  - ${t.date_issued.replace(/-/g, '/')}`] : []), `PB  - ${ris(school(t))}`, `M3  - ${isPhd(t) ? 'Doctoral dissertation' : "Master's thesis"}`, ...(doi ? [`DO  - ${doi}`] : []), `UR  - ${url}`, ...(t.language ? [`LA  - ${t.language}`] : []), ...(t.abstract ? [`AB  - ${ris(t.abstract)}`] : []), ...t.concepts.map(c => `KW  - ${ris(c)}`), 'ER  -', ''].join('\n');
  const fields = [['title', t.title], ['author', authors.map(p => p.given ? `${p.family}, ${p.given}` : p.family).join(' and ')], ['year', t.year], ['school', school(t)], ['doi', doi], ['url', url]].filter(([, value]) => value);
  return `@${isPhd(t) ? 'phdthesis' : 'mastersthesis'}{${t.id.replace(/[^a-zA-Z0-9:_-]/g, '_')},\n${fields.map(([key, value]) => `  ${key} = {${bib(value)}}`).join(',\n')}\n}\n`;
}
const types = { bib: 'application/x-bibtex', ris: 'application/x-research-info-systems', csv: 'text/csv', md: 'text/markdown' };
export function download(name: string, text: string, kind: keyof typeof types) {
  const url = URL.createObjectURL(new Blob([text], { type: types[kind] }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCitation(t: Thesis, format: 'bib' | 'ris' | 'csv') { download(`${t.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`, citation(t, format), format); }

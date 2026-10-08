// Controlled Centre list (roadmap Section 5); mirrors src/sankofa/centres.py.
export interface Centre { slug: string; name: string; short: string; country: string; city: string; kind: 'centre' | 'research'; founded?: number; aliases: string[] }
export const CENTRES: Centre[] = [
  { slug: 'south-africa', name: 'AIMS South Africa', short: 'South Africa', country: 'South Africa', city: 'Cape Town', kind: 'centre', founded: 2003, aliases: ['south africa', 'southafrica', 'za', 'cape town', 'muizenberg'] },
  { slug: 'senegal', name: 'AIMS Senegal', short: 'Senegal', country: 'Senegal', city: 'Mbour', kind: 'centre', founded: 2011, aliases: ['sn', 'mbour', 'dakar'] },
  { slug: 'ghana', name: 'AIMS Ghana', short: 'Ghana', country: 'Ghana', city: 'Biriwa', kind: 'centre', founded: 2012, aliases: ['gh', 'biriwa', 'accra'] },
  { slug: 'cameroon', name: 'AIMS Cameroon', short: 'Cameroon', country: 'Cameroon', city: 'Limbe', kind: 'centre', founded: 2013, aliases: ['cm', 'limbe'] },
  { slug: 'rwanda', name: 'AIMS Rwanda', short: 'Rwanda', country: 'Rwanda', city: 'Kigali', kind: 'centre', founded: 2016, aliases: ['rw', 'kigali'] },
  { slug: 'tanzania', name: 'AIMS Tanzania', short: 'Tanzania', country: 'Tanzania', city: 'Bagamoyo', kind: 'centre', founded: 2014, aliases: ['tz', 'bagamoyo', 'tanzania'] },
  { slug: 'ric', name: 'AIMS Research and Innovation Centre', short: 'AIMS RIC', country: 'Rwanda', city: 'Kigali', kind: 'research', founded: 2021, aliases: ['aims ric', 'aims-ric', 'research and innovation centre', 'research & innovation centre'] },
];
// Programme and theme communities (roadmap C2 to C5). Items join through their recorded programme.
export const COMMUNITIES = [
  { id: 'C2', slug: 'math-epi', name: 'Mathematical Epidemiology', fr: 'Épidémiologie mathématique' },
  { id: 'C3', slug: 'climate', name: 'Climate Science', fr: 'Sciences du climat' },
  { id: 'C4', slug: 'ai', name: 'Artificial Intelligence', fr: 'Intelligence artificielle' },
  { id: 'C5', slug: 'ammi', name: "African Master's in Machine Intelligence (AMMI)", fr: 'Master africain en intelligence artificielle (AMMI)' },
];

const key = (value: string) => value.toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const index = new Map<string, Centre>();
for (const c of CENTRES) for (const name of [c.slug, c.name, c.country, c.name.replace(/^AIMS /, ''), ...c.aliases]) if (!index.has(key(name))) index.set(key(name), c);
export function centreOf(campus?: string | null): Centre | undefined {
  if (!campus) return undefined;
  const k = key(campus);
  return index.get(k) || index.get(k.replace(/^aims /, ''));
}
export function centreBySlug(slug: string) { return CENTRES.find(c => c.slug === slug); }

import type { Access } from './api';

// Controlled lists mirrored from src/sankofa/metadata.py.
export const LICENCES: Record<string, { name: string; url?: string }> = {
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'CC-BY-NC-4.0': { name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  'CC-BY-NC-ND-4.0': { name: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  'CC0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'all-rights-reserved': { name: 'All rights reserved' },
};
export const ACCESS: Record<Access, string> = { open: 'Open access', embargoed: 'Embargoed', restricted: 'Restricted', 'metadata-only': 'Metadata only' };
export const PROGRAMMES = ['MSc', 'PhD', 'Research Chair', 'Co-op/Internship', 'Scholars Program', 'AHC'];
export const LANGUAGES: Record<string, string> = { en: 'English', fr: 'French', pt: 'Portuguese', ar: 'Arabic', sw: 'Swahili' };

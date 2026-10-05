import { createContext, useContext } from 'react';

// English and French interface (roadmap Section 8). Record content stays in its own language.
const fr: Record<string, string> = {
  'Discover': 'Découvrir', 'Centres': 'Centres', 'Browse': 'Parcourir', 'Knowledge graph': 'Graphe de connaissances', 'Notebook': 'Carnet', 'Agents': 'Agents', 'About': 'À propos',
  'Dark': 'Sombre', 'Light': 'Clair', 'Switch to dark mode': 'Passer en mode sombre', 'Switch to light mode': 'Passer en mode clair', 'Skip to content': 'Aller au contenu',
  'The scholarly archive of the AIMS network': 'L’archive scientifique du réseau AIMS',
  'Search theses, authors, concepts and Centres…': 'Rechercher thèses, auteurs, concepts et centres…',
  'Search': 'Rechercher', 'Working…': 'En cours…', 'theses': 'thèses', 'thesis': 'thèse', 'concepts': 'concepts', 'authors': 'auteurs', 'All Centres': 'Tous les centres', 'Centre': 'Centre', 'Year': 'Année', 'Concept': 'Concept',
  'All years': 'Toutes les années', 'All concepts': 'Tous les concepts', 'Refine': 'Affiner', 'Clear filters': 'Effacer les filtres', 'Sort': 'Trier', 'Relevance': 'Pertinence', 'Newest first': 'Plus récentes', 'Oldest first': 'Plus anciennes', 'Title': 'Titre',
  'Loading the archive…': 'Chargement de l’archive…', 'No theses found': 'Aucune thèse trouvée', 'Try another topic or clear your filters.': 'Essayez un autre sujet ou effacez les filtres.', 'Retry': 'Réessayer',
  'Add to notebook': 'Ajouter au carnet', 'In notebook': 'Dans le carnet', 'Author not recorded': 'Auteur non renseigné', 'Year not recorded': 'Année non renseignée', 'Centre not recorded': 'Centre non renseigné', 'No abstract recorded.': 'Aucun résumé enregistré.',
  'AIMS Centres': 'Centres AIMS', 'Programme communities': 'Communautés de programme', 'Founded': 'Fondé', 'Research and innovation': 'Recherche et innovation', 'Teaching Centre': 'Centre de formation',
  'Explore in the graph': 'Explorer dans le graphe', 'Add all to notebook': 'Tout ajouter au carnet', 'Top concepts': 'Concepts principaux', 'No items mapped yet.': 'Aucun élément associé pour l’instant.',
  'By Centre': 'Par centre', 'By issue date': 'Par date', 'Authors': 'Auteurs', 'Titles': 'Titres', 'Subjects': 'Sujets',
  'Abstract': 'Résumé', 'Concepts': 'Concepts', 'Ask this thesis': 'Interroger cette thèse', 'Related theses': 'Thèses liées', 'Metadata': 'Métadonnées', 'Suggested citation (APA 7)': 'Citation suggérée (APA 7)', 'Export citation': 'Exporter la citation', 'Copy': 'Copier', 'Copied.': 'Copié.', 'Full text': 'Texte intégral',
  'Sources': 'Sources', 'Notes': 'Notes', 'Studio': 'Studio', 'Ask your sources': 'Interrogez vos sources', 'Save to notes': 'Enregistrer dans les notes', 'Remove': 'Retirer',
  'Connect an agent': 'Connecter un agent', 'Page not found': 'Page introuvable', 'Return to the archive': 'Retour à l’archive',
};
export type Lang = 'en' | 'fr';
export const Language = createContext<Lang>('en');
export function translate(lang: Lang, text: string) { return lang === 'fr' ? fr[text] ?? text : text; }
export function useT() { const lang = useContext(Language); return (text: string) => translate(lang, text); }
export function useLang() { return useContext(Language); }

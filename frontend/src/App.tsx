import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Archive from './components/Archive';
import ThesisView from './components/ThesisView';
import Oracle from './components/Oracle';
import DreamFeed from './components/DreamFeed';
import About from './components/About';
import Centres, { CentrePage } from './components/Centres';
import Browse from './components/Browse';
import Notebook from './components/Notebook';
import Connect from './components/Connect';
import Curate from './components/Curate';
import Curation from './components/Curation';
import SignIn from './components/SignIn';
import Admin from './components/Admin';
import { Link, Navigation, changeRoute, currentRoute, routeHref } from './router';
import { archiveConnected } from './api';
import { Language, translate, type Lang } from './i18n';
import { useNotebook } from './notebook';

const KnowledgeGraph = lazy(() => import('./components/KnowledgeGraph'));
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="alert" className="empty"><h1>This view could not load</h1><p>Reload the page to try again.</p><a href={routeHref('/')}>Return to the archive</a></div> : this.props.children; }
}
const NAV = [['/', 'Discover'], ['/centres', 'Centres'], ['/browse', 'Browse'], ['/graph', 'Knowledge graph'], ['/notebook', 'Notebook'], ['/connect', 'Agents']] as const;
function storedLang(): Lang { try { return localStorage.getItem('sankofa.lang.v1') === 'fr' ? 'fr' : 'en'; } catch { return 'en'; } }

export default function App() {
  const [url, setUrl] = useState(currentRoute);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [lang, setLang] = useState<Lang>(storedLang);
  const sources = useNotebook().sources.length;
  const main = useRef<HTMLElement>(null);
  const t = (text: string) => translate(lang, text);
  const navigate = useCallback((href: string) => { changeRoute(href); setUrl(currentRoute()); }, []);
  useEffect(() => { const pop = () => setUrl(currentRoute()); window.addEventListener('popstate', pop); window.addEventListener('hashchange', pop); return () => { window.removeEventListener('popstate', pop); window.removeEventListener('hashchange', pop); }; }, []);
  const path = url.split('?')[0]; const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const section = NAV.find(([href]) => href !== '/' && path.startsWith(href))?.[0] || (path === '/' || path.startsWith('/thesis/') ? '/' : '');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  // Saved only on an explicit choice, so the system setting applies until then.
  const toggleTheme = () => setTheme(v => { const next = v === 'light' ? 'dark' : 'light'; try { localStorage.setItem('sankofa.theme.v1', next); } catch {} return next; });
  useEffect(() => { document.documentElement.lang = lang; try { localStorage.setItem('sankofa.lang.v1', lang); } catch {} }, [lang]);
  useEffect(() => { const label = NAV.find(([href]) => href === section)?.[1]; document.title = `Sankofa | ${path.startsWith('/thesis/') ? 'Thesis' : label && path !== '/' ? translate(lang, label) : path === '/' ? 'AIMS scholarly archive' : path.slice(1).replace(/^./, s => s.toUpperCase())}`; main.current?.focus(); window.scrollTo(0, 0); }, [path, section, lang]);
  useEffect(() => {
    let pendingG = 0;
    function key(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const editing = event.target instanceof HTMLElement && !!event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') {
        pendingG = 0;
        const input = document.getElementById('primary-search') as HTMLInputElement | null;
        if (input) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); const p = new URLSearchParams(currentRoute().split('?')[1] || ''); if (path === '/' && p.has('q')) { p.delete('q'); navigate(`/${p.size ? `?${p}` : ''}`); } }
        return;
      }
      if (editing) { pendingG = 0; return; }
      if (event.key === '/') { event.preventDefault(); const input = document.getElementById('primary-search'); if (input) input.focus(); else { navigate('/'); requestAnimationFrame(() => document.getElementById('primary-search')?.focus()); } return; }
      const target = { h: '/', g: '/graph', n: '/notebook', c: '/centres', b: '/browse' }[event.key];
      if (pendingG && Date.now() - pendingG < 1000 && target) { event.preventDefault(); navigate(target); pendingG = 0; return; }
      pendingG = event.key === 'g' ? Date.now() : 0;
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [navigate, path]);
  let content: ReactNode; let wide = false;
  if (path === '/') content = <Archive search={search} navigate={navigate} />;
  else if (/^\/thesis\/.+\/curate$/.test(path)) { let id = ''; try { id = decodeURIComponent(path.slice(8, -7)); } catch {} content = id ? <Curate key={id} id={id} /> : <p>Invalid thesis ID.</p>; }
  else if (path === '/curation') content = <Curation />;
  else if (path.startsWith('/thesis/')) { let id = ''; try { id = decodeURIComponent(path.slice(8)); } catch {} content = id ? <ThesisView key={id} id={id} /> : <p>Invalid thesis ID.</p>; }
  else if (path === '/centres') content = <Centres />;
  else if (path.startsWith('/centres/')) content = <CentrePage slug={path.slice(9)} />;
  else if (path === '/browse') content = <Browse search={search} navigate={navigate} />;
  else if (path === '/notebook') { content = <Notebook />; wide = true; }
  else if (path === '/connect') content = <Connect />;
  else if (path === '/login') content = <SignIn navigate={navigate} />;
  else if (path === '/admin') content = <Admin navigate={navigate} />;
  else if (path === '/oracle') content = <Oracle />;
  else if (path === '/dreams') content = <DreamFeed />;
  else if (path === '/about') content = <About />;
  else if (path === '/graph') { content = <Suspense fallback={<p role="status">Loading the knowledge graph…</p>}><KnowledgeGraph search={search} navigate={navigate} /></Suspense>; wide = true; }
  else content = <div className="empty"><h1>{t('Page not found')}</h1><Link href="/">{t('Return to the archive')}</Link></div>;
  return <Language.Provider value={lang}><Navigation value={navigate}>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus(); main.current?.scrollIntoView(); }}>{t('Skip to content')}</a>
    <header className="site-header"><div className="header-inner">
      <Link href="/" className="wordmark" aria-label="Sankofa home"><span className="mark" aria-hidden="true">◈</span>Sankofa</Link>
      <nav aria-label="Main navigation">{NAV.map(([href, label]) => <Link key={href} href={href} aria-current={section === href ? 'page' : undefined}>{t(label)}{href === '/notebook' && sources > 0 && <span className="count-badge" aria-label={`${sources} sources`}>{sources}</span>}</Link>)}</nav>
      <div className="header-tools">
        <Link href="/login">Sign in</Link><Link href="/admin">Admin</Link>
        <button className="ghost" onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')} aria-label={lang === 'en' ? 'Afficher en français' : 'Show in English'} lang={lang === 'en' ? 'fr' : 'en'}>{lang === 'en' ? 'FR' : 'EN'}</button>
        <button className="ghost theme-toggle" onClick={toggleTheme} aria-label={t(theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode')}>{theme === 'light' ? t('Dark') : t('Light')}</button>
      </div>
    </div></header>
    <main id="main" ref={main} tabIndex={-1} className={wide ? 'site-main wide' : 'site-main'}>{!archiveConnected && <div className="service-notice" role="status">The archive service is not connected. Theses, questions, and live connections will be available once the archive service is connected.</div>}<ErrorBoundary key={path}>{content}</ErrorBoundary></main>
    <footer className="site-footer"><div><strong>Sankofa</strong><span>{t('The scholarly archive of the AIMS network')}</span></div><div className="footer-links"><Link href="/about">{t('About')}</Link><Link href="/oracle">The Oracle</Link><Link href="/dreams">Dreams</Link><Link href="/connect">{t('Connect an agent')}</Link><Link href="/curation">Curation</Link></div></footer>
  </Navigation></Language.Provider>;
}

import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Archive from './components/Archive';
import ThesisView from './components/ThesisView';
import Oracle from './components/Oracle';
import DreamFeed from './components/DreamFeed';
import About from './components/About';
import { Link, Navigation, changeRoute, currentRoute, routeHref } from './router';
import { archiveConnected } from './api';

const Graph = lazy(() => import('./components/Graph'));
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div role="alert"><h1>This view could not load</h1><p>Reload the page to try again.</p><a href={routeHref('/')}>Return to the archive</a></div> : this.props.children; }
}
export default function App() {
  const [url, setUrl] = useState(currentRoute);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const main = useRef<HTMLElement>(null);
  const navigate = useCallback((href: string) => { changeRoute(href); setUrl(currentRoute()); }, []);
  useEffect(() => { const pop = () => setUrl(currentRoute()); window.addEventListener('popstate', pop); window.addEventListener('hashchange', pop); return () => { window.removeEventListener('popstate', pop); window.removeEventListener('hashchange', pop); }; }, []);
  const path = url.split('?')[0]; const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('sankofa.theme.v1', theme); } catch {} }, [theme]);
  useEffect(() => { document.title = `Sankofa | ${path === '/' ? 'AIMS thesis archive' : path.startsWith('/thesis/') ? 'Thesis' : path.slice(1).replace(/^./, s => s.toUpperCase())}`; main.current?.focus(); window.scrollTo(0, 0); }, [path]);
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
      if (pendingG && Date.now() - pendingG < 1000 && (event.key === 'h' || event.key === 'g')) { event.preventDefault(); navigate(event.key === 'h' ? '/' : '/graph'); pendingG = 0; return; }
      pendingG = event.key === 'g' ? Date.now() : 0;
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [navigate, path]);
  let content: ReactNode;
  if (path === '/') content = <Archive search={search} navigate={navigate} />;
  else if (path.startsWith('/thesis/')) { let id = ''; try { id = decodeURIComponent(path.slice(8)); } catch {} content = id ? <ThesisView key={id} id={id} /> : <p>Invalid thesis ID.</p>; }
  else if (path === '/oracle') content = <Oracle />;
  else if (path === '/dreams') content = <DreamFeed />;
  else if (path === '/about') content = <About />;
  else if (path === '/graph') content = <Suspense fallback={<p role="status">Loading graph view…</p>}><Graph search={search} /></Suspense>;
  else content = <div className="empty"><h1>Page not found</h1><Link href="/">Return to the archive</Link></div>;
  return <Navigation value={navigate}>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); main.current?.focus(); main.current?.scrollIntoView(); }}>Skip to content</a>
    <header className="site-header"><div className="header-inner"><Link href="/" className="wordmark">Sankofa</Link><nav aria-label="Main navigation"><Link href="/" aria-current={path === '/' || path.startsWith('/thesis/') ? 'page' : undefined}>Archive</Link><Link href="/graph" aria-current={path === '/graph' ? 'page' : undefined}>Graph</Link><Link href="/about" aria-current={path === '/about' ? 'page' : undefined}>About</Link></nav><button className="theme-toggle" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</button></div></header>
    <main id="main" ref={main} tabIndex={-1} className={path === '/graph' ? 'site-main graph-main' : 'site-main'}>{!archiveConnected && <div className="service-notice" role="status">The archive service is not connected. Theses, questions, and live connections will be available once the archive service is connected.</div>}<ErrorBoundary key={path}>{content}</ErrorBoundary></main>
    <footer className="site-footer"><span>Sankofa · AIMS thesis archive</span><div><Link href="/oracle">The Oracle</Link><Link href="/dreams">Dreams</Link><Link href="/about">Ethics & keyboard guide</Link></div></footer>
  </Navigation>;
}

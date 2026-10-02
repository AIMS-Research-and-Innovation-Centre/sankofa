import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

export const Navigation = createContext<(href: string) => void>(() => {});
export const hashRouting = import.meta.env.VITE_PAGES === 'true';
export function currentRoute() { return hashRouting ? (location.hash.startsWith('#/') ? location.hash.slice(1) : '/') : location.pathname + location.search; }
export function routeHref(path: string) { return hashRouting ? `${import.meta.env.BASE_URL}#${path}` : path; }
export function changeRoute(path: string) { if (currentRoute() !== path) history.pushState(null, '', routeHref(path)); }
export function Link({ href, children, ...props }: { href: string; children: ReactNode; ref?: React.Ref<HTMLAnchorElement> } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const navigate = useContext(Navigation);
  function click(event: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(event);
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(href);
    }
  }
  return <a {...props} href={routeHref(href)} onClick={click}>{children}</a>;
}

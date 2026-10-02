import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

export const Navigation = createContext<(href: string) => void>(() => {});
export function Link({ href, children, ...props }: { href: string; children: ReactNode; ref?: React.Ref<HTMLAnchorElement> } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const navigate = useContext(Navigation);
  function click(event: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(event);
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(href);
    }
  }
  return <a {...props} href={href} onClick={click}>{children}</a>;
}

import { PREVIEW_PARAM } from "@/lib/intro/preview-protocol";

/** Keep normal site navigation inside the draft preview, without changing external or download links. */
export function previewDestination(href: string, current: string): string | null {
  const from = new URL(current);
  if (!from.searchParams.has(PREVIEW_PARAM) || href.startsWith("#")) return null;
  const to = new URL(href, from);
  if (to.origin !== from.origin || !/^\/(?:work(?:\/[^/]+)?|process\/[^/]+|breakdowns)?\/?$/.test(to.pathname)) return null;
  to.searchParams.set(PREVIEW_PARAM, "");
  return to.pathname + to.search + to.hash;
}

/** Only links are intercepted. Cards, filters and dialog controls keep their own click handlers. */
export function bindPreviewNavigation(navigate: (href: string) => void) {
  const click = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target?.closest || target.closest("[data-ed-ui]")) return;
    if (document.documentElement.dataset.ddsDragged) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const destination = previewDestination(anchor.getAttribute("href") ?? "", window.location.href);
    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(destination);
  };
  document.addEventListener("click", click, true);
  return () => document.removeEventListener("click", click, true);
}

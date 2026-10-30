import { glideTo } from "./smooth-scroll";

/**
 * Go to a section of the home page (or its top, with no id): glide there and add it to the browser's history, so the
 * Back and Forward buttons step through the places you have been. Returns false when this is not the home page or there is no such section, so the caller can navigate normally.
 */
/**
 * While a press on the menu (or the side rail) is gliding the page to a section, the menu's highlight and the rail go straight
 * to that section and stay there, instead of lighting every section the glide passes on the way.
 */
export const glideLock = { id: "", until: 0 };
export const GLIDE_LOCK_MS = 1900;
export const glideLocked = () => !!glideLock.id && performance.now() < glideLock.until;

export function goToSection(id?: string): boolean {
  if (window.location.pathname !== "/") return false; // only the home page has these sections: the caller navigates there instead
  const el = id ? document.getElementById(id) : null;
  if (id && !el) return false;
  glideLock.id = id ?? "top";
  glideLock.until = performance.now() + GLIDE_LOCK_MS;
  const url = `/${window.location.search}${id ? `#${id}` : ""}`;
  if (window.location.pathname + window.location.search + window.location.hash !== url) window.history.pushState(window.history.state, "", url);
  glideTo(el ?? 0);
  return true;
}

/** True for a plain left click (not a new-tab, new-window or download click) that the site should handle itself. */
export function isPlainClick(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

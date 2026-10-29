import { glideTo } from "./smooth-scroll";

/**
 * Go to a section of the home page (or its top, with no id): glide there and add it to the browser's history, so the
 * Back and Forward buttons step through the places you have been. Returns false when this is not the home page or there is no such section, so the caller can navigate normally.
 */
export function goToSection(id?: string): boolean {
  if (window.location.pathname !== "/") return false; // only the home page has these sections: the caller navigates there instead
  const el = id ? document.getElementById(id) : null;
  if (id && !el) return false;
  const url = id ? `/#${id}` : "/";
  if (window.location.pathname + window.location.hash !== url) window.history.pushState(window.history.state, "", url);
  glideTo(el ?? 0);
  return true;
}

/** True for a plain left click (not a new-tab, new-window or download click) that the site should handle itself. */
export function isPlainClick(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

import type { SiteContent } from "@/lib/content/types";
import type { IntroSettings } from "./settings";

/** Query parameter that turns the home page into the portal's live preview. */
export const PREVIEW_PARAM = "portal-preview";

/** One playthrough of the intro inside the preview. */
export interface PreviewRun {
  /** Changes every time the intro should restart. */
  key: number;
  /** Seconds into the intro to start from. */
  at: number;
  /** Hold that single frame instead of playing on. */
  paused: boolean;
  /** Same seed → same star layout, so tweaking a setting doesn't reshuffle everything. */
  seed: number;
}

export type PortalToSite =
  | { source: "dds-portal"; type: "settings"; settings: IntroSettings }
  | { source: "dds-portal"; type: "content"; content: SiteContent }
  /** Open breakdown number `index` in the preview's viewer (null closes it). */
  | { source: "dds-portal"; type: "breakdown"; index: number | null }
  | { source: "dds-portal"; type: "run"; run: PreviewRun }
  /** Glide the preview to a section ("top" = the very top): its start, or its end (e.g. the Proof Table's final view). */
  | { source: "dds-portal"; type: "scroll"; to: string; at?: "start" | "end" }
  /** Turn the Edit buttons on the sections and items of the preview on or off. */
  | { source: "dds-portal"; type: "edit-mode"; on: boolean };

export type SiteToPortal =
  | { source: "dds-site"; type: "ready" }
  | { source: "dds-site"; type: "time"; t: number }
  /** An Edit button was pressed: on a whole section ("home:founder"), or on one item of a list ("projects.3"). */
  | { source: "dds-site"; type: "edit-open"; section: string }
  | { source: "dds-site"; type: "edit-open"; item: string }
  /** The "＋ Add" button under a list was pressed: add a new item to that list ("home.process.cards") and open it. */
  | { source: "dds-site"; type: "edit-add"; list: string }
  /** A handle moved a card within its own list. Positions refer to the full, unfiltered draft. */
  | { source: "dds-site"; type: "edit-reorder"; list: string; from: number; to: number }
  /** The preview moved to another page by itself (a card was pressed, a link followed): this is where it is now. */
  | { source: "dds-site"; type: "route"; path: string };

/** An address for a link inside the preview: it keeps the preview flag, so the page stays in the portal's preview mode. */
export function withPreview(href: string): string {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has(PREVIEW_PARAM)) return href;
  const [rest, hash] = href.split("#");
  return `${rest}${rest.includes("?") ? "&" : "?"}${PREVIEW_PARAM}${hash !== undefined ? `#${hash}` : ""}`;
}

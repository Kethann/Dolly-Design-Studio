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
  | { source: "dds-portal"; type: "run"; run: PreviewRun };

export type SiteToPortal = { source: "dds-site"; type: "ready" } | { source: "dds-site"; type: "time"; t: number };

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
  | { source: "dds-portal"; type: "scroll"; to: string; at?: "start" | "end" };

export type SiteToPortal = { source: "dds-site"; type: "ready" } | { source: "dds-site"; type: "time"; t: number };

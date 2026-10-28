"use client";

import { glideTo } from "@/lib/smooth-scroll";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { sanitizeIntroSettings, type IntroSettings } from "./settings";
import { PREVIEW_PARAM, type PortalToSite, type PreviewRun, type SiteToPortal } from "./preview-protocol";

interface IntroSettingsValue {
  settings: IntroSettings;
  /** True when the home page is running inside the portal's preview frame. */
  preview: boolean;
  /** The current preview playthrough (null until the portal asks for one). */
  run: PreviewRun | null;
}

const IntroSettingsContext = createContext<IntroSettingsValue | null>(null);

export function useIntroSettings(): IntroSettingsValue {
  const value = useContext(IntroSettingsContext);
  if (!value) throw new Error("useIntroSettings must be used inside <IntroSettingsProvider>");
  return value;
}

/** Sends a message to the portal hosting this preview. */
export function postToPortal(message: SiteToPortal) {
  if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
}

function readPreviewFlag() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
}

/**
 * Provides the saved intro settings to the site. Inside the portal's preview
 * frame it also accepts unsaved settings and replay commands from the portal.
 * A standalone `/?portal-preview&at=4.5&paused` link holds a single frame.
 */
export function IntroSettingsProvider({ initial, children }: { initial: IntroSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const [preview] = useState(readPreviewFlag);
  const [run, setRun] = useState<PreviewRun | null>(null);

  useEffect(() => {
    if (!preview) return;
    const params = new URLSearchParams(window.location.search);
    if (window.parent === window) {
      // Opened directly: play (or hold) from the query string.
      const at = Number(params.get("at"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the preview URL
      setRun({ key: 1, at: Number.isFinite(at) ? at : 0, paused: params.has("paused"), seed: 1 });
      return;
    }
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const msg = e.data as PortalToSite;
      if (!msg || msg.source !== "dds-portal") return;
      if (msg.type === "settings") setSettings(sanitizeIntroSettings(msg.settings));
      if (msg.type === "run") setRun(msg.run);
      if (msg.type === "breakdown") window.dispatchEvent(new CustomEvent("dds-breakdown", { detail: msg.index }));
      if (msg.type === "scroll") {
        const { to, at } = msg;
        const glide = () => {
          const el = to === "top" ? null : document.getElementById(to);
          if (to === "top") glideTo(0);
          else if (el) {
            const r = el.getBoundingClientRect();
            glideTo(at === "end" ? r.bottom + window.scrollY - window.innerHeight : r.top + window.scrollY);
          }
        };
        // While the intro is finishing it holds the page still; glide as soon as it lets go (give up after 4s).
        const started = performance.now();
        const whenFree = () => {
          if (document.documentElement.style.overflow !== "hidden" || performance.now() - started > 4000) glide();
          else requestAnimationFrame(whenFree);
        };
        whenFree();
      }
    }
    window.addEventListener("message", onMessage);
    postToPortal({ source: "dds-site", type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [preview]);

  // Keep the page background in step with unsaved preview changes.
  useEffect(() => {
    document.documentElement.style.setProperty("--stage", settings.background);
  }, [settings.background]);

  return <IntroSettingsContext.Provider value={{ settings, preview, run }}>{children}</IntroSettingsContext.Provider>;
}

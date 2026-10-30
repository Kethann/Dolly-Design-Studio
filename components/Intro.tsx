"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { postToPortal, useIntroSettings } from "@/lib/intro/settings-context";
import { settleHandoff } from "@/lib/intro/handoff";
import type { PreviewRun } from "@/lib/intro/preview-protocol";
import { IntroFirstLight } from "./IntroFirstLight";
import { introProgress, reportIntroProgress } from "@/lib/intro/loading";

// three.js only loads for visitors who actually get the 3D intro…
const loadStarIntro = () =>
  import("./intro/StarIntro").then((m) => {
    reportIntroProgress(0.6); // the code has arrived (the loader shows real steps, not a guess)
    return m.StarIntro;
  });
const StarIntro = dynamic(loadStarIntro, { ssr: false });

// …and for them, start downloading it the moment this module runs, in parallel with hydration.
if (
  typeof window !== "undefined" &&
  window.location.pathname === "/" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  (!window.matchMedia("(pointer: coarse)").matches || canRun3D()) // a weak phone never downloads what it will not run
) {
  void loadStarIntro();
}

/**
 * How long the visitor waits on the loader for the show to get on screen (its code, scene and shaders). If it is not
 * playing by then the page is revealed instead, and whatever is still loading carries on quietly in the background.
 */
const LOAD_FAILSAFE_MS = 5000;
/** Hard stop for the whole intro, in case a show that did start then hangs (the show itself is ~8s). */
const FAILSAFE_MS = 14000;

/**
 * Whether this device can run the 3D star intro smoothly. Phones and tablets get it too (the same intro as a desktop),
 * as long as they have WebGL 2, at least 4 processor cores and (where the browser says) 4 GB of memory, and the visitor
 * has not asked to save data. Weaker devices get the light version, so nothing stutters.
 */
function canRun3D(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return false;
  if ((nav.hardwareConcurrency || 4) < 4) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe context straight away
    return !!gl;
  } catch {
    return false;
  }
}

/** If anything inside the intro throws, reveal the page instead of leaving it blank. */
class IntroErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[intro] failed, showing the page instead", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Mode = "deciding" | "stars" | "fallback" | "done";

const reportTime = (t: number) => postToPortal({ source: "dds-site", type: "time", t });
const noop = () => {};

/**
 * Plays the intro on every full load of the home page (not on deep links or
 * in-site navigation): the 3D star intro wherever the device can run it (desktops, and
 * capable phones and tablets), the lightweight rolling-star version elsewhere (reduced motion, no WebGL, weak devices).
 * The creator can switch it off from the portal.
 *
 * Inside the portal's preview frame it waits for the portal, then replays
 * (or holds a single frame) whenever the portal asks.
 *
 * `onReveal` fires when the real page should start fading in; the intro then
 * unmounts once its own fade-out has finished.
 */
export function Intro({ onReveal }: { onReveal: () => void }) {
  const { settings, preview, run } = useIntroSettings();
  const [mode, setMode] = useState<Mode>("deciding");
  const [shown, setShown] = useState<PreviewRun[]>([]);

  /** Show the page without (or after) the 3D intro; the hero's star field then lays out its own stars. */
  function skip() {
    reportIntroProgress(1); // whatever happens, the loader never stays up
    // Remember that the intro has played, only once it really finished (not on the first, discarded dev-mode check).
    if (!preview && window.location.pathname === "/") {
      try {
        sessionStorage.setItem("dolly-intro-seen", "1");
      } catch {}
    }
    settleHandoff();
    onReveal();
    setMode("done");
    setShown([]);
  }

  useEffect(() => {
    // A link to a section (/#contact) goes straight there: no intro in the way.
    const deepLink = !preview && window.location.hash.length > 1;
    if (window.location.pathname !== "/" || deepLink || (!preview && !settings.enabled)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client check gating which intro mounts
      skip();
      return;
    }
    if (preview) {
      reportIntroProgress(1); // the portal decides when to play: no loader in its preview
      return;
    }
    // Every fresh load of the home page plays the opening (a reload, a typed address, a new visit). Moving around inside the site
    // never replays it: this component is only set up once per load.
    // Read media queries directly: child effects run before MotionProvider's,
    // so the context values aren't populated yet at this point.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    // Desktops with WebGL, and phones and tablets that can run it smoothly, all get the same 3D intro.
    const next = !reducedMotion && supportsWebGL() && (!isTouch || canRun3D()) ? "stars" : "fallback";
    if (next === "fallback") reportIntroProgress(1); // the light version needs no loading
    setMode(next);
    // Decide once on mount; onReveal is a stable setter from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preview: every new run from the portal restarts the intro.
  useEffect(() => {
    if (!preview || !run) return;
    if (!settings.enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- driven by the portal's messages
      skip();
      return;
    }
    setMode(supportsWebGL() ? "stars" : "fallback");
    // (Effects can run twice in development: never add the same run twice.)
    setShown((runs) => (runs.some((r) => r.key === run.key) ? runs : [...runs, run]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Safety nets: whatever happens (slow chunk load, GPU trouble), the page appears: after 5s if the show has not started, and after 14s at the latest. Not for held preview frames.
  useEffect(() => {
    if ((mode !== "stars" && mode !== "fallback") || run?.paused) return;
    const slowLoad = setTimeout(() => {
      if (introProgress() < 1) skip(); // still loading after 5s: show the page now
    }, LOAD_FAILSAFE_MS);
    const hardStop = setTimeout(skip, FAILSAFE_MS);
    return () => {
      clearTimeout(slowLoad);
      clearTimeout(hardStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, run]);

  // Preview: the run being replaced stays on screen underneath until the new one has drawn, so nothing flickers.
  if (mode === "stars" && preview && run) {
    const latest = run.key;
    return (
      <>
        {shown.map((r) => (
          <IntroErrorBoundary key={r.key} onError={r.key === latest ? skip : noop}>
            <StarIntro
              onReveal={r.key === latest ? onReveal : noop}
              onDone={r.key === latest ? skip : noop}
              startAt={r.at}
              paused={r.paused}
              seed={r.seed}
              onTime={r.key === latest ? reportTime : undefined}
              onFirstFrame={() => setShown((runs) => runs.filter((x) => x.key >= r.key))}
            />
          </IntroErrorBoundary>
        ))}
      </>
    );
  }
  if (mode === "stars")
    return (
      <IntroErrorBoundary key={run?.key} onError={skip}>
        <StarIntro
          key={run?.key}
          onReveal={onReveal}
          onDone={skip}
          startAt={run?.at}
          paused={run?.paused}
          seed={run?.seed}
          onTime={preview ? reportTime : undefined}
        />
      </IntroErrorBoundary>
    );
  if (mode === "fallback")
    return (
      <IntroErrorBoundary onError={skip}>
        <IntroFirstLight onDone={skip} />
      </IntroErrorBoundary>
    );
  return null;
}

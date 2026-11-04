"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { postToPortal, useIntroSettings } from "@/lib/intro/settings-context";
import { settleHandoff } from "@/lib/intro/handoff";
import type { PreviewRun } from "@/lib/intro/preview-protocol";
import { IntroFirstLight } from "./IntroFirstLight";
import { introProgress, reportIntroProgress } from "@/lib/intro/loading";
import { visibleTimeout } from "@/lib/intro/visible-timeout";

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
  window.location.hash.length <= 1 &&
  !document.documentElement.hasAttribute("data-resume") &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  canRun3D() // cheap eligibility check; do not create a GPU context during hydration
) {
  void loadStarIntro().catch(() => {}); // the mounted dynamic component/error boundary handles load failure
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
  return true; // WebGL is checked once below, not repeatedly for touch-device preloading.
}

let webGLSupport: boolean | undefined;
function supportsWebGL(): boolean {
  if (webGLSupport !== undefined) return webGLSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2"); // the installed Three.js renderer requires WebGL 2
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // release the probe context straight away
    return (webGLSupport = !!gl);
  } catch {
    return (webGLSupport = false);
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
  const [exiting, setExiting] = useState(false);

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
    // Reloaded to bring in a new version (see UpdateWatcher): the visitor goes back to their place, not to the opening.
    const resuming = !preview && document.documentElement.hasAttribute("data-resume");
    if (window.location.pathname !== "/" || deepLink || resuming || (!preview && !settings.enabled)) {
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
    // Apply the same hardware/data-saver checks to laptops, phones and tablets.
    const next = !reducedMotion && canRun3D() && supportsWebGL() ? "stars" : "fallback";
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
    setExiting(false);
    // (Effects can run twice in development: never add the same run twice.)
    setShown((runs) => (runs.some((r) => r.key === run.key) ? runs : [...runs, run]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Safety nets: whatever happens (slow chunk load, GPU trouble), the page appears: after 5s if the show has not started, and after 14s at the latest. Not for held preview frames.
  useEffect(() => {
    if ((mode !== "stars" && mode !== "fallback") || run?.paused) return;
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const endGracefully = () => {
      if (exitTimer !== undefined) return;
      setExiting(true);
      if (introProgress() < 1) settleHandoff();
      reportIntroProgress(1);
      onReveal();
      // A mounted scene fades its current frame. If the chunk never arrived,
      // the persistent curtain still fades into the page, with no late intro.
      exitTimer = setTimeout(skip, 800);
    };
    const slowLoad = visibleTimeout(() => {
      if (introProgress() < 1) endGracefully();
    }, LOAD_FAILSAFE_MS);
    const hardStop = visibleTimeout(endGracefully, FAILSAFE_MS);
    return () => {
      slowLoad();
      hardStop();
      clearTimeout(exitTimer);
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
              exitRequested={exiting && r.key === latest}
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
          exitRequested={exiting}
          seed={run?.seed}
          onTime={preview ? reportTime : undefined}
        />
      </IntroErrorBoundary>
    );
  if (mode === "fallback")
    return (
      <IntroErrorBoundary onError={skip}>
        <IntroFirstLight onReveal={() => { settleHandoff(); onReveal(); }} onDone={skip} exitRequested={exiting} />
      </IntroErrorBoundary>
    );
  return null;
}

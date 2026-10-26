"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { postToPortal, useIntroSettings } from "@/lib/intro/settings-context";
import { settleHandoff } from "@/lib/intro/handoff";
import { IntroFirstLight } from "./IntroFirstLight";

// three.js only loads for visitors who actually get the 3D intro…
const loadStarIntro = () => import("./intro/StarIntro").then((m) => m.StarIntro);
const StarIntro = dynamic(loadStarIntro, { ssr: false });

// …and for them, start downloading it the moment this module runs, in parallel with hydration.
if (typeof window !== "undefined" && window.location.pathname === "/" && !window.matchMedia("(pointer: coarse)").matches) {
  void loadStarIntro();
}

/** Longest the intro may hold the page before we reveal it regardless (the show itself is ~8s). */
const FAILSAFE_MS = 16000;

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

/**
 * Plays the intro on every full load of the home page (not on deep links or
 * in-site navigation): the 3D star intro on capable non-touch desktops, the
 * lightweight rolling-star version elsewhere (touch, reduced motion, no WebGL).
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

  /** Show the page without (or after) the 3D intro; the hero's star field then lays out its own stars. */
  function skip() {
    settleHandoff();
    onReveal();
    setMode("done");
  }

  useEffect(() => {
    if (window.location.pathname !== "/" || (!preview && !settings.enabled)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client check gating which intro mounts
      skip();
      return;
    }
    if (preview) return; // the portal decides when to play
    // Read media queries directly: child effects run before MotionProvider's,
    // so the context values aren't populated yet at this point.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    setMode(!reducedMotion && !isTouch && supportsWebGL() ? "stars" : "fallback");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Safety net: whatever happens (slow chunk load, GPU trouble), the page appears. Not for held preview frames.
  useEffect(() => {
    if ((mode !== "stars" && mode !== "fallback") || run?.paused) return;
    const timer = setTimeout(skip, FAILSAFE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, run]);

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

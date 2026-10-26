"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { IntroFirstLight } from "./IntroFirstLight";

// three.js only loads for visitors who actually get the 3D intro…
const loadStarIntro = () => import("./intro/StarIntro").then((m) => m.StarIntro);
const StarIntro = dynamic(loadStarIntro, { ssr: false });

// …and for them, start downloading it the moment this module runs, in parallel with hydration.
if (typeof window !== "undefined" && window.location.pathname === "/" && !window.matchMedia("(pointer: coarse)").matches) {
  void loadStarIntro();
}

/** Longest the intro may hold the page before we reveal it regardless (the show itself is ~10s). */
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

/**
 * Plays the intro on every full load of the home page (not on deep links or
 * in-site navigation): the 3D star intro on capable non-touch desktops, the
 * lightweight rolling-star version elsewhere (touch, reduced motion, no WebGL).
 *
 * `onReveal` fires when the real page should start fading in; the intro then
 * unmounts once its own fade-out has finished.
 */
export function Intro({ onReveal }: { onReveal: () => void }) {
  const [mode, setMode] = useState<Mode>("deciding");

  useEffect(() => {
    if (window.location.pathname !== "/") {
      onReveal();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client check gating which intro mounts
      setMode("done");
      return;
    }
    // Read media queries directly: child effects run before MotionProvider's,
    // so the context values aren't populated yet at this point.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    setMode(!reducedMotion && !isTouch && supportsWebGL() ? "stars" : "fallback");
    // Decide once on mount; onReveal is a stable setter from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net: whatever happens (slow chunk load, GPU trouble), the page appears.
  useEffect(() => {
    if (mode !== "stars" && mode !== "fallback") return;
    const timer = setTimeout(() => {
      onReveal();
      setMode("done");
    }, FAILSAFE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function bail() {
    onReveal();
    setMode("done");
  }

  if (mode === "stars")
    return (
      <IntroErrorBoundary onError={bail}>
        <StarIntro onReveal={onReveal} onDone={() => setMode("done")} />
      </IntroErrorBoundary>
    );
  if (mode === "fallback")
    return (
      <IntroErrorBoundary onError={bail}>
        <IntroFirstLight onDone={bail} />
      </IntroErrorBoundary>
    );
  return null;
}

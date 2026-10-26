"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface MotionState {
  /** The visitor has asked the OS to reduce motion. */
  reducedMotion: boolean;
  /** Primary pointer is coarse (phones, tablets). */
  isTouch: boolean;
}

const MotionContext = createContext<MotionState | null>(null);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Read on mount (not during render) so server and first-paint markup match
    // and hydration stays clean; these are one-time syncs with media queries.
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchQuery = window.matchMedia("(pointer: coarse)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(motionQuery.matches);
    setIsTouch(touchQuery.matches);

    const onMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    const onTouch = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    motionQuery.addEventListener("change", onMotion);
    touchQuery.addEventListener("change", onTouch);
    return () => {
      motionQuery.removeEventListener("change", onMotion);
      touchQuery.removeEventListener("change", onTouch);
    };
  }, []);

  const value = useMemo(() => ({ reducedMotion, isTouch }), [reducedMotion, isTouch]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error("useMotion must be used within MotionProvider");
  return ctx;
}

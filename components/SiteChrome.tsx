"use client";

import { useState } from "react";
import { MotionProvider } from "@/lib/motion";
import { SmoothScroll } from "@/lib/smooth-scroll";
import { PenCursor } from "@/components/cursor/PenCursor";
import { Intro } from "@/components/Intro";
import { Nav } from "@/components/Nav";
import { RightRail } from "@/components/RightRail";
import { ScrollProgress } from "@/components/ScrollProgress";

/**
 * Client-side shell: motion preferences, smooth scroll, the pen cursor, the
 * once-per-session intro, and the nav chrome that sits above every page.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const [introDone, setIntroDone] = useState(false);

  return (
    <MotionProvider>
      <SmoothScroll />
      <PenCursor />
      {/* Painted black from the very first frame so the page never flashes before the intro mounts. */}
      {!introDone && (
        <div className="intro-curtain" aria-hidden="true">
          <span className="intro-curtain-glint" />
        </div>
      )}
      <Intro onReveal={() => setIntroDone(true)} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollProgress />
      <Nav />
      <RightRail />
      <main id="main" className="site-main" data-revealed={introDone}>
        {children}
      </main>
    </MotionProvider>
  );
}

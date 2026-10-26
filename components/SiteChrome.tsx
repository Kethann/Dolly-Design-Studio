"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MotionProvider } from "@/lib/motion";
import { SmoothScroll } from "@/lib/smooth-scroll";
import { IntroSettingsProvider } from "@/lib/intro/settings-context";
import type { IntroSettings } from "@/lib/intro/settings";
import { PenCursor } from "@/components/cursor/PenCursor";
import { Intro } from "@/components/Intro";
import { Nav } from "@/components/Nav";
import { RightRail } from "@/components/RightRail";
import { ScrollProgress } from "@/components/ScrollProgress";

/**
 * Client-side shell: motion preferences, smooth scroll, the pen cursor, the
 * once-per-session intro, and the nav chrome that sits above every page.
 * The creator portal (/portal) gets none of it — just its own page.
 */
export function SiteChrome({
  introSettings,
  footer,
  children,
}: {
  introSettings: IntroSettings;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [introDone, setIntroDone] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/portal")) return <>{children}</>;

  return (
    <IntroSettingsProvider initial={introSettings}>
      <MotionProvider>
        <SmoothScroll />
        <PenCursor />
        {/* Painted in the background colour from the very first frame so the page never flashes before the intro mounts. */}
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
          {footer}
        </main>
      </MotionProvider>
    </IntroSettingsProvider>
  );
}

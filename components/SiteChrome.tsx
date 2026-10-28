"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MotionProvider } from "@/lib/motion";
import { SmoothScroll } from "@/lib/smooth-scroll";
import { IntroSettingsProvider } from "@/lib/intro/settings-context";
import type { IntroSettings } from "@/lib/intro/settings";
import { ContentProvider } from "@/lib/content/context";
import { pageKeyOf } from "@/lib/content/page-key";
import type { SiteContent } from "@/lib/content/types";
import { PenCursor } from "@/components/cursor/PenCursor";
import { Intro } from "@/components/Intro";
import { IntroLoader } from "@/components/IntroLoader";
import { Nav } from "@/components/Nav";
import { NavHistory } from "@/components/NavHistory";
import { RightRail } from "@/components/RightRail";
import { ScrollProgress } from "@/components/ScrollProgress";
import { Backdrop } from "@/components/Backdrop";
import { HoverGlow } from "@/components/HoverGlow";

/**
 * Client-side shell: motion preferences, smooth scroll, the pen cursor, the
 * once-per-session intro, and the nav chrome that sits above every page.
 * The creator portal (/portal) gets none of it — just its own page.
 */
export function SiteChrome({
  introSettings,
  content,
  footer,
  children,
}: {
  introSettings: IntroSettings;
  content: SiteContent;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [introDone, setIntroDone] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/portal")) return <>{children}</>;

  return (
    <IntroSettingsProvider initial={introSettings}>
      <ContentProvider initial={content}>
      <MotionProvider>
        <SmoothScroll />
        <NavHistory />
        <PenCursor />
        <HoverGlow />
        <Backdrop />
        {/* Painted in the background colour from the very first frame so the page never flashes before the intro mounts. */}
        {!introDone && <div className="intro-curtain" aria-hidden="true" />}
        <IntroLoader />
        <Intro onReveal={() => setIntroDone(true)} />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ScrollProgress />
        <Nav />
        {pathname !== "/breakdowns" && <RightRail />} {/* that page has its own numbers down the side */}
        <main id="main" className="site-main" data-revealed={introDone} data-page={pageKeyOf(pathname)}>
          {children}
          {footer}
        </main>
      </MotionProvider>
      </ContentProvider>
    </IntroSettingsProvider>
  );
}

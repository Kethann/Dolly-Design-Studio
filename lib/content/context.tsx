"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PREVIEW_PARAM, type PortalToSite } from "@/lib/intro/preview-protocol";
import { sanitizeContent } from "./sanitize";
import { contentCss } from "./css";
import type { SiteContent } from "./types";

const ContentContext = createContext<SiteContent | null>(null);

/** The site's editable content. Inside the portal's preview it follows unsaved edits live. */
export function useContent(): SiteContent {
  const value = useContext(ContentContext);
  if (!value) throw new Error("useContent must be used inside <ContentProvider>");
  return value;
}

export { tx } from "./tx";

export function ContentProvider({ initial, children }: { initial: SiteContent; children: ReactNode }) {
  const [content, setContent] = useState(initial);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(PREVIEW_PARAM) || window.parent === window) return;
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const msg = e.data as PortalToSite;
      if (msg?.source === "dds-portal" && msg.type === "content") setContent(sanitizeContent(msg.content));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const css = contentCss(content);
  return (
    <ContentContext.Provider value={content}>
      {css && <style id="dds-content-css" dangerouslySetInnerHTML={{ __html: css }} />}
      {children}
    </ContentContext.Provider>
  );
}

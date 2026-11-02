"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteContent } from "@/lib/content/types";
import { sanitizeContent } from "@/lib/content/sanitize";
import { sanitizeIntroSettings, type IntroSettings } from "@/lib/intro/settings";
import type { PortalUser } from "@/lib/portal/users";
import { PortalEditor } from "./PortalEditor";
import { PortalLogin } from "./PortalLogin";

type Session = { configured: boolean; setup: boolean; emailLogin: boolean; user: PortalUser | null };
type Boot = { kind: "loading" } | { kind: "login"; session: Session } |
  { kind: "editor"; user: PortalUser; content: SiteContent; settings: IntroSettings } |
  { kind: "error"; message: string };

async function documentAt<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("The published documents could not be loaded. Please retry; your saved content has not been changed.");
  return response.json() as Promise<T>;
}

export function PortalBoot() {
  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/session", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("The portal session could not be checked. Please retry.");
      const session = await response.json() as Session;
      if (!session.user) { setBoot({ kind: "login", session }); return; }
      const [content, settings] = await Promise.all([
        documentAt<SiteContent>("/api/public/content"),
        documentAt<IntroSettings>("/api/public/settings"),
      ]);
      setBoot({ kind: "editor", user: session.user, content: sanitizeContent(content), settings: sanitizeIntroSettings(settings) });
    } catch (error) {
      setBoot({ kind: "error", message: error instanceof Error ? error.message : "Could not open the portal." });
    }
  }, []);
  // Network responses, not the effect itself, update state after the first paint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (boot.kind === "editor") return <PortalEditor initial={boot.settings} initialContent={boot.content} user={boot.user} />;
  if (boot.kind === "login") return <PortalLogin configured={boot.session.configured} setup={boot.session.setup} emailLogin={boot.session.emailLogin} />;
  return <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 16, padding: 24, color: "#f3e7d8", background: "#1a111a" }}>
    <p role={boot.kind === "error" ? "alert" : "status"}>{boot.kind === "error" ? boot.message : "Opening creator portal…"}</p>
    {boot.kind === "error" && <button type="button" onClick={() => { setBoot({ kind: "loading" }); void load(); }} style={{ padding: "10px 16px", borderRadius: 8 }}>Retry</button>}
  </main>;
}

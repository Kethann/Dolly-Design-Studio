import type { Metadata } from "next";
import { hasPortalSession, isPortalConfigured } from "@/lib/portal/auth";
import { readIntroSettings } from "@/lib/portal/settings-store";
import { PortalEditor } from "./PortalEditor";
import { PortalLogin } from "./PortalLogin";

export const metadata: Metadata = {
  title: "Creator portal",
  robots: { index: false, follow: false },
};

export default async function PortalPage() {
  if (!isPortalConfigured()) return <PortalLogin configured={false} />;
  if (!(await hasPortalSession())) return <PortalLogin configured />;
  return <PortalEditor initial={await readIntroSettings()} />;
}

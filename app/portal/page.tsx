import type { Metadata } from "next";
import { getPortalUser, isPortalConfigured } from "@/lib/portal/auth";
import { readIntroSettings } from "@/lib/portal/settings-store";
import { hasAccounts } from "@/lib/portal/users";
import { PortalEditor } from "./PortalEditor";
import { PortalLogin } from "./PortalLogin";

export const metadata: Metadata = {
  title: "Creator portal",
  robots: { index: false, follow: false },
};

// Always per request: it depends on the sign-in cookie and on PORTAL_PASSWORD at runtime, not at build time.
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  if (!(await isPortalConfigured())) return <PortalLogin configured={false} />;
  const user = await getPortalUser();
  if (!user) return <PortalLogin configured setup={!(await hasAccounts())} />;
  return <PortalEditor initial={await readIntroSettings()} user={user} />;
}

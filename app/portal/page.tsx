import type { Metadata } from "next";
import { PortalBoot } from "./PortalBoot";

export const metadata: Metadata = {
  title: "Creator portal",
  robots: { index: false, follow: false },
};

// Built once; authentication and editable documents load in the browser.
export default function PortalPage() {
  return <PortalBoot />;
}

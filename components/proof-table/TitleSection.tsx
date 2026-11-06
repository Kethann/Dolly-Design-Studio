"use client";

import dynamic from "next/dynamic";
import { useIntroSettings } from "@/lib/intro/settings-context";

const SlateProofTable = dynamic(() => import("./SlateProofTable").then((module) => module.SlateProofTable));
const ProofTable = dynamic(() => import("./ProofTable").then((module) => module.ProofTable));

/** The titles section comes in two versions, chosen in the portal: 1, cards falling onto the glass slate; 2, the glass disc. */
export function TitleSection() {
  const { settings } = useIntroSettings();
  return settings.proofTable.version === 1 ? <SlateProofTable /> : <ProofTable />;
}

"use client";

import { useIntroSettings } from "@/lib/intro/settings-context";
import { SlateProofTable } from "./SlateProofTable";
import { ProofTable } from "./ProofTable";

/** The titles section comes in two versions, chosen in the portal: 1, cards falling onto the glass slate; 2, the glass disc. */
export function TitleSection() {
  const { settings } = useIntroSettings();
  return settings.proofTable.version === 1 ? <SlateProofTable /> : <ProofTable />;
}

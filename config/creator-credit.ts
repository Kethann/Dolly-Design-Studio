/**
 * Code-only website credit. Deliberately NOT part of SiteContent, portal settings or uploaded media.
 * Change here (then rebuild/deploy) to use text, a personal logo, or both.
 * Put your own logo under public/images/brand/creator/; the portal cannot upload, replace or delete it.
 * No personal logo has been supplied yet, so the default is the name only.
 */
export interface CreatorCreditConfig {
  readonly name: string;
  readonly mode: "text" | "logo" | "both";
  readonly logo: { readonly src: string; readonly width: number; readonly height: number };
}

export const creatorCredit: CreatorCreditConfig = {
  name: "Kethan",
  mode: "text",
  logo: { src: "", width: 120, height: 40 },
};

/** Only code-managed brand assets are eligible: never a replaceable portal upload or remote tracker. */
export function creditLogoSource(src: string): string {
  return /^\/images\/brand\/creator\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:svg|png|jpe?g|webp|avif)$/i.test(src) ? src : "";
}

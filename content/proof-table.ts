// ─────────────────────────────────────────────────────────────────────────────
// THE PROOF TABLE — the scroll section (between "Our clients" and "Contact")
// where a crumpled test print is smoothed onto a lightbox and the title designs
// drop onto it as glass-mounted proofs.
//
// To add or replace a title:
//   1. Put a transparent PNG/WebP of the title in  public/images/proof-table/
//      (about 2000px wide is plenty; trim the empty space around it).
//   2. Add a line to `items` below. `slug` is the project page it opens.
// 6–12 items work best; the layout adapts to the count. Phones show the first 6.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProofItem {
  /** Path inside /public. */
  src: string;
  /** "title-png" sits on smoky glass so the lettering glows; "poster" sits flush. */
  type: "title-png" | "poster";
  film: string;
  year: number;
  /** Small tag on the plate's corner, e.g. "TITLE" or "KEY ART". */
  tag: string;
  /** Project page opened on click (/work/<slug>). */
  slug: string;
  /** Read out by screen readers. */
  alt: string;
  /** Optional glass colour for this card (otherwise the portal's glass colour). */
  tint?: string;
}

export const proofTable = {
  id: "collaborations",
  overline: "Our projects slate",
  /** Two lines, shown in capitals. */
  headline: ["Titles that open the film", "before it starts."],
  body: "Every film we work on gets a title drawn for its story — proofed, printed and pinned to the light table until it carries the whole film in one word.",
  cta: { label: "View the work", href: "/work/title-designs" },
  /** Technical labels around the press sheet. */
  labels: { proof: "PROOF 01 — DOLLY", bleed: "BLEED 3MM", reg: "REG ✓" },

  items: [
    { src: "", type: "title-png", film: "Dacoit", year: 2026, tag: "Title", slug: "dacoit", alt: "Dacoit title design" },
    { src: "", type: "title-png", film: "Korean Kanakaraju", year: 2026, tag: "Title", slug: "korean-kanakaraju", alt: "Korean Kanakaraju English title design" },
    { src: "", type: "title-png", film: "Brindhavihari", year: 2026, tag: "Title", slug: "brindhavihari", alt: "Brindhavihari Kannada title design" },
    { src: "", type: "title-png", film: "Goodachari 2", year: 2027, tag: "Title", slug: "goodachari-2", alt: "Goodachari 2 title design" },
    { src: "", type: "title-png", film: "Romeo Juliet", year: 2026, tag: "Title", slug: "romeo-juliet", alt: "Romeo Juliet title design" },
    { src: "", type: "title-png", film: "Oka Manchi Prema Katha", year: 2024, tag: "Title", slug: "oka-manchi-prema-katha", alt: "Oka Manchi Prema Katha Telugu handwritten title" },
    { src: "", type: "title-png", film: "Isakapatnam", year: 2026, tag: "Title", slug: "title-designs", alt: "Isakapatnam title design" },
    { src: "", type: "title-png", film: "Inkosaari!", year: 2025, tag: "Title", slug: "independent-films", alt: "Inkosaari neon script title design" },
    { src: "", type: "title-png", film: "Korean Kanakaraju", year: 2026, tag: "Telugu title", slug: "korean-kanakaraju", alt: "Korean Kanakaraju Telugu title design" },
    { src: "", type: "title-png", film: "Naukari", year: 2026, tag: "Title", slug: "title-designs", alt: "Naukari brush-script title design" },
    { src: "", type: "title-png", film: "Inkosaari!", year: 2025, tag: "Telugu title", slug: "independent-films", alt: "Inkosaari Telugu neon title design" },
  ] satisfies ProofItem[],
};

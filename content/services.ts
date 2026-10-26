// ─────────────────────────────────────────────────────────────────────────────
// SERVICES — the numbered list in the "Services" section of the home page.
// `sample` is the poster that appears when someone hovers over the row.
// ─────────────────────────────────────────────────────────────────────────────

import type { Service } from "./types";

export const services: Service[] = [
  {
    number: "01",
    name: "Movie Posters",
    description: "Theatrical one-sheets, character posters and release-date art built to stop a scroll and fill a hoarding.",
    deliverables: ["Key art", "Character posters", "Release posters"],
    sample: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg",
  },
  {
    number: "02",
    name: "First-Look & Motion Posters",
    description: "The first reveal of your film — designed as a moment, with layered files ready for motion.",
    deliverables: ["First look", "Motion-ready layers", "Teasers"],
    sample: "/images/posters/goodachari-2/01-g2-poster.jpg",
  },
  {
    number: "03",
    name: "Title Logo Design",
    description: "Hand-built title logos in Telugu, Kannada, Hindi and English that carry the film’s voice in a single word.",
    deliverables: ["Multilingual titles", "Lock-ups", "Animated references"],
    sample: "/images/posters/korean-kanakaraju/02-korean-kanakaraju-poster.jpg",
  },
  {
    number: "04",
    name: "Typography & Logo Design",
    description: "Custom lettering, credit blocks and identity marks for productions, banners and brands.",
    deliverables: ["Custom type", "Billing blocks", "Production logos"],
    sample: "/images/posters/premante/01-premante-poster.jpg",
  },
  {
    number: "05",
    name: "Campaign & Social Kits",
    description: "Song launches, festival greetings, countdowns and OTT assets — one visual system across every format.",
    deliverables: ["Song posters", "Festival posts", "OTT & social sizes"],
    sample: "/images/posters/dacoit-song-campaign/01-rubaroo-song-poster.jpg",
  },
  {
    number: "06",
    name: "Re-release Artwork",
    description: "Fresh campaigns for classics returning to cinemas — honouring the original, made for today.",
    deliverables: ["Re-release key art", "Anniversary posters"],
    sample: "/images/posters/baahubali-the-epic/02-baahubali-the-epic-poster.jpg",
  },
];

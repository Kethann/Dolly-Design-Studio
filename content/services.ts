// ─────────────────────────────────────────────────────────────────────────────
// SERVICES — the numbered list in the "Services" section of the home page.
// `sample` is the poster that appears when someone hovers over the row.
// ─────────────────────────────────────────────────────────────────────────────

import type { Service } from "./types";

export const services: Service[] = [
  {
    number: "01",
    name: "Poster Designs",
    description: "Theatrical one-sheets, first-look and character posters, and release art built to stop a scroll and fill a hoarding.",
    deliverables: ["Key art", "First looks", "Character & release posters"],
    sample: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg",
  },
  {
    number: "02",
    name: "Title Designs",
    description: "Hand-built title logos in Telugu, Kannada, Hindi and English that carry the film’s voice in a single word.",
    deliverables: ["Multilingual titles", "Lock-ups", "Animated references"],
    sample: "/images/proof-table/korean-kanakaraju.webp",
  },
  {
    number: "03",
    name: "Typographies",
    description: "Custom lettering, credit blocks and billing typography, drawn to sit with the art and read at any size.",
    deliverables: ["Custom lettering", "Billing blocks", "Credit titles"],
    sample: "/images/proof-table/oka-manchi-prema-katha.webp",
  },
  {
    number: "04",
    name: "Logo Designs",
    description: "Identity marks for productions, banners and brands — simple, memorable and ready for every screen.",
    deliverables: ["Production logos", "Banner marks", "Brand identities"],
    sample: "/images/posters/premante/01-premante-poster.jpg",
  },
];

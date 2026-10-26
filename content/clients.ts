// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS — the names scrolling across the "Clients & Collaborations" section
// on the home page, plus optional testimonials.
// ─────────────────────────────────────────────────────────────────────────────

import type { Testimonial } from "./types";

/** Production houses the studio has worked with. */
export const clients: string[] = [
  "Annapurna Studios",
  "Arka Media Works",
  "People Media Factory",
  "UV Creations",
  "First Frame Entertainments",
  "S.S. Creations",
  "Abhishek Agarwal Arts",
  "Sree Venkateswara Cinemas",
  "KVC Production",
  "Navarasa Production",
  "Sthira Productions",
];

/** Filmmakers and actors the studio has collaborated with (shown after the clients). */
export const collaborators: string[] = [
  "Adivi Sesh",
  "Varun Tej",
  "Shaneil Deo",
  "Vinay Kumar Sirigineedi",
  "Koratala Siva",
  "Merlapaka Gandhi",
];

/**
 * [CLIENT TO PROVIDE] Real quotes only. The testimonial block stays hidden while this list is empty.
 * Example: { quote: "…", name: "Director name", role: "Director, Film title" }
 */
export const testimonials: Testimonial[] = [];

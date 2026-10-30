// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS — the names scrolling across the "Clients & Collaborations" section
// on the home page, plus optional testimonials.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClientEntry, CollaboratorEntry, Testimonial } from "./types";

/** Production houses the studio has worked with, logos first. */
export const clients: ClientEntry[] = [
  { name: "Annapurna Studios", logo: "" },
  { name: "Arka Media Works", logo: "" },
  { name: "Sree Venkateswara Cinemas", logo: "" },
  { name: "People Media Factory", logo: "" },
  { name: "First Frame Entertainments", logo: "" },
  { name: "UV Creations", logo: "" },
  { name: "Abhishek Agarwal Arts", logo: "" },
  { name: "KVC Production", logo: "" },
  { name: "Navarasa Production", logo: "" },
];

/** Filmmakers and actors the studio has collaborated with (shown after the clients). */
export const collaborators: CollaboratorEntry[] = [
  { name: "Adivi Sesh", photo: "" },
  { name: "Varun Tej", photo: "" },
  { name: "Shaneil Deo", photo: "" },
  { name: "Vinay Kumar Sirigineedi", photo: "" },
  { name: "Merlapaka Gandhi", photo: "" },
];

/**
 * [CLIENT TO PROVIDE] Real quotes only. The testimonial block stays hidden while this list is empty.
 * Example: { quote: "…", name: "Director name", role: "Director, Film title" }
 */
export const testimonials: Testimonial[] = [];

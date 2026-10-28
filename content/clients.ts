// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS — the names scrolling across the "Clients & Collaborations" section
// on the home page, plus optional testimonials.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClientEntry, CollaboratorEntry, Testimonial } from "./types";

/** Production houses the studio has worked with, logos first. */
export const clients: ClientEntry[] = [
  { name: "Annapurna Studios", logo: "/images/clients/annapurna-studios.webp" },
  { name: "Arka Media Works", logo: "/images/clients/arka-mediaworks.webp" },
  { name: "Sree Venkateswara Cinemas", logo: "/images/clients/sree-venkateswara-cinemas.webp" },
  { name: "People Media Factory", logo: "/images/clients/people-media-factory.webp" },
  { name: "First Frame Entertainments", logo: "/images/clients/first-frame-entertainments.webp" },
  { name: "UV Creations", logo: "/images/clients/uv-creations.webp" },
  { name: "S.S. Creations", logo: "" },
  { name: "Abhishek Agarwal Arts", logo: "" },
  { name: "KVC Production", logo: "" },
  { name: "Navarasa Production", logo: "" },
  { name: "Sthira Productions", logo: "" },
];

/** Filmmakers and actors the studio has collaborated with (shown after the clients). */
export const collaborators: CollaboratorEntry[] = [
  { name: "Adivi Sesh", photo: "/images/collaborators/adivi-sesh.webp" },
  { name: "Varun Tej", photo: "/images/collaborators/varun-tej.webp" },
  { name: "Shaneil Deo", photo: "/images/collaborators/shaneil-deo.webp" },
  { name: "Vinay Kumar Sirigineedi", photo: "/images/collaborators/vinay-kumar-sirigineedi.webp" },
  { name: "Merlapaka Gandhi", photo: "/images/collaborators/merlapaka-gandhi.webp" },
];

/**
 * [CLIENT TO PROVIDE] Real quotes only. The testimonial block stays hidden while this list is empty.
 * Example: { quote: "…", name: "Director name", role: "Director, Film title" }
 */
export const testimonials: Testimonial[] = [];

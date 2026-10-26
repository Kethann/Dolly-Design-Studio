// ─────────────────────────────────────────────────────────────────────────────
// BTS / MAKING STILLS — the "Behind the Scenes" section of the home page.
//
// [CLIENT TO PROVIDE] Real behind-the-scenes and making stills only:
//   1. Put the images in  public/images/bts/  (e.g. 01-dacoit-photoshoot.jpg).
//   2. Run  npm run images
//   3. Add one line per still below, with a short description and (optionally) the film.
// Until then the section shows a short "on their way" note.
// ─────────────────────────────────────────────────────────────────────────────

export interface Still {
  src: string;
  /** Describes the image for screen readers and search engines. */
  alt: string;
  /** Shown under the still, e.g. "Dacoit — character shoot". */
  caption?: string;
}

export const stills: Still[] = [
  // { src: "/images/bts/01-dacoit-photoshoot.jpg", alt: "Adivi Sesh on set during the Dacoit poster shoot", caption: "Dacoit — poster shoot" },
];

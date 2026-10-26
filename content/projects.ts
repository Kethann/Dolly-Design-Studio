// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS — every poster campaign on the site: the Work page, each project
// page, and (with `featured: true`) the home page's "Selected work".
//
// To add a project:
//   1. Put its images in  public/images/posters/<slug>/  (01-… is the cover).
//   2. Run  npm run images
//   3. Copy one of the entries below and edit it.
// See content/README.md for details.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project } from "./types";

export const projects: Project[] = [
  {
    slug: "dacoit",
    title: "Dacoit",
    film: "Dacoit: A Love Story",
    category: "Film Publicity",
    languages: ["Telugu"],
    year: 2026,
    client: "Annapurna Studios · S.S. Creations",
    role: "Key art, theatrical campaign",
    deliverables: ["Character posters", "Theatrical one-sheet", "Release banner", "Title design (Telugu)"],
    brief:
      "Betrayed by his better half, a man is convicted for a crime he didn’t commit. Once free, he hunts her down in pursuit of vengeance. The campaign had to hold romance and rage in the same frame.",
    credits: [
      { label: "Cast", value: "Adivi Sesh · Mrunal Thakur · Anurag Kashyap" },
      { label: "Director", value: "Shaneil Deo" },
      { label: "Studios", value: "Annapurna Studios · S.S. Creations" },
      { label: "Streaming", value: "Prime Video" },
    ],
    images: [
      { src: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg", alt: "Dacoit theatrical poster — Adivi Sesh and Mrunal Thakur with Anurag Kashyap behind them" },
      { src: "/images/posters/dacoit/02-dacoit-character-poster.jpg", alt: "Dacoit character poster — a scarred close-up of Adivi Sesh smoking" },
      { src: "/images/posters/dacoit/03-dacoit-in-cinemas-now-poster.jpg", alt: "Dacoit ‘In cinemas now’ poster — Adivi Sesh handcuffed inside a police van" },
      { src: "/images/posters/dacoit/04-dacoit-release-banner.jpg", alt: "Dacoit release banner — the leads inside a car, gun drawn, ‘April 10th worldwide’" },
    ],
    featured: true,
    order: 1,
  },
  {
    slug: "dacoit-song-campaign",
    title: "Dacoit — Song Campaign",
    film: "Dacoit: A Love Story",
    category: "Campaigns",
    languages: ["Telugu"],
    year: 2026,
    client: "Annapurna Studios · S.S. Creations",
    role: "Music campaign artwork",
    deliverables: ["Song release posters", "Lyric video key art", "Social cut-downs"],
    brief:
      "A run of song-launch posters — Rubaroo, Chichu Buddi, Touch Buddy — each with its own mood while staying unmistakably part of the Dacoit world.",
    images: [
      { src: "/images/posters/dacoit-song-campaign/01-rubaroo-song-poster.jpg", alt: "Rubaroo song poster — the leads in a warm, intimate embrace" },
      { src: "/images/posters/dacoit-song-campaign/02-dacoit-song-poster.jpg", alt: "Dacoit song poster — split portrait of the two leads" },
      { src: "/images/posters/dacoit-song-campaign/03-chichu-buddi-full-video-song-poster.jpg", alt: "Chichu Buddi full video song poster — the leads dancing" },
      { src: "/images/posters/dacoit-song-campaign/04-touch-buddy-song-poster.jpg", alt: "Touch Buddy song poster — colourful dance number with the cast" },
    ],
    order: 2,
  },
  {
    slug: "goodachari-2",
    title: "G2",
    film: "Goodachari 2",
    category: "Film Publicity",
    languages: ["Telugu"],
    year: 2027,
    client: "People Media Factory · Abhishek Agarwal Arts",
    role: "Key art, release campaign",
    deliverables: ["Teaser posters", "Release date posters", "Title treatment"],
    brief:
      "Six years after Goodachari, Agent Gopi goes global. The campaign leans into cold steel, shattered glass and a barcode title that feels like classified intel.",
    credits: [
      { label: "Cast", value: "Adivi Sesh · Emraan Hashmi · Wamiqa Gabbi" },
      { label: "Director", value: "Vinay Kumar Sirigineedi" },
      { label: "Studios", value: "People Media Factory · Abhishek Agarwal Arts · AK Entertainments" },
      { label: "Streaming", value: "Prime Video" },
    ],
    images: [
      { src: "/images/posters/goodachari-2/01-g2-poster.jpg", alt: "G2 poster — Adivi Sesh aiming through shattered glass" },
      { src: "/images/posters/goodachari-2/02-g2-release-poster.jpg", alt: "G2 release poster — red-tinted faces, ‘May 1st 2026 worldwide release’" },
      { src: "/images/posters/goodachari-2/03-g2-poster-leads-walking-european.jpg", alt: "G2 poster — the leads walking in a European city square at sunset" },
      { src: "/images/posters/goodachari-2/04-g2-character-poster.jpg", alt: "G2 character poster — Emraan Hashmi in dark glasses" },
    ],
    featured: true,
    order: 3,
  },
  {
    slug: "baahubali-the-epic",
    title: "Baahubali: The Epic",
    film: "Baahubali: The Epic",
    category: "Re-release",
    languages: ["Telugu"],
    year: 2025,
    client: "Arka Media Works",
    role: "Re-release campaign",
    deliverables: ["Re-release key art", "Release date poster", "Character poster"],
    brief:
      "A legend returns to the big screen. The re-release artwork had to feel monumental and new without losing the grandeur audiences remember.",
    credits: [
      { label: "Cast", value: "Prabhas · Rana Daggubati · Anushka Shetty" },
      { label: "Director", value: "S.S. Rajamouli" },
      { label: "Studio", value: "Arka Media Works" },
      { label: "Streaming", value: "Netflix" },
    ],
    images: [
      { src: "/images/posters/baahubali-the-epic/01-baahubali-the-epic-ensemble-poster.jpg", alt: "Baahubali: The Epic ensemble poster with the kingdom’s characters" },
      { src: "/images/posters/baahubali-the-epic/02-baahubali-the-epic-poster.jpg", alt: "Baahubali: The Epic poster — Prabhas crowned, ‘31 October 2025’" },
      { src: "/images/posters/baahubali-the-epic/03-baahubali-the-epic-poster-warrior-battle-armour.jpg", alt: "Baahubali: The Epic poster — warrior in battle armour, ‘Oct 31 2025’" },
    ],
    featured: true,
    order: 4,
  },
  {
    slug: "premante",
    title: "Premante",
    film: "Premante",
    category: "Film Publicity",
    languages: ["Telugu"],
    year: 2025,
    client: "Sree Venkateswara Cinemas LLP",
    role: "Key art, title design, campaign",
    deliverables: ["Title logo", "First look", "Release posters", "Song posters"],
    brief:
      "A couple’s perfect marriage is tested when the wife grows suspicious of her husband’s odd behaviour. A bright, playful comedy that needed a title with a wink.",
    credits: [
      { label: "Cast", value: "Priyadarshi Pulikonda · Anandhi · Vennela Kishore" },
      { label: "Director", value: "Navaneeth Sriram" },
      { label: "Studio", value: "Sree Venkateswara Cinemas LLP" },
      { label: "Streaming", value: "Netflix" },
    ],
    images: [
      { src: "/images/posters/premante/01-premante-poster.jpg", alt: "Premante poster — the couple close together under a warm sky" },
      { src: "/images/posters/premante/02-premante-release-poster.jpg", alt: "Premante release poster — the cast with a vintage car, ‘In cinemas 21st Nov 2025’" },
      { src: "/images/posters/premante/03-premante-poster-leads-police-officer.jpg", alt: "Premante poster — the leads with a police officer holding a file" },
      { src: "/images/posters/premante/04-premante-releasing-nov-21st-poster.jpg", alt: "Premante ‘Releasing Nov 21st’ poster — the couple under the night sky" },
    ],
    order: 5,
  },
  {
    slug: "korean-kanakaraju",
    title: "Korean Kanakaraju",
    film: "Korean Kanakaraju",
    category: "Film Publicity",
    languages: ["Telugu"],
    year: 2026,
    client: "UV Creations · First Frame Entertainments",
    role: "Title design, key art",
    deliverables: ["Telugu & English title logos", "Festival posters", "Lyrical video posters"],
    brief:
      "A horror comedy with a Korean twist. Two title logos — Telugu and English — built from the same rough, kinetic energy.",
    credits: [
      { label: "Cast", value: "Varun Tej · Ritika Nayak · Satya" },
      { label: "Director", value: "Merlapaka Gandhi" },
      { label: "Studios", value: "UV Creations · First Frame Entertainments" },
    ],
    images: [
      { src: "/images/posters/korean-kanakaraju/01-korean-kanakaraju-happy-ugadi-festival-poster.jpg", alt: "Korean Kanakaraju ‘Happy Ugadi’ festival poster — Varun Tej with a boombox" },
      { src: "/images/posters/korean-kanakaraju/02-korean-kanakaraju-poster.jpg", alt: "Korean Kanakaraju poster — Varun Tej mid-action over the Telugu title" },
      { src: "/images/posters/korean-kanakaraju/03-korean-kanakaraju-poster-cast-airport.jpg", alt: "Korean Kanakaraju poster — the cast at an airport" },
      { src: "/images/posters/korean-kanakaraju/04-korean-kanakaraju-kamsahamnida-lyrical-video-poster.jpg", alt: "Korean Kanakaraju ‘Kamsahamnida’ lyrical video poster" },
    ],
    featured: true,
    order: 6,
  },
  {
    slug: "brindhavihari",
    title: "Brindhavihari",
    film: "Brindhavihari",
    category: "Film Publicity",
    languages: ["Kannada"],
    year: 2026,
    client: "KVC Production",
    role: "Title design, key art",
    deliverables: ["Kannada title logo", "Character posters", "Song posters"],
    brief:
      "A romantic drama steeped in colour and festival light. The title design borrows from classical ornament, rendered in cool, carved blue.",
    credits: [
      { label: "Cast", value: "Golden Star Ganesh · Devika Bhat · Malvika Sharma" },
      { label: "Director", value: "Srinivasa Raju" },
      { label: "Studio", value: "KVC Production" },
    ],
    images: [
      { src: "/images/posters/brindhavihari/01-brindhavihari-poster.jpg", alt: "Brindhavihari poster — a figure drawing a bow against a festival crowd" },
      { src: "/images/posters/brindhavihari/02-brindhavihari-character-poster.jpg", alt: "Brindhavihari character poster — Devika Bhat as Radha in yellow" },
      { src: "/images/posters/brindhavihari/03-brindhavihari-radha-radha-song-poster.jpg", alt: "Brindhavihari ‘Radha Radha’ song poster — dancer leaping in a landscape" },
      { src: "/images/posters/brindhavihari/04-brindhavihari-character-poster-malvika-sharma-red.jpg", alt: "Brindhavihari character poster — Malvika Sharma in a red sari" },
    ],
    order: 7,
  },
  {
    slug: "romeo-juliet",
    title: "Romeo Juliet",
    film: "Romeo Juliet",
    category: "Film Publicity",
    languages: ["Telugu"], // [CLIENT TO CONFIRM] language
    year: 2026,
    client: "Navarasa Production",
    role: "Title design, key art",
    deliverables: ["Title logo", "Birthday poster", "Release date poster"],
    brief: "A modern romance with a pop-art pulse — a bold red title and posters that feel like a night out in the city.",
    credits: [
      { label: "Cast", value: "Harshith Reddy · Vishaka Dimaan · Harsha Chemudu" },
      { label: "Director", value: "Bhargav Macharla" },
      { label: "Studio", value: "Navarasa Production" },
    ],
    images: [
      { src: "/images/posters/romeo-juliet/01-romeo-juliet-poster.jpg", alt: "Romeo Juliet poster — the hero floating against a heart-shaped moon over a city" },
      { src: "/images/posters/romeo-juliet/02-romeo-juliet-release-poster.jpg", alt: "Romeo Juliet release poster — a dancer in a neon-lit club, ‘31.07.26’" },
    ],
    order: 8,
  },
  {
    slug: "oka-manchi-prema-katha",
    title: "Oka Manchi Prema Katha",
    film: "Oka Manchi Prema Katha",
    category: "Film Publicity",
    languages: ["Telugu"],
    year: 2024,
    client: "Sthira Productions LLP",
    role: "Title design, key art",
    deliverables: ["Telugu title logo", "Family poster", "Character poster"],
    brief:
      "A corporate executive battling depression finds healing by reconnecting with her eighty-year-old mother. Soft daylight, handwritten type, and a lot of warmth.",
    credits: [
      { label: "Cast", value: "Samuthirakani · Rohini Hattangadi · Rohini" },
      { label: "Director", value: "Akkineni Kutumba Rao" },
      { label: "Studio", value: "Sthira Productions LLP" },
      { label: "Streaming", value: "ETV Win" },
    ],
    images: [
      { src: "/images/posters/oka-manchi-prema-katha/01-oka-manchi-prema-katha-poster.jpg", alt: "Oka Manchi Prema Katha poster — an elderly mother with her grandchildren" },
      { src: "/images/posters/oka-manchi-prema-katha/02-oka-manchi-prema-katha-family-poster.jpg", alt: "Oka Manchi Prema Katha family poster — three generations smiling together" },
    ],
    order: 9,
  },
  {
    slug: "independent-films",
    title: "Independent Films",
    film: "Independent & short films",
    category: "Independent",
    languages: ["Telugu"], // [CLIENT TO CONFIRM] languages of the individual films
    year: 2025,
    client: "Independent productions",
    role: "Poster design",
    deliverables: ["Theatrical & festival posters"],
    brief: "Posters for independent and short films — small budgets, big ideas, and a lot of freedom.",
    images: [
      { src: "/images/posters/independent-films/01-fragments-of-us-poster.jpg", alt: "Fragments of Us poster — a couple standing apart in a desert landscape" },
      { src: "/images/posters/independent-films/02-independent-film-poster.jpg", alt: "Independent film poster — a couple and a vintage record player on teal" },
      { src: "/images/posters/independent-films/03-inkosaari-poster.jpg", alt: "Inkosaari! poster — a group of friends on a couch under a neon title" },
      { src: "/images/posters/independent-films/04-head-over-heels-poster.jpg", alt: "Head Over Heels poster — a couple walking past a city tram" },
      { src: "/images/posters/independent-films/05-demons-poster.jpg", alt: "Demons poster — a man standing in a shadowed room" },
    ],
    order: 10,
  },
  {
    slug: "title-designs",
    title: "Title Designs",
    film: "Title logos for film",
    category: "Title Design",
    languages: ["Telugu", "Kannada"],
    year: 2026,
    client: "Various productions",
    role: "Title logo design & typography",
    deliverables: ["Telugu, Kannada & English title logos", "Animated title references"],
    brief:
      "A film’s name is its first piece of art. Every title is drawn by hand for its story — distressed, neon, carved, calligraphic.",
    images: [
      { src: "/images/title-designs/01-dacoit-telugu-title-logo.jpg", alt: "Dacoit Telugu title logo, distressed letters with a red slash" },
      { src: "/images/title-designs/02-isakapatnam-title-logo.jpg", alt: "Isakapatnam title logo in weathered orange caps" },
      { src: "/images/title-designs/03-korean-kanakaraju-telugu-title-logo.jpg", alt: "Korean Kanakaraju Telugu title logo in gold" },
      { src: "/images/title-designs/04-korean-kanakaraju-english-title-logo.jpg", alt: "Korean Kanakaraju English title logo in gold" },
      { src: "/images/title-designs/05-brindhavihari-kannada-title-logo.jpg", alt: "Brindhavihari Kannada title logo in carved blue metal" },
      { src: "/images/title-designs/06-romeo-juliet-title-logo.jpg", alt: "Romeo Juliet title logo in bold red block letters" },
      { src: "/images/title-designs/07-inkosaari-neon-script-title-logo.jpg", alt: "Inkosaari! neon script title logo" },
      { src: "/images/title-designs/08-inkosaari-telugu-neon-title-logo.jpg", alt: "Inkosaari! Telugu neon title logo" },
      { src: "/images/title-designs/09-oka-manchi-prema-katha-telugu-handwritten-title.jpg", alt: "Oka Manchi Prema Katha Telugu handwritten title logo" },
      { src: "/images/title-designs/10-naukari-brush-script-title-logo.jpg", alt: "Naukari brush-script title logo in yellow" },
    ],
    order: 11,
  },
];

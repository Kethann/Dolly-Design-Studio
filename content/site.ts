// ─────────────────────────────────────────────────────────────────────────────
// STUDIO DETAILS — name, contact details, social links, menu, search engines.
// Used across every page (header, footer, contact section, Google results).
// ─────────────────────────────────────────────────────────────────────────────

export const site = {
  name: "Dolly Design Studio",
  /** Short name shown next to the logo in the top menu. */
  shortName: "Dolly",
  founder: { name: "Sasank Muppalla", role: "Founder & Creative Director" },

  contact: {
    email: "dollydesignstudios@gmail.com",
    /** How the number is shown on the page. */
    phone: "+91 70220 50888",
    /** The same number for the "tap to call" link — digits only, with country code. */
    phoneHref: "tel:+917022050888",
    whatsapp: "https://wa.me/917022050888",
    location: "Bangalore, India",
    city: "Bangalore",
    countryCode: "IN",
  },

  /** Shown in the contact section and the footer. Remove a line to hide that link. */
  social: [
    { label: "Instagram", href: "https://www.instagram.com/dollydstudio" },
    { label: "X", href: "https://x.com/dollydstudio" },
    { label: "IMDb", href: "https://www.imdb.com/find/?q=Sasank%20Muppalla" },
    // { label: "Behance", href: "" }, // [CLIENT TO PROVIDE]
  ],

  /** What Google, WhatsApp, Instagram etc. show when the site is shared or searched. */
  description:
    "Dolly Design Studio is a creative collective specialising in film publicity and title design. We blend artistry with strategy to craft unforgettable identities that elevate films and leave a lasting mark.",
  seo: {
    /** Browser-tab title on the home page: "<name> — <this>". */
    titleSuffix: "Film Poster & Title Design Studio",
    keywords: ["film poster design", "movie poster studio", "title design", "key art", "Telugu film posters", "India"],
    locale: "en_IN",
  },
} as const;

/** The top menu (and footer links). `id` is the home-page section it scrolls to ("work" opens the full gallery). */
export const navItems = [
  { id: "work", label: "Projects" },
  { id: "process", label: "How We Work" },
  { id: "making", label: "BTS" },
  { id: "about", label: "About" },
  { id: "clients", label: "Clients" },
  { id: "contact", label: "Contact" },
] as const;

/** The small frames on the right edge of the home page, one per section, in page order. */
export const railSections = [
  { id: "top", label: "Intro" },
  { id: "agency", label: "The Agency" },
  { id: "work", label: "Our Projects" },
  { id: "process", label: "How We Work" },
  { id: "making", label: "Making Stills" },
  { id: "about", label: "About Us" },
  { id: "clients", label: "Our Clients" },
  { id: "contact", label: "Contact Us" },
] as const;

import { home } from "@/content/home";
import { contactProjects } from "@/lib/contact/options";
import { site, navItems } from "@/content/site";
import { services } from "@/content/services";
import { clients, collaborators, testimonials } from "@/content/clients";
import { projects } from "@/content/projects";
import { CATEGORIES } from "@/content/types";
import { breakdownsPage, footer, notFoundPage, projectPage, workPage } from "@/content/pages";
import { proofTable } from "@/content/proof-table";
import { DEFAULT_FONT_ROLES } from "./fonts";
import { DEFAULT_GLASS, DEFAULT_MENU_TONES, type SiteContent } from "./types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** The content exactly as written in the files under /content (used until the creator changes something). */
export function defaultContent(): SiteContent {
  return clone({
    site,
    nav: navItems.map((n) => ({ id: n.id, label: n.label })),
    home: { ...home, contact: { ...home.contact, form: { ...home.contact.form, projectOptions: contactProjects(home.contact.form) } } },
    services,
    clients,
    clientsSecond: [],
    collaborators,
    testimonials,
    projects,
    titleDesigns: [],
    categories: [...CATEGORIES],
    work: workPage,
    breakdownsPage,
    projectPage,
    notFound: notFoundPage,
    footer,
    slate: {
      overline: proofTable.overline,
      headline: [...proofTable.headline],
      body: proofTable.body,
      ctaLabel: proofTable.cta.label,
    },
    type: {},
    fonts: { ...DEFAULT_FONT_ROLES },
    customFonts: [],
    theme: { accent: "#e8b04b", accentBright: "#fff195", text: "#f4ede1", glass: { ...DEFAULT_GLASS, colors: [...DEFAULT_GLASS.colors] }, menuTones: { ...DEFAULT_MENU_TONES } },
    galleryLayout: { columns: "Auto", shape: "Poster (tall)", showDetails: true, showFilters: true },
    breakdowns: [],
    pages: Object.fromEntries(
      ["home", "work", "breakdowns", "project", "notFound"].map((k) => [k, { fontDisplay: "", fontLabel: "", fontBody: "", accent: "", backdrop: "", backdropDim: 0.55 }]),
    ),
  }) as unknown as SiteContent;
}

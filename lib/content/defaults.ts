import { home } from "@/content/home";
import { site, navItems } from "@/content/site";
import { services } from "@/content/services";
import { clients, collaborators, testimonials } from "@/content/clients";
import { projects } from "@/content/projects";
import { CATEGORIES } from "@/content/types";
import { breakdownsPage, footer, notFoundPage, projectPage, workPage } from "@/content/pages";
import { proofTable } from "@/content/proof-table";
import { DEFAULT_FONT_ROLES } from "./fonts";
import type { SiteContent } from "./types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** The content exactly as written in the files under /content (used until the creator changes something). */
export function defaultContent(): SiteContent {
  return clone({
    site,
    nav: navItems.map((n) => ({ id: n.id, label: n.label })),
    home,
    services,
    clients,
    collaborators,
    testimonials,
    projects,
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
    theme: { accent: "#e8b04b", accentBright: "#fff195", text: "#f4ede1" },
    galleryLayout: { columns: "Auto", shape: "Poster (tall)", showDetails: true, showFilters: true },
    breakdowns: [],
    pages: Object.fromEntries(
      ["home", "work", "breakdowns", "project", "notFound"].map((k) => [k, { fontDisplay: "", fontLabel: "", fontBody: "", accent: "", backdrop: "", backdropDim: 0.55 }]),
    ),
  }) as unknown as SiteContent;
}

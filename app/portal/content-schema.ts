import type { ArtSection } from "@/lib/intro/settings";
import { CARD_LINK_VALUES } from "@/lib/content/card-links";
import type { PageKey } from "@/lib/content/types";

/**
 * What the creator can edit, written as data: the portal's Content windows are drawn from this, one window per page,
 * one collapsible block per section of that page. `style: true` means the text can also be restyled (font, size…);
 * those are exactly the texts the site tags with `data-t` (see lib/content/context.tsx).
 */
export type Field =
  | { kind: "text" | "area"; path: string; label: string; style?: boolean; hint?: string }
  | { kind: "number"; path: string; label: string; min: number; max: number }
  | { kind: "bool"; path: string; label: string }
  | { kind: "select"; path: string; label: string; options: readonly string[]; /** Take the choices from a list in the content instead (e.g. "categories"). */ optionsFrom?: string }
  /** The project types: add, rename, reorder and remove them (projects follow a rename). */
  | { kind: "categories"; path: string; label: string }
  | { kind: "checks"; path: string; label: string; options: readonly string[] }
  /**
   * A picture. `alt`, `shape` and `size` name sibling settings kept beside it (e.g. "photoAlt"): a description for
   * screen readers and search engines, how the picture is cropped, and how big it is shown.
   */
  | { kind: "image"; path: string; label: string; hint?: string; alt?: string; shape?: string; size?: string }
  /** A font from the built-in list or the uploaded ones ("" = the site's own). */
  | { kind: "font"; path: string; label: string; hint?: string }
  /** An optional colour ("" = the site's own). */
  | { kind: "colour"; path: string; label: string; hint?: string }
  | { kind: "slider"; path: string; label: string; min: number; max: number; step: number; percent?: boolean; hint?: string }
  /** A list of short texts (words, names, paragraphs) you can add to, delete from and reorder. */
  | { kind: "strings"; path: string; label: string; add: string; area?: boolean; style?: boolean; min?: number }
  /** A list of records (cards, projects, services…). `fixed` lists can be edited but not added to or deleted from. */
  | {
      kind: "list";
      path: string;
      label: string;
      add: string;
      title: (item: Record<string, unknown>, i: number) => string;
      fields: Field[];
      blank: () => Record<string, unknown>;
      fixed?: boolean;
      min?: number;
      max?: number;
    };

export interface SchemaSection {
  id: string;
  title: string;
  /** The part of the site the preview scrolls to when this section opens. */
  target?: string;
  /** Home-page section whose background colours are edited right here. */
  art?: ArtSection;
  /** The page the live preview shows while this section is open. */
  route?: PageKey;
  fields: Field[];
}

export interface SchemaPage {
  id: string;
  name: string;
  hint: string;
  sections: SchemaSection[];
}

const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

/** The look of one page on its own: its fonts, accent colour and a picture behind it. */
const pageLook = (key: PageKey, name: string): SchemaSection => ({
  id: `look-${key}`,
  title: `${name}: its own look`,
  route: key,
  fields: [
    { kind: "font", path: `pages.${key}.fontDisplay`, label: "Headings font" },
    { kind: "font", path: `pages.${key}.fontLabel`, label: "Subheadings font" },
    { kind: "font", path: `pages.${key}.fontBody`, label: "Text font" },
    { kind: "colour", path: `pages.${key}.accent`, label: "Accent colour", hint: "The gold used for small headings, lines and highlights on this page." },
    { kind: "image", path: `pages.${key}.backdrop`, label: "Picture behind the page" },
    { kind: "slider", path: `pages.${key}.backdropDim`, label: "Dim the picture", min: 0, max: 0.95, step: 0.05, percent: true, hint: "More dimming makes the text easier to read." },
  ],
});

/** The social links (Instagram, X, IMDb…): shown in the studio details, and in the founder's form (they sit under the founder's story). */
const SOCIAL_LINKS: Field = {
  kind: "list",
  path: "site.social",
  label: "Social links (Instagram, X, IMDb…)",
  add: "Add a link",
  max: 8,
  title: (it) => str(it.label, "New link"),
  blank: () => ({ label: "Instagram", href: "https://" }),
  fields: [
    { kind: "text", path: "label", label: "Name (Instagram, X or IMDb show their logo)" },
    { kind: "text", path: "href", label: "Address (https://…)" },
  ],
};

const home: SchemaPage = {
  id: "home",
  name: "Home page",
  hint: "every section, top to bottom",
  sections: [
    pageLook("home", "Home page"),
    {
      id: "intro",
      title: "Intro (under the logo)",
      target: "top",
      art: "top",
      fields: [
        { kind: "strings", path: "home.hero.disciplines", label: "Words under the logo", add: "Add a word", style: true },
        { kind: "text", path: "home.hero.screenReaderHeading", label: "Search-engine heading", hint: "Not shown on the page; read by Google and screen readers." },
      ],
    },
    {
      id: "agency",
      title: "About our agency",
      target: "agency",
      art: "agency",
      fields: [
        { kind: "text", path: "home.manifesto.label", label: "Small heading", style: true },
        { kind: "area", path: "home.manifesto.statement", label: "Big statement", style: true, hint: "Put *asterisks* around words to set them in gold italic." },
        { kind: "area", path: "home.manifesto.body", label: "Paragraph", style: true },
      ],
    },
    {
      id: "numbers",
      title: "The numbers",
      target: "agency",
      fields: [
        {
          kind: "list",
          path: "home.stats",
          label: "Numbers",
          add: "Add a number",
          max: 6,
          title: (it) => `${it.value ?? ""}${it.suffix ?? ""} ${it.label ?? ""}`,
          blank: () => ({ value: 10, suffix: "+", label: "New number" }),
          fields: [
            { kind: "number", path: "value", label: "Number", min: 0, max: 100000 },
            { kind: "text", path: "suffix", label: "After the number (e.g. +)" },
            { kind: "text", path: "label", label: "Label", style: true },
          ],
        },
      ],
    },
    {
      id: "clients",
      title: "Clients & collaborations",
      target: "clients",
      art: "clients",
      fields: [
        { kind: "text", path: "home.clients.label", label: "Small heading", style: true },
        { kind: "text", path: "home.clients.title", label: "Heading", style: true },
        { kind: "text", path: "home.clients.rowLabels.clients", label: "First row caption" },
        { kind: "text", path: "home.clients.rowLabels.collaborators", label: "Second row caption" },
        { kind: "select", path: "home.clients.logoSize", label: "Logo size (small, medium or large)", options: ["small", "medium", "large"] },
        { kind: "select", path: "home.clients.portraitSize", label: "Portrait size (small, medium or large)", options: ["small", "medium", "large"] },
        { kind: "select", path: "home.clients.portraitShape", label: "Portrait shape (round, rounded or square)", options: ["round", "rounded", "square"] },
        {
          kind: "list",
          path: "clients",
          label: "Clients — logo above the name (first row)",
          add: "Add a client",
          title: (it) => str(it.name, "New client"),
          blank: () => ({ name: "New client", logo: "" }),
          fields: [
            { kind: "text", path: "name", label: "Name" },
            { kind: "image", path: "logo", label: "Logo", hint: "A transparent PNG or an SVG works best.", alt: "alt" },
          ],
        },
        {
          kind: "list",
          path: "collaborators",
          label: "Collaborators — photo above the name (second row)",
          add: "Add a person",
          title: (it) => str(it.name, "New person"),
          blank: () => ({ name: "New person", photo: "" }),
          fields: [
            { kind: "text", path: "name", label: "Name" },
            { kind: "image", path: "photo", label: "Photo", hint: "A square portrait works best; any picture format is fine.", alt: "alt" },
          ],
        },
        {
          kind: "list",
          path: "testimonials",
          label: "Testimonials (shown once there is one)",
          add: "Add a testimonial",
          title: (it) => str(it.name, "New testimonial"),
          blank: () => ({ quote: "", name: "", role: "" }),
          fields: [
            { kind: "area", path: "quote", label: "Quote" },
            { kind: "text", path: "name", label: "Name" },
            { kind: "text", path: "role", label: "Role" },
          ],
        },
      ],
    },
    {
      id: "founder",
      title: "About the founder",
      target: "about",
      art: "about",
      fields: [
        { kind: "text", path: "home.founder.label", label: "Small heading", style: true },
        { kind: "text", path: "site.founder.name", label: "Name", style: true },
        { kind: "text", path: "site.founder.role", label: "Role", style: true },
        { kind: "image", path: "home.founder.photo", label: "Profile picture", hint: "Shown on the glass card. Without one, the initials are shown.", alt: "photoAlt", shape: "photoShape", size: "photoSize" },
        { kind: "area", path: "home.founder.cardNote", label: "Short description on the card", style: true },
        { kind: "strings", path: "home.founder.paragraphs", label: "Bio paragraphs", add: "Add a paragraph", area: true, style: true },
        SOCIAL_LINKS,
      ],
    },
    {
      id: "gallery",
      title: "Project gallery",
      target: "work",
      art: "work",
      fields: [
        { kind: "text", path: "home.gallery.label", label: "Small heading", style: true },
        { kind: "text", path: "home.gallery.title", label: "Heading", style: true },
        { kind: "area", path: "home.gallery.intro", label: "Intro", style: true },
        { kind: "text", path: "home.gallery.viewAllLink", label: "“Open the full gallery” link" },
        { kind: "categories", path: "categories", label: "Project types (the filter buttons)" },
        { kind: "select", path: "galleryLayout.columns", label: "Posters per row", options: ["Auto", "2", "3", "4"] },
        { kind: "select", path: "galleryLayout.shape", label: "Poster shape", options: ["Poster (tall)", "Square", "Landscape"] },
        { kind: "bool", path: "galleryLayout.showDetails", label: "Show the title and type under each poster" },
        { kind: "bool", path: "galleryLayout.showFilters", label: "Show the filter buttons above the gallery" },
      ],
    },
    {
      id: "process",
      title: "How we work",
      target: "process",
      art: "process",
      fields: [
        { kind: "text", path: "home.process.label", label: "Small heading", style: true },
        { kind: "text", path: "home.process.title", label: "Heading", style: true },
        { kind: "area", path: "home.process.intro", label: "Intro", style: true },
        {
          kind: "list",
          path: "home.process.cards",
          label: "Cards",
          add: "Add a card",
          max: 8,
          title: (it) => str(it.title, "New card"),
          blank: () => ({ title: "New card", note: "", body: "", icon: "star", opens: "Does nothing", linkText: "" }),
          fields: [
            { kind: "text", path: "title", label: "Title", style: true },
            { kind: "text", path: "note", label: "Small line", style: true },
            { kind: "area", path: "body", label: "Text", style: true },
            { kind: "select", path: "icon", label: "Icon", options: ["sketch", "camera", "pipeline", "layers", "star"] },
            { kind: "select", path: "opens", label: "Click to view: where it takes the visitor", options: CARD_LINK_VALUES },
            { kind: "text", path: "linkText", label: "Link words (blank = the usual words)" },
          ],
        },
      ],
    },
    {
      id: "services",
      title: "Our services",
      target: "services",
      art: "services",
      fields: [
        { kind: "text", path: "home.services.label", label: "Small heading", style: true },
        { kind: "text", path: "home.services.title", label: "Heading", style: true },
        {
          kind: "list",
          path: "services",
          label: "Services",
          add: "Add a service",
          max: 10,
          title: (it) => str(it.name, "New service"),
          blank: () => ({ number: "", name: "New service", description: "", deliverables: [], sample: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg" }),
          fields: [
            { kind: "text", path: "name", label: "Name", style: true },
            { kind: "area", path: "description", label: "Description", style: true },
            { kind: "strings", path: "deliverables", label: "What you get", add: "Add an item" },
            { kind: "image", path: "sample", label: "Picture shown on hover" },
          ],
        },
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      target: "contact",
      art: "contact",
      fields: [
        { kind: "text", path: "home.contact.label", label: "Small heading", style: true },
        { kind: "text", path: "home.contact.headline", label: "Headline", style: true },
        { kind: "text", path: "home.contact.availability", label: "Availability line", style: true },
        { kind: "text", path: "home.contact.whatsappLabel", label: "WhatsApp link text" },
        { kind: "text", path: "home.contact.form.nameLabel", label: "Form: name" },
        { kind: "text", path: "home.contact.form.emailLabel", label: "Form: email" },
        { kind: "text", path: "home.contact.form.phoneLabel", label: "Form: phone number" },
        { kind: "text", path: "home.contact.form.companyLabel", label: "Form: company" },
        { kind: "text", path: "home.contact.form.projectTypeLabel", label: "Form: project type" },
        { kind: "text", path: "home.contact.form.budgetLabel", label: "Form: budget" },
        { kind: "text", path: "home.contact.form.timelineLabel", label: "Form: timeline" },
        { kind: "text", path: "home.contact.form.messageLabel", label: "Form: project description" },
        { kind: "text", path: "home.contact.form.messagePlaceholder", label: "Form: description hint" },
        { kind: "text", path: "home.contact.form.submitButton", label: "Send button" },
        { kind: "text", path: "home.contact.form.successMessage", label: "Thank-you message" },
        { kind: "strings", path: "home.contact.form.projectTypes", label: "Project types", add: "Add a type" },
        { kind: "strings", path: "home.contact.form.budgets", label: "Budget ranges", add: "Add a range" },
        { kind: "strings", path: "home.contact.form.timelines", label: "Timelines", add: "Add a timeline" },
      ],
    },
  ],
};

const work: SchemaPage = {
  id: "work",
  name: "Work & project pages",
  hint: "the full gallery, each project, page not found",
  sections: [
    {
      id: "work-page",
      title: "Gallery page (/work)",
      route: "work",
      fields: [
        { kind: "text", path: "work.metaTitle", label: "Browser-tab title" },
        { kind: "area", path: "work.metaDescription", label: "Search-engine description" },
        { kind: "text", path: "work.label", label: "Small heading", style: true },
        { kind: "text", path: "work.title", label: "Heading", style: true },
        { kind: "text", path: "work.allFilter", label: "“All” filter" },
        { kind: "text", path: "work.emptyCategory", label: "Empty-category message" },
        { kind: "select", path: "galleryLayout.columns", label: "Posters per row", options: ["Auto", "2", "3", "4"] },
        { kind: "select", path: "galleryLayout.shape", label: "Poster shape", options: ["Poster (tall)", "Square", "Landscape"] },
        { kind: "bool", path: "galleryLayout.showDetails", label: "Show the title and type under each poster" },
        { kind: "bool", path: "galleryLayout.showFilters", label: "Show the filter buttons above the gallery" },
      ],
    },
    pageLook("work", "Gallery page"),
    {
      id: "breakdowns-page",
      title: "Breakdowns page (/breakdowns)",
      route: "breakdowns",
      fields: [
        { kind: "text", path: "breakdownsPage.metaTitle", label: "Browser-tab title" },
        { kind: "area", path: "breakdownsPage.metaDescription", label: "Search-engine description" },
        { kind: "text", path: "breakdownsPage.label", label: "Small heading", style: true },
        { kind: "text", path: "breakdownsPage.title", label: "Heading", style: true },
        { kind: "area", path: "breakdownsPage.intro", label: "Introduction", style: true },
        { kind: "text", path: "breakdownsPage.backLink", label: "Back link" },
        { kind: "text", path: "breakdownsPage.hintMouse", label: "Hint for a mouse" },
        { kind: "text", path: "breakdownsPage.hintTouch", label: "Hint for a touch screen" },
        { kind: "text", path: "breakdownsPage.empty", label: "Message when there are none yet" },
      ],
    },
    pageLook("breakdowns", "Breakdowns page"),
    {
      id: "project-page",
      title: "Project pages",
      route: "project",
      fields: [
        { kind: "text", path: "projectPage.backLink", label: "Back link" },
        { kind: "text", path: "projectPage.clientLabel", label: "“Client” label" },
        { kind: "text", path: "projectPage.roleLabel", label: "“Role” label" },
      ],
    },
    pageLook("project", "Project pages"),
    {
      id: "not-found",
      title: "Page not found",
      route: "notFound",
      fields: [
        { kind: "text", path: "notFound.code", label: "Code" },
        { kind: "text", path: "notFound.title", label: "Heading" },
        { kind: "area", path: "notFound.body", label: "Text" },
        { kind: "text", path: "notFound.homeLink", label: "Link text" },
      ],
    },
    pageLook("notFound", "Page not found"),
  ],
};

const studio: SchemaPage = {
  id: "site",
  name: "Studio & menu",
  hint: "name, contact details, menu, footer, search results",
  sections: [
    {
      id: "studio",
      title: "Studio",
      fields: [
        { kind: "text", path: "site.name", label: "Studio name" },
        { kind: "text", path: "site.shortName", label: "Short name (top menu)" },
        { kind: "text", path: "site.contact.location", label: "Location" },
        { kind: "text", path: "site.contact.city", label: "City (for search engines)" },
      ],
    },
    {
      id: "contact-details",
      title: "Contact details",
      fields: [
        { kind: "text", path: "site.contact.email", label: "Email" },
        { kind: "text", path: "site.contact.phone", label: "Phone (as shown)" },
        { kind: "text", path: "site.contact.phoneHref", label: "Phone link (tel:+91…)" },
        { kind: "text", path: "site.contact.whatsapp", label: "WhatsApp link" },
        SOCIAL_LINKS,
      ],
    },
    {
      id: "menu",
      title: "Top menu & footer",
      fields: [
        {
          kind: "list",
          path: "nav",
          label: "Menu links (the order follows the page)",
          add: "",
          fixed: true,
          title: (it) => str(it.label, "Link"),
          blank: () => ({}),
          fields: [{ kind: "text", path: "label", label: "Words" }],
        },
        { kind: "text", path: "footer.rights", label: "Footer line" },
      ],
    },
    {
      id: "search",
      title: "Google & sharing",
      fields: [
        { kind: "text", path: "site.seo.titleSuffix", label: "Browser-tab title (after the name)" },
        { kind: "area", path: "site.description", label: "Description" },
        { kind: "strings", path: "site.seo.keywords", label: "Keywords", add: "Add a keyword" },
      ],
    },
  ],
};

const slate: SchemaPage = {
  id: "slate",
  name: "Slate text",
  hint: "the words beside the glass slate",
  sections: [
    {
      id: "slate-text",
      title: "Words beside the slate",
      target: "collaborations",
      fields: [
        { kind: "text", path: "slate.overline", label: "Small heading", style: true },
        { kind: "strings", path: "slate.headline", label: "Headline lines", add: "Add a line", style: true },
        { kind: "area", path: "slate.body", label: "Paragraph", style: true },
        { kind: "text", path: "slate.ctaLabel", label: "Button text" },
      ],
    },
  ],
};

const projects: SchemaPage = {
  id: "projects",
  name: "Projects",
  hint: "add, remove and edit every project",
  sections: [
    {
      id: "projects-list",
      title: "All projects",
      target: "work",
      art: "work",
      fields: [
        {
          kind: "list",
          path: "projects",
          label: "Projects",
          add: "Add a project",
          max: 100,
          min: 1,
          title: (it) => str(it.title, "New project"),
          blank: () => ({
            title: "New project",
            film: "",
            category: "",
            languages: ["Telugu"],
            year: new Date().getFullYear(),
            client: "",
            role: "",
            deliverables: [],
            brief: "",
            images: [{ src: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg", alt: "" }],
          }),
          fields: [
            { kind: "text", path: "title", label: "Title" },
            { kind: "text", path: "film", label: "Film or campaign name" },
            { kind: "select", path: "category", label: "Type", options: [], optionsFrom: "categories" },
            { kind: "number", path: "year", label: "Year", min: 1950, max: 2100 },
            { kind: "text", path: "client", label: "Client" },
            { kind: "text", path: "role", label: "Our role" },
            { kind: "strings", path: "deliverables", label: "Deliverables", add: "Add a deliverable" },
            { kind: "area", path: "brief", label: "About the project" },
            {
              kind: "list",
              path: "credits",
              label: "Credits (Cast, Director…)",
              add: "Add a credit",
              title: (it) => str(it.label, "Credit"),
              blank: () => ({ label: "Director", value: "" }),
              fields: [
                { kind: "text", path: "label", label: "Label" },
                { kind: "text", path: "value", label: "Names" },
              ],
            },
            {
              kind: "list",
              path: "images",
              label: "Images (the first is the cover)",
              add: "Add an image",
              min: 1,
              title: (it, i) => (i === 0 ? "Cover" : `Image ${i + 1}`) + (it.alt ? ` — ${String(it.alt).slice(0, 24)}` : ""),
              blank: () => ({ src: "/images/posters/dacoit/01-dacoit-theatrical-poster.jpg", alt: "" }),
              fields: [
                { kind: "image", path: "src", label: "Picture" },
                { kind: "text", path: "alt", label: "Description (for screen readers)" },
              ],
            },
            { kind: "bool", path: "featured", label: "Feature on the home page" },
          ],
        },
      ],
    },
  ],
};

// The gallery's own Edit window (on the home page and on /work) holds everything about the gallery in one place: its
// project types, its layout, and the projects themselves (add, edit, reorder, delete).
{
  const projectsList = projects.sections[0].fields.find((x) => x.kind === "list")!;
  const gallery = home.sections.find((x) => x.id === "gallery")!;
  const layout = gallery.fields.filter((x) => x.path === "categories" || x.path.startsWith("galleryLayout."));
  gallery.fields.push(projectsList);
  work.sections.find((x) => x.id === "work-page")!.fields.push(...layout, projectsList);
}

// The project page and the "page not found" page are templates, not pages you browse to: their wording is edited in the
// Studio window, next to the rest of the site-wide settings.
{
  const moved = ["project-page", "look-project", "not-found", "look-notFound"];
  const taken = work.sections.filter((x) => moved.includes(x.id));
  work.sections = work.sections.filter((x) => !moved.includes(x.id));
  studio.sections.push(...taken);
}

export const CONTENT_PAGES: Record<"home" | "work" | "site" | "slate" | "projects", SchemaPage> = {
  home,
  work,
  site: studio,
  slate,
  projects,
};

/** Every text that can be restyled, with its readable name, for the Typography window. */
/**
 * The list field at this path, for editing one item of it. The path may carry item numbers ("home.stats",
 * "projects.3.images"): they are ignored when looking the list up.
 */
export function findList(path: string): Extract<Field, { kind: "list" }> | null {
  const wanted = path.replace(/\.\d+(?=\.|$)/g, "");
  const walk = (fields: Field[], prefix: string): Extract<Field, { kind: "list" }> | null => {
    for (const f of fields) {
      if (f.kind !== "list") continue;
      const full = prefix ? `${prefix}.${f.path}` : f.path;
      if (full === wanted) return f;
      if (wanted.startsWith(full + ".")) {
        const inner = walk(f.fields, full);
        if (inner) return inner;
      }
    }
    return null;
  };
  for (const p of Object.values(CONTENT_PAGES)) for (const s of p.sections) {
    const hit = walk(s.fields, "");
    if (hit) return hit;
  }
  return null;
}

/** One section of one page ("home", "founder"). */
export function findSection(page: string, id: string): { page: SchemaPage; section: SchemaSection } | null {
  const p = (CONTENT_PAGES as Record<string, SchemaPage>)[page];
  const section = p?.sections.find((x) => x.id === id);
  return p && section ? { page: p, section } : null;
}

export function styledTexts(): { key: string; label: string; page: string }[] {
  const out: { key: string; label: string; page: string }[] = [];
  const seen = new Set<string>();
  const walk = (fields: Field[], prefix: string, page: string, section: string) => {
    for (const f of fields) {
      if (f.kind === "list") walk(f.fields, `${prefix}${f.path}.`, page, section);
      else if ((f.kind === "text" || f.kind === "area" || f.kind === "strings") && f.style) {
        const key = `${prefix}${f.path}`.replace(/\.\d+(?=\.|$)/g, "");
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ key, label: `${section} — ${f.label}`, page });
        }
      }
    }
  };
  for (const p of [home, slate, work]) for (const s of p.sections) walk(s.fields, "", p.name, s.title);
  return out;
}

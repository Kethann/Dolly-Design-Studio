/**
 * Where each "How we work" card can take a visitor ("click to view"). The words are what the portal shows in its list; `id`
 * says what the site does with a click, and `text` is the link's usual wording (the creator can write their own).
 */
export const CARD_LINKS = [
  { value: "Opens its own page (what’s inside)", id: "page", text: "See what’s inside" },
  { value: "Opens the Breakdowns page", id: "breakdowns", text: "See the breakdowns" },
  { value: "Opens the project gallery", id: "work", text: "See the work" },
  { value: "Goes to the projects (on this page)", id: "gallery", text: "See the projects" },
  { value: "Goes to the services", id: "services", text: "See our services" },
  { value: "Goes to the contact form", id: "contact", text: "Start a project" },
  { value: "Does nothing", id: "none", text: "" },
] as const;

export type CardLinkId = (typeof CARD_LINKS)[number]["id"];

/** What a card does until the creator chooses: it opens its own page. */
export const CARD_OPENS_OWN_PAGE = "Opens its own page (what’s inside)";

export const CARD_LINK_BY_ICON: Record<string, string> = {
  sketch: CARD_OPENS_OWN_PAGE,
  camera: CARD_OPENS_OWN_PAGE,
  pipeline: CARD_OPENS_OWN_PAGE,
  layers: CARD_OPENS_OWN_PAGE,
};

export const CARD_LINK_VALUES: readonly string[] = CARD_LINKS.map((l) => l.value);

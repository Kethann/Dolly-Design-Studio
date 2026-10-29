"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_INTRO_SETTINGS,
  ART_STYLES,
  LIMITS,
  ART_SECTIONS,
  type ArtSection,
  colorFractions,
  sanitizeIntroSettings,
  type FieldSettings,
  type IntroSettings,
  GLOW_PLACES,
  type GlowPlace,
} from "@/lib/intro/settings";
import { PREVIEW_PARAM, type PortalToSite, type PreviewRun, type SiteToPortal } from "@/lib/intro/preview-protocol";
import { T } from "@/lib/intro/timeline";
import { Choice, ColorRow, Dial, HexInput, Section, Slider, Toggle, percent } from "./controls";
import { ContentEditor, EditorProvider, ListModeProvider, getAt, setAt, MediaLibrary, ThemeEditor, TypographyEditor, type MediaApi } from "./ContentEditor";
import { CONTENT_PAGES, findList, findSection, type Field } from "./content-schema";
import { Spotlight, type SpotEntry } from "./Spotlight";
import { postFile, prepareImage } from "./upload";
import { Dock, MenuBar, type DockGroup, type MenuDef } from "./mac";
import { PageBar } from "./PageBar";
import { EditModal, ItemEditor, ItemTools, SectionEditor, sectionPaths } from "./EditModal";
import { contentProblems, problemsUnder } from "./validate";
import edit from "./edit.module.css";
import type { PageKey, SiteContent } from "@/lib/content/types";
import { sanitizeContent } from "@/lib/content/sanitize";
import mac from "./mac.module.css";
import { ProofTableEditor } from "./ProofTableEditor";
import { AccountPanel } from "./AccountPanel";
import { ActivityPanel } from "./ActivityPanel";
import { InboxPanel } from "./InboxPanel";
import { BreakdownsEditor } from "./BreakdownsEditor";
import { SweepEditor } from "./SweepEditor";
import type { PortalUser } from "@/lib/portal/users";
import styles from "./portal.module.css";

const GLOW_PLACE_LABELS: Record<GlowPlace, string> = {
  heroLogo: "Main logo (top of the home page)",
  navLogo: "Corner logo (top left)",
  titles: "Section titles",
  links: "Menu links",
  posters: "Project posters",
};

/** Latest moment a held frame still shows the intro (after this the page has taken over). */
const LAST_INTRO_FRAME = T.fadeStart - 0.05;
const NEW_COLORS = ["#b76e79", "#e8b04b", "#9fb7ff", "#ffffff", "#ff8a3d", "#7fd1b9"];

const BEATS = [
  { at: 0, label: "Stars" },
  { at: T.bigStarEnter, label: "Big star" },
  { at: T.docked, label: "Lands" },
  { at: T.shiverStart, label: "Shiver" },
  { at: T.waveStart, label: "Wave" },
  { at: T.sheenStart, label: "Sheen" },
  { at: T.fadeStart, label: "Page" },
];

/** A home-page section, or another page, whose Dots / Bubbles colours are being edited. */
type ColourTarget = ArtSection | "work" | "project";
const SECTION_NAMES: Record<ArtSection, string> = {
  top: "Intro (top)",
  agency: "About Our Agency",
  clients: "Clients & Collaborations",
  about: "About the Founder",
  work: "Project Gallery",
  process: "How We Work",
  services: "Our Services",
  contact: "Contact Us",
};
const colourPair = (s: IntroSettings, target: ColourTarget) =>
  target === "work" || target === "project" ? s.art.dots[target] : s.art.sections[target];

/** Where the preview goes for each window, so you always see what you're changing. */
function previewFocus(
  tab: Tab,
  target: ColourTarget,
): { to: string; at: "start" | "end"; label: string; intro?: boolean } | null {
  if (tab === "intro") return { to: "top", at: "start", label: "The opening", intro: true };
  if (tab === "slate") return { to: "collaborations", at: "end", label: "Slate" };
  if (tab === "background" && target !== "top" && target !== "project") {
    return { to: target, at: "start", label: SECTION_NAMES[target] };
  }
  if (["glass", "colours", "finish", "layers", "motion", "cursor"].includes(tab)) {
    return { to: "top", at: "start", label: "Top of the home page" };
  }
  return null; // content windows move the preview themselves, section by section
}

type Tab =
  | "home"
  | "work"
  | "site"
  | "projects"
  | "breakdowns"
  | "slate"
  | "media"
  | "type"
  | "background"
  | "theme"
  | "glass"
  | "colours"
  | "finish"
  | "layers"
  | "motion"
  | "intro"
  | "cursor"
  | "playback"
  | "account"
  | "activity"
  | "inbox";

interface WinDef {
  title: string;
  /** One plain sentence: what changing things here does. */
  hint: string;
  glyph: string;
  tint: [string, string];
  /** Size when made smaller (a floating window). */
  w: number;
  h: number;
  /** Opens as a small floating window instead of the large one (a control strip, not a settings page). */
  small?: boolean;
}

/** Every window of the portal: its name, what it is for, icon colour and the size it takes when made smaller. */
const WINDOWS: Record<Tab, WinDef> = {
  home: { title: "Home page", hint: "Edit the home page: press Edit on any section in the preview.", glyph: "home", tint: ["#ffb347", "#e8742a"], w: 460, h: 700 },
  work: { title: "Work & projects", hint: "The gallery and every project: press Edit on the page, or on a single poster.", glyph: "work", tint: ["#ffcf5c", "#e8a31a"], w: 440, h: 620 },
  site: { title: "Studio details & menu", hint: "Studio name, phone, email, social links, menu words, footer and the text Google shows.", glyph: "site", tint: ["#ff9aa2", "#e0556a"], w: 440, h: 640 },
  projects: { title: "Projects", hint: "Add, remove and edit your projects — posters, credits and descriptions.", glyph: "projects", tint: ["#c9a0ff", "#7b4be0"], w: 480, h: 720 },
  breakdowns: { title: "Breakdowns", hint: "Layered artworks that fall apart into labelled layers when someone hovers them.", glyph: "breakdowns", tint: ["#ffa56b", "#e0562a"], w: 480, h: 720 },
  slate: { title: "Title slate (3D glass)", hint: "The glass table of title cards: its words, cards, size and glass look.", glyph: "slate", tint: ["#9fe0ff", "#3b8be0"], w: 460, h: 720 },
  media: { title: "Images", hint: "Your picture library. Upload once, then pick the picture anywhere.", glyph: "media", tint: ["#7fe3c0", "#1fa57a"], w: 520, h: 600 },
  type: { title: "Fonts & text styles", hint: "Change the fonts, or the size, weight and colour of any text.", glyph: "type", tint: ["#f4f4f4", "#9a9aa5"], w: 460, h: 680 },
  background: { title: "Page background", hint: "The background colour, its gradient style, and the colours of each section.", glyph: "background", tint: ["#ff7eb3", "#7a3ad2"], w: 440, h: 700 },
  theme: { title: "Brand & glass", hint: "The gold accents, the text colour, the glass colours and the menu lamp colours.", glyph: "colours", tint: ["#ffbf80", "#e0563a"], w: 420, h: 480 },
  glass: { title: "Logo glass", hint: "The tinted glass over the stars and the soft shield behind the logo.", glyph: "glass", tint: ["#a8e6ff", "#4a7de0"], w: 420, h: 560 },
  colours: { title: "Star colours", hint: "Which colours the stars are, and how much of each.", glyph: "colours", tint: ["#ffd86b", "#ee6b4a"], w: 420, h: 520 },
  finish: { title: "Star look", hint: "How the stars shine: glow, size, metal and depth.", glyph: "finish", tint: ["#fff3a8", "#e8b04b"], w: 420, h: 680 },
  layers: { title: "Star groups", hint: "The front, back and big stars: how many and how large.", glyph: "layers", tint: ["#b9b2ff", "#5a4be0"], w: 440, h: 700 },
  motion: { title: "Star movement", hint: "How the stars drift, stream out of the logo and follow the mouse.", glyph: "motion", tint: ["#8fe9d8", "#1e9fb0"], w: 420, h: 620 },
  intro: { title: "Opening animation", hint: "The stars that fly in and draw the logo when the site opens.", glyph: "intro", tint: ["#ff8a8a", "#d23a5a"], w: 440, h: 700 },
  cursor: { title: "Cursor & glow", hint: "The pen that follows the mouse, and the glow when you hover.", glyph: "cursor", tint: ["#ffe28a", "#d9892a"], w: 420, h: 600 },
  playback: { title: "Preview controls", hint: "Replay the opening animation, or pause it on any moment to adjust.", glyph: "playback", tint: ["#d0d0d8", "#6a6a78"], w: 560, h: 250, small: true },
  account: { title: "People & passwords", hint: "Your username, email and password; who can sign in, their roles, and the email codes.", glyph: "account", tint: ["#9bb4c9", "#4a6075"], w: 560, h: 680 },
  inbox: { title: "Enquiries", hint: "Messages sent through the contact form on your site: read, reply, archive or delete them.", glyph: "inbox", tint: ["#ffd36a", "#e8742a"], w: 520, h: 680 },
  activity: { title: "Activity log", hint: "Who signed in, and what each person published, uploaded or changed.", glyph: "activity", tint: ["#9bc4ff", "#4a6075"], w: 520, h: 680 },
};

/** One taskbar item: its short name under the icon, and its colour (each group has its own). */
const dockItem = (id: Tab, short: string, tint: string, glyph?: string) => ({ id, label: WINDOWS[id].title, short, glyph: glyph ?? WINDOWS[id].glyph, tint: [tint, tint] as [string, string] });
const DOCK: DockGroup[] = [
  {
    name: "Pages",
    items: [
      dockItem("home", "Home", "#ffc566"),
      dockItem("work", "Work", "#ffc566"),
      dockItem("breakdowns", "Breakdowns", "#ffc566"),
      dockItem("slate", "Slate", "#ffc566"),
      dockItem("site", "Studio", "#ffc566"),
    ],
  },
  { name: "Library", items: [dockItem("media", "Images", "#7fe3c0"), dockItem("type", "Fonts", "#7fe3c0")] },
  { name: "Page look", items: [dockItem("background", "Backdrop", "#ff8fc0"), dockItem("theme", "Brand", "#ff8fc0", "drop"), dockItem("glass", "Logo glass", "#ff8fc0")] },
  { name: "Stars", items: [dockItem("colours", "Palette", "#ffe27a"), dockItem("finish", "Shine", "#ffe27a"), dockItem("layers", "Groups", "#ffe27a"), dockItem("motion", "Motion", "#ffe27a")] },
  { name: "Animation", items: [dockItem("intro", "Opening", "#ff9a8a"), dockItem("cursor", "Cursor", "#ff9a8a"), dockItem("playback", "Preview", "#ff9a8a")] },
  { name: "Studio", items: [dockItem("inbox", "Enquiries", "#9bc4ff"), dockItem("account", "People", "#9bc4ff"), dockItem("activity", "Activity", "#9bc4ff")] },
];

const DESIGN_WORDS: Partial<Record<Tab, string>> = {
  background: "background colour gradient dots bubbles waves silk halo style density section colours",
  theme: "brand colours colors accent gold bright text colour theme menu lamp spotlight nav glass gradient blur tint frost neon effect glow transparent purple blue",
  glass: "glass shield tint blur frost logo opacity",
  colours: "star colours colors mix share",
  finish: "stars glow size metal shine depth gold",
  layers: "stars front back big layers count blur corner",
  motion: "stars stream scroll cursor movement parallax speed",
  intro: "intro opening animation reveal sweep star timing loader",
  cursor: "cursor pen glow hover logo colour size",
  breakdowns: "breakdown breakdowns layers psd photoshop png layer explode labels hover how we work",
  slate: "slate glass slab cards table titles proof tint opacity frost reflection size scroll length add upload",
  media: "images pictures photos upload library files",
  type: "fonts typography typeface upload font file ttf otf woff size weight italic spacing text style headings paragraphs",
  playback: "play pause hold scrub timeline intro preview",
  account: "users people password login sign in security owner editor account username email reset forgot otp code two-step smtp gmail",
  inbox: "enquiries inbox contact form messages submissions leads email phone reply clients",
  activity: "activity log history audit who signed in logged in changes published uploaded when",
};

const fieldWords = (fields: Field[]): string[] =>
  fields.flatMap((f) => [f.label, ...(f.kind === "list" ? fieldWords(f.fields) : [])]);

/** Everything the search can find: each window, and each section of each content page with its field names. */
const SEARCH_ENTRIES: SpotEntry[] = [
  ...(Object.keys(WINDOWS) as Tab[]).map((id) => ({
    label: WINDOWS[id].title,
    sub: WINDOWS[id].hint,
    glyph: WINDOWS[id].glyph,
    keywords: DESIGN_WORDS[id] ?? "",
    tab: id,
  })),
  ...(["home", "work", "site", "slate", "projects"] as const).flatMap((page) =>
    CONTENT_PAGES[page].sections.map((sec) => ({
      label: sec.title,
      sub: `${WINDOWS[page].title} › ${sec.title}`,
      glyph: WINDOWS[page].glyph,
      keywords: fieldWords(sec.fields).join(" "),
      tab: page,
      section: sec.id,
    })),
  ),
];

/** Where "View ▸ Show" can take the preview: the site's parts, in page order. The preview itself can't be scrolled by hand. */
const JUMP_TO: { label: string; to: string; at?: "start" | "end" }[] = [
  { label: "Top of the page", to: "top" },
  { label: "About our agency", to: "agency" },
  { label: "Clients & collaborations", to: "clients" },
  { label: "About the founder", to: "about" },
  { label: "Projects slate", to: "collaborations", at: "end" },
  { label: "Project gallery", to: "work" },
  { label: "How we work", to: "process" },
  { label: "Our services", to: "services" },
  { label: "Contact us", to: "contact" },
];

/** Which editing window is open: a section of a page, one item of a list, or a whole page's settings. */
type ModalState = { kind: "section"; page: string; id: string; index?: number } | { kind: "item"; list: string; index: number } | { kind: "page"; page: string };

/** Lists whose items have their own Edit button on the page: the section window only manages them (add, reorder, delete). */
const ITEM_LISTS: ReadonlySet<string> = new Set(["projects", "services", "home.stats", "home.process.cards"]);

const HOME_ONLY = ["slate", "glass", "intro", "playback", "background"] as const;

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The settings that change the intro's layout (and need it restarted); everything else updates it live. */
function introLayout(s: IntroSettings) {
  return [
    s.enabled,
    s.formationCount,
    s.revealStyle,
    // The sweep's path (its look, texture included, updates live on the held frame).
    s.sweep.duration,
    s.sweep.direction,
    s.sweep.size,
    s.sweep.grow,
    s.sweep.spin,
    s.sweep.tilt,
    s.sweep.feather,
    s.introStarSize,
    s.starSize,
    s.spaceDepth,
    s.scatter,
    s.disperse,
    s.glowingShare,
    s.colors,
    s.field.count,
    s.field.size,
    s.front.count,
    s.front.size,
    s.stream.corners,
    s.introBlur > 0,
  ];
}

export function PortalEditor({
  initial,
  initialContent,
  user,
}: {
  initial: IntroSettings;
  initialContent: SiteContent;
  user: PortalUser;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  // A first-run (setup) sign-in goes straight to creating the owner account.
  const [dotsPage, setDotsPage] = useState<ColourTarget>("top");

  // Content (text, lists, projects, images, fonts) is saved separately from the design settings.
  const [contentSaved, setContentSaved] = useState(initialContent);
  const [contentDraft, setContentDraft] = useState(initialContent);
  const [images, setImages] = useState<string[]>([]);
  const [removable, setRemovable] = useState<string[]>([]);
  const contentRef = useRef(contentDraft);
  const sentContentRef = useRef<SiteContent | null>(null);
  useEffect(() => {
    contentRef.current = contentDraft;
  }, [contentDraft]);
  useEffect(() => {
    fetch("/api/portal/media")
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((d: { images?: string[]; removable?: string[] }) => {
        setImages(d.images ?? []);
        setRemovable(d.removable ?? []);
      })
      .catch(() => {});
  }, []);
  const media: MediaApi = {
    images,
    removable,
    remove: async (src) => {
      // "/images/uploads/x.webp" is stored as uploads/images/x.webp; a slate title "/images/proof-table/x.webp" as uploads/proof/x.webp.
      const key = src.startsWith("/images/uploads/") ? "uploads/images/" + src.slice("/images/uploads/".length) : "uploads/proof/" + src.slice("/images/proof-table/".length);
      const res = await fetch("/api/portal/storage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, confirmed: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn’t delete that picture.");
      setImages((list) => list.filter((x) => x !== src));
      setRemovable((list) => list.filter((x) => x !== src));
    },
    add: (src) => setImages((list) => (list.includes(src) ? list : [src, ...list])),
    upload: async (file, onProgress) => {
      const data = await postFile<{ src?: string }>("/api/portal/media", await prepareImage(file), onProgress);
      if (!data.src) throw new Error("Upload failed.");
      setImages((list) => (list.includes(data.src!) ? list : [data.src!, ...list]));
      return data.src;
    },
  };
  // Undo and redo for content edits. A burst of typing is one step; the state before the burst is what Undo returns to.
  const [history, setHistory] = useState({ past: [] as SiteContent[], future: [] as SiteContent[] });
  const historyAt = useRef(0);
  const updateContent = (fn: (c: SiteContent) => SiteContent) => {
    const before = contentRef.current;
    const now = Date.now();
    const newStep = now - historyAt.current > 600;
    historyAt.current = now;
    if (newStep) setHistory((h) => ({ past: [...h.past.slice(-99), before], future: [] }));
    else setHistory((h) => (h.future.length ? { ...h, future: [] } : h));
    setContentDraft((c) => fn(c));
    setSave({ kind: "idle" });
  };
  function undo() {
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    setHistory({ past: history.past.slice(0, -1), future: [...history.future, contentRef.current] });
    historyAt.current = 0;
    setContentDraft(prev);
    setSave({ kind: "idle" });
  }
  function redo() {
    const next = history.future[history.future.length - 1];
    if (!next) return;
    setHistory({ past: [...history.past, contentRef.current], future: history.future.slice(0, -1) });
    historyAt.current = 0;
    setContentDraft(next);
    setSave({ kind: "idle" });
  }

  // The taskbar chooses what you work on. Pages (Home, Work, Breakdowns…) switch the page in the preview, where every
  // section and item has an Edit button; everything else (stars, colours, fonts, account…) opens as a sheet over the
  // bottom of the preview, so the effect of a change is always in view. A first-run sign-in opens on the account.
  const [tab, setTab] = useState<Tab>(user.setup ? "account" : "home");
  const [sheetOpen, setSheetOpen] = useState(!!user.setup);
  /** Whether the preview shows its Edit buttons. */
  const [editMode, setEditMode] = useState(true);
  const editRef = useRef(true);
  /** The editing window that is open, and the content as it was when it opened (Cancel returns to it). */
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalSnap, setModalSnap] = useState<SiteContent | null>(null);
  const openModal = (m: ModalState) => {
    setModalSnap(contentRef.current);
    setModal(m);
  };

  /** The "＋ Add" button under a list on the page: adds a new, blank item to that list and opens it to fill in (Cancel takes it away again). */
  const addItemRef = useRef<(list: string) => void>(() => {});
  useEffect(() => {
    addItemRef.current = (list) => {
      const def = findList(list);
      const items = getAt(contentRef.current, list) as unknown[] | undefined;
      if (!def || !Array.isArray(items) || (def.max && items.length >= def.max)) return;
      const index = items.length;
      openModal({ kind: "item", list, index });
      updateContent((c) => setAt(c, list, [...((getAt(c, list) as unknown[]) ?? []), def.blank()]));
    };
  });

  /** How many enquiries nobody has read yet: shown on the Enquiries icon. */
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (user.setup) return;
    let alive = true;
    const load = () =>
      fetch("/api/portal/inbox", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { enquiries?: { status: string }[] } | null) => alive && d?.enquiries && setUnread(d.enquiries.filter((e) => e.status === "new").length))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user.setup]);

  const [spotlight, setSpotlight] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "phone">("desktop");
  /** Which page the live preview shows: it follows the page whose settings are open. */
  const [previewRoute, setPreviewRoute] = useState<PageKey>("home");
  /** The project whose own page the preview shows when you go inside one. */
  const [previewProject, setPreviewProject] = useState("");
  const projectSlug = contentSaved.projects.some((p) => p.slug === previewProject) ? previewProject : (contentSaved.projects[0]?.slug ?? "");
  const previewPath =
    previewRoute === "work" ? "/work" : previewRoute === "breakdowns" ? "/breakdowns" : previewRoute === "project" ? `/work/${projectSlug}` : previewRoute === "notFound" ? "/page-not-found-preview" : "/";
  const breakdownsOpen = previewRoute === "breakdowns";
  const undoRef = useRef(() => {});
  const redoRef = useRef(() => {});
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });
  const [goto] = useState<{ tab: Tab; section: string; n: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlight((v) => !v);
        return;
      }
      // Undo / redo of content edits (inside a text box the browser's own undo is used).
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const settingsDirty = !same(saved, draft);
  const contentDirty = !same(contentSaved, contentDraft);
  const dirty = settingsDirty || contentDirty;

  // --- preview ------------------------------------------------------------------------
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [holding, setHolding] = useState(false);
  const runRef = useRef<PreviewRun>({ key: 0, at: 0, paused: false, seed: 7 });
  const sentRef = useRef<IntroSettings | null>(null);
  const playheadRef = useRef(0);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const send = useCallback((msg: PortalToSite) => {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  const startRun = useCallback(
    (at: number, paused: boolean, seed = runRef.current.seed) => {
      runRef.current = { key: runRef.current.key + 1, at, paused, seed };
      playheadRef.current = at;
      setPlayhead(at);
      setHolding(paused);
      send({ source: "dds-portal", type: "run", run: runRef.current });
    },
    [send],
  );

  // Dragging the timeline rebuilds the held frame at most ~8 times a second; the last position always lands.
  const scrubRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    at: number;
  }>({ timer: null, at: 0 });
  const scrubTo = useCallback(
    (at: number) => {
      const scrub = scrubRef.current;
      scrub.at = at;
      playheadRef.current = at;
      setPlayhead(at);
      if (scrub.timer) return;
      startRun(at, true);
      scrub.timer = setTimeout(() => {
        scrub.timer = null;
        if (scrub.at !== runRef.current.at) startRun(scrub.at, true);
      }, 120);
    },
    [startRun],
  );

  // Messages from the preview page. When it says it's ready, hand it the current draft and play from the top.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data as SiteToPortal;
      if (msg?.source !== "dds-site") return;
      if (msg.type === "ready") {
        sentRef.current = draftRef.current;
        send({
          source: "dds-portal",
          type: "settings",
          settings: draftRef.current,
        });
        sentContentRef.current = contentRef.current;
        send({ source: "dds-portal", type: "content", content: contentRef.current });
        startRun(T.end, false); // the preview opens on the page itself: the logo and the stars, no opening animation
        send({ source: "dds-portal", type: "edit-mode", on: editRef.current });
        setReady(true);
      }
      if (msg.type === "time") {
        playheadRef.current = msg.t;
        setPlayhead(msg.t);
      }
      if (msg.type === "edit-add") addItemRef.current(msg.list);
      if (msg.type === "edit-open") {
        // An Edit button on the preview: "home:founder" is a section, "projects.3" is one item.
        if ("section" in msg) {
          const [page, id] = msg.section.split(":");
          openModal({ kind: "section", page, id });
        } else {
          const m = /^(.+)\.(\d+)$/.exec(msg.item);
          if (m && m[1] === "breakdowns") openModal({ kind: "section", page: "breakdowns", id: "all", index: Number(m[2]) });
          else if (m) openModal({ kind: "item", list: m[1], index: Number(m[2]) });
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, startRun]);

  useEffect(() => {
    editRef.current = editMode;
    if (ready) send({ source: "dds-portal", type: "edit-mode", on: editMode });
  }, [editMode, ready, send]);

  useEffect(() => {
    // Leaving the Breakdowns screen also closes the viewer inside the preview.
    if (!breakdownsOpen && ready) send({ source: "dds-portal", type: "breakdown", index: null });
  }, [breakdownsOpen, ready, send]);

  // Every change shows up in the preview as you make it: the page and lasting stars update live, and the intro
  // re-renders the moment you're looking at (held, so you can compare). Updates go out at most every ~45 ms and always
  // carry the latest value, so dragging a slider or typing never waits for you to stop, and never floods the preview.
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || sentRef.current === draft || settingsTimer.current) return;
    settingsTimer.current = setTimeout(() => {
      settingsTimer.current = null;
      const latest = draftRef.current;
      const previous = sentRef.current;
      if (previous === latest) return;
      sentRef.current = latest;
      send({ source: "dds-portal", type: "settings", settings: latest });
      if (playheadRef.current >= T.fadeStart) return; // on the page: it and its stars already reflect the change
      if (previous && same(introLayout(previous), introLayout(latest))) return; // shown live, no restart needed
      startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), true);
    }, 45);
  }, [draft, ready, send, startRun]);

  // Content edits show up in the preview as you type.
  useEffect(() => {
    if (!ready || sentContentRef.current === contentDraft || contentTimer.current) return;
    contentTimer.current = setTimeout(() => {
      contentTimer.current = null;
      const latest = contentRef.current;
      if (sentContentRef.current === latest) return;
      sentContentRef.current = latest;
      send({ source: "dds-portal", type: "content", content: latest });
    }, 45);
  }, [contentDraft, ready, send]);
  useEffect(
    () => () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
      if (contentTimer.current) clearTimeout(contentTimer.current);
    },
    [],
  );

  // The preview follows what you're editing: opening a page (or picking the background's colour target) moves the
  // preview to that part of the site.
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showInPreview(next: ReturnType<typeof previewFocus>) {
    if (!ready || !next) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    if (next.intro) {
      send({ source: "dds-portal", type: "scroll", to: "top" });
      startRun(0, false);
      return;
    }
    // Off the intro and onto the page first (the intro holds the page at the top), then glide there.
    const onPage = playheadRef.current >= T.fadeStart;
    if (!onPage) startRun(T.end, false);
    focusTimer.current = setTimeout(
      () => send({ source: "dds-portal", type: "scroll", to: next.to, at: next.at }),
      onPage ? 0 : 700,
    );
  }
  /** The pages the taskbar switches between; every other item opens as a sheet. */
  const PAGE_TABS: Partial<Record<Tab, PageKey>> = { home: "home", work: "work", projects: "work", breakdowns: "breakdowns" };
  /** Choose a taskbar item. */
  function selectTab(id: Tab) {
    const page = PAGE_TABS[id];
    if (page) {
      setPreviewRoute(page);
      setTab(id);
      setSheetOpen(false);
      setEditMode(true);
      return;
    }
    if (id === "site") {
      setSheetOpen(false);
      openModal({ kind: "page", page: "site" });
      return;
    }
    if (id === tab && sheetOpen) {
      setSheetOpen(false); // the same item again folds its sheet away
      return;
    }
    // These belong to the home page (its logo, slate, opening and per-part colours): show it.
    if ((HOME_ONLY as readonly string[]).includes(id) && previewRoute !== "home") setPreviewRoute("home");
    setTab(id);
    setSheetOpen(true);
    showInPreview(previewFocus(id, dotsPage));
  }
  // Don't lose unsaved work by accident.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // --- editing ------------------------------------------------------------------------
  function update(patch: Partial<IntroSettings>) {
    setDraft((d) => ({ ...d, ...patch }));
    setSave({ kind: "idle" });
  }
  function updateField(patch: Partial<FieldSettings>) {
    setDraft((d) => ({ ...d, field: { ...d.field, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateStream(patch: Partial<IntroSettings["stream"]>) {
    setDraft((d) => ({ ...d, stream: { ...d.stream, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateLogoGlow(patch: Partial<IntroSettings["logoGlow"]>) {
    setDraft((d) => ({ ...d, logoGlow: { ...d.logoGlow, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateCursor(patch: Partial<IntroSettings["cursor"]>) {
    setDraft((d) => ({ ...d, cursor: { ...d.cursor, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateDial(patch: Partial<IntroSettings["dial"]>) {
    setDraft((d) => ({ ...d, dial: { ...d.dial, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateDots(target: ColourTarget, which: "a" | "b", hex: string) {
    setDraft((d) => {
      if (target === "work" || target === "project") {
        return { ...d, art: { ...d.art, dots: { ...d.art.dots, [target]: { ...d.art.dots[target], [which]: hex } } } };
      }
      return { ...d, art: { ...d.art, sections: { ...d.art.sections, [target]: { ...d.art.sections[target], [which]: hex } } } };
    });
    setSave({ kind: "idle" });
  }
  function updateArt(patch: Partial<IntroSettings["art"]>) {
    setDraft((d) => ({ ...d, art: { ...d.art, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateFront(patch: Partial<IntroSettings["front"]>) {
    setDraft((d) => ({ ...d, front: { ...d.front, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateColor(index: number, patch: Partial<{ hex: string; share: number }>) {
    update({
      colors: draft.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  }

  async function publish() {
    setSave({ kind: "saving" });
    try {
      if (settingsDirty) {
        const res = await fetch("/api/portal/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) router.refresh();
          setSave({ kind: "error", message: body.error ?? "Couldn’t save. Try again." });
          return;
        }
        const next = sanitizeIntroSettings(body.settings);
        if (same(next, draft)) sentRef.current = next; // the preview already shows exactly this
        setSaved(next);
        setDraft(next);
      }
      if (contentDirty) {
        const res = await fetch("/api/portal/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contentDraft),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) router.refresh();
          setSave({ kind: "error", message: body.error ?? "Couldn’t save the content. Try again." });
          return;
        }
        const next = sanitizeContent(body.content);
        sentContentRef.current = null; // let the preview pick up any tidying the server did
        setContentSaved(next);
        setContentDraft(next);
      }
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: "Couldn’t reach the server. Check the connection and try again." });
    }
  }

  async function signOut() {
    await fetch("/api/portal/session", { method: "DELETE" });
    router.refresh();
  }

  const fractions = colorFractions(draft.colors);

  /** The two background colours of a part of the page, shown at the foot of that part's editing window. */
  const artExtra = (s: { art?: ColourTarget }) =>
    s.art ? (
      <Section title="Background colours" scope="Page" hint="The two colours the dots and bubbles take in this part of the page.">
        <ColorRow label="Colour A" value={colourPair(draft, s.art).a} onChange={(hex) => updateDots(s.art!, "a", hex)} />
        <ColorRow label="Colour B" value={colourPair(draft, s.art).b} onChange={(hex) => updateDots(s.art!, "b", hex)} />
      </Section>
    ) : null;

  const renderPanel = (tab: Tab) => (
    <>
          {tab === "background" && (
            <>
              <Section
                id="layer-background"
                tag="Layer 5"
                title="Background"
                scope="Intro & page"
                hint="The colour behind everything — plain, or a premium gradient with sweeping curves and fine gold lines."
              >
                <div className={styles.control}>
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Background colour</span>
                    <span className={styles.colorField}>
                      <input
                        type="color"
                        aria-label="Background colour"
                        className={styles.swatch}
                        value={draft.background}
                        onChange={(e) => update({ background: e.target.value })}
                      />
                      <HexInput
                        value={draft.background}
                        label="Background colour code"
                        onChange={(hex) => update({ background: hex })}
                      />
                    </span>
                  </div>
                </div>
                <Toggle
                  label="Premium gradient"
                  hint="Off: the plain background colour."
                  checked={draft.art.enabled}
                  onChange={(enabled) => updateArt({ enabled })}
                />
                {draft.art.enabled && (
                  <>
                    <Choice
                      label="Style"
                      value={draft.art.style}
                      options={[
                        { value: "waves", label: "Waves" },
                        { value: "silk", label: "Silk" },
                        { value: "halo", label: "Halo" },
                        { value: "minimal", label: "Minimal" },
                        { value: "dots", label: "Dots" },
                        { value: "bubbles", label: "Bubbles" },
                      ]}
                      onChange={(style) => updateArt({ style })}
                    />
                    {draft.art.style === "bubbles" && (
                      <>
                        <Slider
                          label="Number of bubbles"
                          value={draft.art.bubbles.count}
                          min={0.05}
                          max={0.95}
                          step={0.05}
                          format={percent}
                          onChange={(count) => updateArt({ bubbles: { ...draft.art.bubbles, count } })}
                        />
                        <Slider
                          label="Bubble size"
                          value={draft.art.bubbles.size}
                          min={0.3}
                          max={2}
                          step={0.05}
                          format={percent}
                          onChange={(size) => updateArt({ bubbles: { ...draft.art.bubbles, size } })}
                        />
                      </>
                    )}
                    {draft.art.style === "dots" && (
                      <>
                        <Slider
                          label="Dot density"
                          value={draft.art.dotGrid.density}
                          min={0.4}
                          max={2}
                          step={0.05}
                          format={percent}
                          hint="How tightly the dots are packed."
                          onChange={(density) => updateArt({ dotGrid: { ...draft.art.dotGrid, density } })}
                        />
                        <Slider
                          label="Dot size"
                          value={draft.art.dotGrid.size}
                          min={0.3}
                          max={2.5}
                          step={0.05}
                          format={percent}
                          onChange={(size) => updateArt({ dotGrid: { ...draft.art.dotGrid, size } })}
                        />
                      </>
                    )}
                    {(draft.art.style === "dots" || draft.art.style === "bubbles") && (
                      <>
                        <div className={styles.control}>
                          <div className={styles.controlRow}>
                            <label htmlFor="colour-target" className={styles.controlLabel}>
                              Colours for
                            </label>
                            <select
                              id="colour-target"
                              className={styles.select}
                              value={dotsPage}
                              onChange={(e) => {
                                const target = e.target.value as ColourTarget;
                                setDotsPage(target);
                                showInPreview(previewFocus(tab, target));
                              }}
                            >
                              <optgroup label="Home page sections">
                                {ART_SECTIONS.map((id) => (
                                  <option key={id} value={id}>
                                    {SECTION_NAMES[id]}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Other pages">
                                <option value="work">Work gallery</option>
                                <option value="project">Project pages</option>
                              </optgroup>
                            </select>
                          </div>
                          <p className={styles.controlHint}>
                            Each section and page has its own two colours. On the home page, neighbouring sections blend smoothly
                            into each other as you scroll.
                          </p>
                        </div>
                        {(["a", "b"] as const).map((which) => (
                          <div key={which} className={styles.control}>
                            <div className={styles.controlRow}>
                              <span className={styles.controlLabel}>{which === "a" ? "Left colour" : "Right colour"}</span>
                              <span className={styles.colorField}>
                                <input
                                  type="color"
                                  aria-label={`Dots ${which === "a" ? "left" : "right"} colour`}
                                  className={styles.swatch}
                                  value={colourPair(draft, dotsPage)[which]}
                                  onChange={(e) => updateDots(dotsPage, which, e.target.value)}
                                />
                                <HexInput
                                  value={colourPair(draft, dotsPage)[which]}
                                  label={`Dots ${which === "a" ? "left" : "right"} colour code`}
                                  onChange={(hex) => updateDots(dotsPage, which, hex)}
                                />
                              </span>
                            </div>
                          </div>
                        ))}
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={() =>
                              updateArt({
                                dots: {
                                  home: colourPair(draft, dotsPage),
                                  work: colourPair(draft, dotsPage),
                                  project: colourPair(draft, dotsPage),
                                },
                                sections: Object.fromEntries(
                                  ART_SECTIONS.map((id) => [id, colourPair(draft, dotsPage)]),
                                ) as IntroSettings["art"]["sections"],
                              })
                            }
                          >
                            Use these colours on every page
                          </button>
                        </div>
                      </>
                    )}
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => updateArt({ seed: Math.floor(Math.random() * 1e9) })}
                      >
                        ⟳ New arrangement
                      </button>
                    </div>
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Light colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Gradient second colour"
                            className={styles.swatch}
                            value={draft.art.tone}
                            onChange={(e) => updateArt({ tone: e.target.value })}
                          />
                          <HexInput
                            value={draft.art.tone}
                            label="Gradient second colour code"
                            onChange={(tone) => updateArt({ tone })}
                          />
                        </span>
                      </div>
                      <p className={styles.controlHint}>The light end of the gradient and the raised bands.</p>
                    </div>
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Shadow colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Gradient shadow colour"
                            className={styles.swatch}
                            value={draft.art.shadow}
                            onChange={(e) => updateArt({ shadow: e.target.value })}
                          />
                          <HexInput
                            value={draft.art.shadow}
                            label="Gradient shadow colour code"
                            onChange={(shadow) => updateArt({ shadow })}
                          />
                        </span>
                      </div>
                      <p className={styles.controlHint}>The dark end. The background colour sits between the two.</p>
                    </div>
                    <Dial
                      label="Rotation"
                      hint="Turn the whole design. Drag the dial, use the arrow keys, or pick a preset."
                      value={draft.art.rotation}
                      onChange={(rotation) => updateArt({ rotation })}
                    />
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Line colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Line colour"
                            className={styles.swatch}
                            value={draft.art.gold}
                            onChange={(e) => updateArt({ gold: e.target.value })}
                          />
                          <HexInput value={draft.art.gold} label="Line colour code" onChange={(gold) => updateArt({ gold })} />
                        </span>
                      </div>
                    </div>
                    <Slider
                      label="Gold lines"
                      value={draft.art.lines}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Off" : percent(v))}
                      onChange={(lines) => updateArt({ lines })}
                    />
                    <Slider
                      label="Shadow depth"
                      value={draft.art.depth}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      hint="How deep the shadows, folds and vignette go."
                      onChange={(depth) => updateArt({ depth })}
                    />
                    <Slider
                      label="Gradient movement"
                      value={draft.art.motion}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Still" : percent(v))}
                      onChange={(motion) => updateArt({ motion })}
                    />
                    <Slider
                      label="Gradient softness"
                      value={draft.art.softPage}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Crisp" : percent(v))}
                      hint="How soft the lines and edges are. (The glass adds its own blur on top.)"
                      onChange={(softPage) => updateArt({ softPage, softIntro: softPage })}
                    />
                  </>
                )}
              </Section>
            </>
          )}

          {tab === "glass" && (
            <>
              <Section
                id="layer-glass"
                tag="Layer 2"
                title="Tinted glass"
                scope="Intro & page"
                hint="Between the front and back stars, so the logo stands forward."
              >
                <div className={styles.control}>
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Glass tint</span>
                    <span className={styles.colorField}>
                      <input
                        type="color"
                        aria-label="Glass tint"
                        className={styles.swatch}
                        value={draft.glassColor}
                        onChange={(e) => update({ glassColor: e.target.value })}
                      />
                      <HexInput
                        value={draft.glassColor}
                        label="Glass tint code"
                        onChange={(hex) => update({ glassColor: hex })}
                      />
                    </span>
                  </div>
                </div>
                <Slider
                  label="Glass darkness"
                  value={draft.glassOpacity}
                  min={0}
                  max={0.85}
                  step={0.01}
                  format={percent}
                  hint="How strongly the glass darkens the stars behind it, so the logo stands forward."
                  onChange={(glassOpacity) => update({ glassOpacity })}
                />
                <Slider
                  label="Glass blur"
                  value={draft.glassFrost}
                  min={0}
                  max={8}
                  step={0.5}
                  format={(v) => (v === 0 ? "Clear" : `${v.toFixed(1)} px`)}
                  hint="How frosted the glass is."
                  onChange={(glassFrost) => update({ glassFrost })}
                />
              </Section>

              <Section
                id="layer-dial"
                title="Logo shield"
                scope="Intro & page"
                hint="A soft pool of dark glass behind the logo, so nothing behind it competes with the logo."
              >
                <Toggle
                  label="Dark glass behind the logo"
                  checked={draft.dial.enabled}
                  onChange={(enabled) => updateDial({ enabled })}
                />
                {draft.dial.enabled && (
                  <>
                    <Slider
                      label="Size"
                      value={draft.dial.size}
                      min={0.2}
                      max={0.7}
                      step={0.01}
                      format={percent}
                      onChange={(size) => updateDial({ size })}
                    />
                    <Slider
                      label="Darkness"
                      value={draft.dial.darkness}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      onChange={(darkness) => updateDial({ darkness })}
                    />
                  </>
                )}
              </Section>
            </>
          )}

          {tab === "colours" && (
            <>
              <Section
                title="Star colours"
                scope="Intro & page"
                hint="Set each colour’s share with its slider — the ratio below shows how the stars are split."
              >
                <p className={styles.ratio}>
                  Ratio{" "}
                  {draft.colors.map((c, i) => (
                    <span key={i}>
                      {i > 0 && " : "}
                      <span style={{ color: c.hex }}>{Math.round(fractions[i] * 100)}</span>
                    </span>
                  ))}
                </p>
                <div className={styles.mixBar} aria-hidden="true">
                  {draft.colors.map((c, i) => (
                    <span key={i} style={{ background: c.hex, flexGrow: fractions[i] }} />
                  ))}
                </div>
                <ul className={styles.colorList}>
                  {draft.colors.map((c, i) => (
                    <li key={i} className={styles.colorRow}>
                      <input
                        type="color"
                        aria-label={`Colour ${i + 1}`}
                        className={styles.swatch}
                        value={c.hex}
                        onChange={(e) => updateColor(i, { hex: e.target.value })}
                      />
                      <HexInput value={c.hex} label={`Colour ${i + 1} code`} onChange={(hex) => updateColor(i, { hex })} />
                      <input
                        type="range"
                        aria-label={`Colour ${i + 1} share`}
                        className={styles.range}
                        min={LIMITS.colorShare[0]}
                        max={LIMITS.colorShare[1]}
                        step={1}
                        value={c.share}
                        style={{ "--fill": `${c.share}%` } as React.CSSProperties}
                        onChange={(e) => updateColor(i, { share: Number(e.target.value) })}
                      />
                      <span className={styles.share}>{Math.round(fractions[i] * 100)}%</span>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Remove colour ${i + 1}`}
                        disabled={draft.colors.length <= LIMITS.colorCount[0]}
                        onClick={() =>
                          update({
                            colors: draft.colors.filter((_, k) => k !== i),
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={styles.inlineActions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={draft.colors.length >= LIMITS.colorCount[1]}
                    onClick={() => {
                      const hex = NEW_COLORS.find((h) => !draft.colors.some((c) => c.hex === h)) ?? "#ffffff";
                      update({ colors: [...draft.colors, { hex, share: 25 }] });
                    }}
                  >
                    + Add colour
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={draft.colors.length < 2}
                    onClick={() =>
                      update({
                        colors: draft.colors.map((c) => ({ ...c, share: 50 })),
                      })
                    }
                  >
                    Even split
                  </button>
                </div>
              </Section>
            </>
          )}

          {tab === "finish" && (
            <>
              <Section
                title="Star finish"
                scope="Intro & page"
                hint="How the stars on the page look. (The intro’s stars have their own size, texture and shine under Intro; big stars under Stars.)"
              >
                <Slider
                  label={draft.glowLinked ? "Glow · intro & page" : "Glow · intro"}
                  value={draft.glow}
                  min={LIMITS.glow[0]}
                  max={LIMITS.glow[1]}
                  step={0.05}
                  format={percent}
                  hint="100% is the original intro’s glow."
                  onChange={(glow) => update({ glow })}
                />
                <Toggle
                  label="Same glow on the page"
                  hint="Off: set the glow of the stars on the page (after the reveal) separately."
                  checked={draft.glowLinked}
                  onChange={(glowLinked) => update({ glowLinked, pageGlow: draft.glow })}
                />
                {!draft.glowLinked && (
                  <Slider
                    label="Glow · page"
                    value={draft.pageGlow}
                    min={LIMITS.glow[0]}
                    max={LIMITS.glow[1]}
                    step={0.05}
                    format={percent}
                    hint="The stars behind and in front of the glass, after the intro. They ease into it after the hand-off."
                    onChange={(pageGlow) => update({ pageGlow })}
                  />
                )}
                <div className={styles.control}>
                  <div className={styles.controlRow}>
                    <span className={styles.controlLabel}>Glow colour</span>
                    <span className={styles.colorField}>
                      <input
                        type="color"
                        aria-label="Glow colour"
                        className={styles.swatch}
                        value={draft.glowColor}
                        disabled={draft.glowMatchStar}
                        onChange={(e) => update({ glowColor: e.target.value })}
                      />
                      <HexInput value={draft.glowColor} label="Glow colour code" onChange={(hex) => update({ glowColor: hex })} />
                    </span>
                  </div>
                  <p className={styles.controlHint}>The glints on the stars, the glitter, and the light of the reveal wave.</p>
                </div>
                <Slider
                  label="Glowing stars"
                  value={draft.glowingShare}
                  min={LIMITS.glowingShare[0]}
                  max={LIMITS.glowingShare[1]}
                  step={1}
                  format={(v) => `${Math.round(v)}% of stars`}
                  onChange={(glowingShare) => update({ glowingShare })}
                />
                <Slider
                  label="Star size"
                  value={draft.starSize}
                  min={LIMITS.starSize[0]}
                  max={LIMITS.starSize[1]}
                  step={0.05}
                  format={percent}
                  onChange={(starSize) => update({ starSize })}
                />
                <Slider
                  label="Facet depth"
                  value={draft.starDepth}
                  min={LIMITS.starDepth[0]}
                  max={LIMITS.starDepth[1]}
                  step={0.05}
                  format={percent}
                  hint="How deeply each star’s facets are cut."
                  onChange={(starDepth) => update({ starDepth })}
                />
                <Slider
                  label="Metallic texture"
                  value={draft.metallic}
                  min={LIMITS.metallic[0]}
                  max={LIMITS.metallic[1]}
                  step={0.05}
                  format={percent}
                  hint="Brushed, spun-metal grain on the facets."
                  onChange={(metallic) => update({ metallic })}
                />
                <Slider
                  label="Shine"
                  value={draft.shine}
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  format={percent}
                  hint="How strongly the metal reflects light. Lower it if the stars look too bright, without losing the glints."
                  onChange={(shine) => update({ shine })}
                />
              </Section>
            </>
          )}

          {tab === "layers" && (
            <>
              <nav className={styles.layerMap} aria-label="Layers, front to back">
                <p className={styles.layerMapTitle}>Layers · front to back</p>
                <ol>
                  <li className={styles.layerFixed}>
                    <span className={styles.layerNum}>★</span>
                    <span className={styles.layerName}>Logo &amp; page content</span>
                    <span className={styles.layerInfo}>always on top</span>
                  </li>
                  {[
                    {
                      id: "layer-front",
                      name: "Front stars",
                      info: draft.front.count
                        ? `${draft.front.count} · ${draft.front.blur ? `${draft.front.blur}px blur` : "sharp"}`
                        : "off",
                    },
                    {
                      id: "layer-glass",
                      name: "Tinted glass",
                      info: draft.glassOpacity ? `${Math.round(draft.glassOpacity * 100)}% · ${draft.glassFrost}px blur` : "off",
                    },
                    {
                      id: "layer-back",
                      name: "Back stars",
                      info: draft.field.count
                        ? `${draft.field.count} · depth blur ${Math.round(draft.field.depthBlur * 100)}%`
                        : "off",
                    },
                    {
                      id: "layer-corner",
                      name: "Big stars",
                      info: draft.field.cornerStars
                        ? `${draft.field.cornerStars} · ${Math.round(draft.field.cornerSize * 100)}%`
                        : "off",
                    },
                    {
                      id: "layer-background",
                      name: "Background",
                      info: draft.art.enabled ? `${draft.art.style} gradient` : draft.background,
                    },
                  ].map((l, i) => (
                    <li key={l.id}>
                      <a
                        href={`#${l.id}`}
                        className={styles.layerLink}
                        onClick={() =>
                          selectTab(l.id === "layer-glass" ? "glass" : l.id === "layer-background" ? "background" : "layers")
                        }
                      >
                        <span className={styles.layerNum}>{i + 1}</span>
                        <span className={styles.layerName}>{l.name}</span>
                        <span className={styles.layerInfo}>{l.info}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <Section
                id="layer-front"
                tag="Layer 1"
                title="Front stars"
                scope="Intro & page"
                hint="In front of the glass: nearer the screen, so bigger — and sharp unless you soften them."
              >
                <Slider
                  label="Front stars"
                  value={draft.front.count}
                  min={0}
                  max={40}
                  step={1}
                  format={(v) => (v === 0 ? "None" : String(Math.round(v)))}
                  onChange={(count) => updateFront({ count })}
                />
                <Slider
                  label="Front star blur"
                  value={draft.front.blur}
                  min={0}
                  max={6}
                  step={0.5}
                  format={(v) => (v === 0 ? "Sharp" : `${v.toFixed(1)} px`)}
                  hint="Soften the front stars for a shallower, more cinematic focus."
                  onChange={(blur) => updateFront({ blur })}
                />
                <Slider
                  label="Front star size"
                  value={draft.front.size}
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  format={percent}
                  onChange={(size) => updateFront({ size })}
                />
              </Section>

              <Section
                id="layer-back"
                tag="Layer 3"
                title="Back stars"
                scope="Intro & page"
                hint="Behind the glass, spread deep into the background."
              >
                <Slider
                  label="Back stars"
                  value={draft.field.count}
                  min={LIMITS.fieldCount[0]}
                  max={LIMITS.fieldCount[1]}
                  step={1}
                  format={(v) => (v === 0 ? "None" : String(Math.round(v)))}
                  onChange={(count) => updateField({ count })}
                />
                <Slider
                  label="Back star size"
                  value={draft.field.size}
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  format={percent}
                  hint="Nearer back stars are still drawn bigger than farther ones."
                  onChange={(size) => updateField({ size })}
                />
                <Slider
                  label="Distance blur"
                  value={draft.field.depthBlur}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Near stars stay crisp; farther ones go soft."
                  onChange={(depthBlur) => updateField({ depthBlur })}
                />
              </Section>

              <Section
                id="layer-corner"
                tag="Layer 4"
                title="Big stars"
                scope="Intro & page"
                hint="One or two big stars peeking in from the corners, turning slowly behind the glass."
              >
                <Slider
                  label="Number of big stars"
                  value={draft.field.cornerStars}
                  min={0}
                  max={2}
                  step={1}
                  format={(v) => (v === 0 ? "None" : v === 1 ? "1 · bottom left" : "2 · both corners")}
                  onChange={(cornerStars) => updateField({ cornerStars })}
                />
                <Slider
                  label="Big star size"
                  value={draft.field.cornerSize}
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  format={percent}
                  onChange={(cornerSize) => updateField({ cornerSize })}
                />
                <Slider
                  label="Big star shine"
                  value={draft.bigShine}
                  min={0.2}
                  max={1.8}
                  step={0.05}
                  format={percent}
                  hint="How strongly their gold reflects light."
                  onChange={(bigShine) => update({ bigShine })}
                />
                <Slider
                  label="Big star glow"
                  value={draft.bigGlow}
                  min={0}
                  max={2}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Their glints, and the glow the hero star builds as it shivers on the logo."
                  onChange={(bigGlow) => update({ bigGlow })}
                />
              </Section>
            </>
          )}

          {tab === "motion" && (
            <>
              <Section
                title="Movement"
                scope="Intro & page"
                hint="At the top, stars stream out of the core behind the logo; as you scroll on, drifting stars take over."
              >
                <>
                  <Slider
                    label="Stream speed"
                    value={draft.stream.speed}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    onChange={(speed) => updateStream({ speed })}
                  />
                  <Slider
                    label="Tumble"
                    value={draft.stream.spin}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    hint="How fast each star tumbles on its way out."
                    onChange={(spin) => updateStream({ spin })}
                  />
                  <Slider
                    label="Flips"
                    value={draft.stream.flips}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(v) => (v === 0 ? "Never" : percent(v))}
                    hint="How often a star flips right over."
                    onChange={(flips) => updateStream({ flips })}
                  />
                  <Slider
                    label="Pull toward corners"
                    value={draft.stream.corners}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(v) => (v === 0 ? "Evenly all round" : percent(v))}
                    hint="Pull the rays toward the screen's corners rather than straight out to the sides."
                    onChange={(corners) => updateStream({ corners })}
                  />
                </>
                <Slider
                  label="Drift when scrolling"
                  value={draft.field.motion}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  onChange={(motion) => updateField({ motion })}
                />
                <Slider
                  label="Cursor ripples"
                  value={draft.field.cursor}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  hint="Moving the cursor sends soft ripples through the stars."
                  onChange={(cursor) => updateField({ cursor })}
                />
              </Section>
            </>
          )}

          {tab === "intro" && (
            <>
              <Section title="Intro" scope="Intro" hint="The stars that fly in and draw the logo.">
                <Choice
                  label="Logo reveal"
                  value={draft.revealStyle}
                  options={[
                    { value: "wave", label: "Wave" },
                    { value: "glow", label: "Glow" },
                    { value: "sweep", label: "Sweep" },
                  ]}
                  hint={
                    draft.revealStyle === "wave"
                      ? "Light ripples out from the star through the letters, revealing the logo."
                      : draft.revealStyle === "glow"
                        ? "The whole logo lights up from within in a warm glow, then settles into its gold."
                        : "A big gold star sweeps across in front of the logo, turning as it goes, and the finished logo appears behind it."
                  }
                  onChange={(revealStyle) => update({ revealStyle })}
                />
                <Toggle
                  label="Play the intro on the home page"
                  hint="When off, the home page opens straight onto the logo."
                  checked={draft.enabled}
                  onChange={(enabled) => update({ enabled })}
                />
                <Slider
                  label="Logo stars"
                  value={draft.formationCount}
                  min={LIMITS.formationCount[0]}
                  max={LIMITS.formationCount[1]}
                  step={50}
                  format={(v) => String(Math.round(v))}
                  onChange={(formationCount) => update({ formationCount })}
                />
                <Slider
                  label="Logo star size"
                  value={draft.introStarSize}
                  min={0.3}
                  max={1.6}
                  step={0.05}
                  format={percent}
                  hint="Smaller stars and fewer of them make a lighter, less crowded logo."
                  onChange={(introStarSize) => update({ introStarSize })}
                />
                <Slider
                  label="Intro star texture"
                  value={draft.introMetallic}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Smooth" : percent(v))}
                  hint="Brushed-metal grain on the intro's stars."
                  onChange={(introMetallic) => update({ introMetallic })}
                />
                <Slider
                  label="Intro star shine"
                  value={draft.introShine}
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  format={percent}
                  hint="How strongly the intro's stars reflect light — lower for a calmer, less heavy intro."
                  onChange={(introShine) => update({ introShine })}
                />
                <Slider
                  label="Depth of space"
                  value={draft.spaceDepth}
                  min={LIMITS.spaceDepth[0]}
                  max={LIMITS.spaceDepth[1]}
                  step={0.05}
                  format={percent}
                  hint="How far behind and in front of the logo the stars spread."
                  onChange={(spaceDepth) => update({ spaceDepth })}
                />
                <Slider
                  label="Distance blur"
                  value={draft.introBlur}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Far and very near stars soften while the logo, its stars and the big star stay in focus."
                  onChange={(introBlur) => update({ introBlur })}
                />
                <Slider
                  label="Scatter"
                  value={draft.scatter}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  hint="How widely the stars sweep in, and how staggered their arrivals are."
                  onChange={(scatter) => update({ scatter })}
                />
                <Slider
                  label="Disperse"
                  value={draft.disperse}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Tight" : percent(v))}
                  hint="How loosely they settle around the letters."
                  onChange={(disperse) => update({ disperse })}
                />
              </Section>
              {draft.revealStyle === "sweep" && (
                <SweepEditor
                  value={draft.sweep}
                  onChange={(patch) => update({ sweep: { ...draft.sweep, ...patch } })}
                  // Hold the moment the star is right over the logo, so its look and texture are easy to judge.
                  onShowStar={() => startRun(T.docked + draft.sweep.duration * 0.5, true)}
                />
              )}
            </>
          )}

          {tab === "cursor" && (
            <>
              <Section title="Cursor" scope="Page" hint="The normal arrow, or the pen that follows the mouse.">
                <Choice
                  label="Cursor style"
                  value={draft.cursor.style}
                  options={[
                    { value: "normal", label: "Normal" },
                    { value: "pen", label: "Pen" },
                  ]}
                  onChange={(style) => updateCursor({ style })}
                />
                <ColorRow label="Pen colour" value={draft.cursor.color} onChange={(color) => updateCursor({ color })} />
                <ColorRow
                  label="Colour over the logo"
                  hint="The pen switches to this colour on the logos, so it stays visible on the gold."
                  value={draft.cursor.logoColor}
                  onChange={(logoColor) => updateCursor({ logoColor })}
                />
                <Slider
                  label="Pen size"
                  value={draft.cursor.size}
                  min={0.6}
                  max={2}
                  step={0.05}
                  format={percent}
                  onChange={(size) => updateCursor({ size })}
                />
                <Slider
                  label="Pen glow"
                  value={draft.cursor.glow}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  hint="A soft light around the pen, in its own colour."
                  onChange={(glow) => updateCursor({ glow })}
                />
              </Section>

              <Section title="Cursor glow" scope="Page" hint="Things light up around the cursor as it passes over them.">
                <Toggle
                  label="Glow on hover"
                  checked={draft.logoGlow.enabled}
                  onChange={(enabled) => updateLogoGlow({ enabled })}
                />
                {draft.logoGlow.enabled && (
                  <>
                    <fieldset className={styles.places}>
                      <legend className={styles.controlLabel}>Where it glows</legend>
                      {GLOW_PLACES.map((place) => (
                        <label key={place} className={styles.place}>
                          <input
                            type="checkbox"
                            checked={draft.logoGlow.places[place]}
                            onChange={(e) => updateLogoGlow({ places: { ...draft.logoGlow.places, [place]: e.target.checked } })}
                          />
                          <span>{GLOW_PLACE_LABELS[place]}</span>
                        </label>
                      ))}
                    </fieldset>
                    <ColorRow label="Glow colour" value={draft.logoGlow.color} onChange={(color) => updateLogoGlow({ color })} />
                    <Slider
                      label="Glow intensity"
                      value={draft.logoGlow.intensity}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      onChange={(intensity) => updateLogoGlow({ intensity })}
                    />
                    <Slider
                      label="Glow spread"
                      value={draft.logoGlow.spread}
                      min={60}
                      max={400}
                      step={10}
                      format={(v) => `${Math.round(v)} px`}
                      hint="How far around the cursor things light up."
                      onChange={(spread) => updateLogoGlow({ spread })}
                    />
                  </>
                )}
              </Section>
            </>
          )}

          {tab === "slate" && (
            <>
              <ContentEditor page={CONTENT_PAGES.slate} goto={goto?.tab === "slate" ? goto : undefined} onFocus={(to) => showInPreview({ to, at: "end", label: "Slate" })} />
              <ProofTableEditor
                value={draft.proofTable}
                projects={contentDraft.projects.map((p) => ({ slug: p.slug, title: p.title }))}
                onChange={(patch) => {
                  setDraft((d) => ({ ...d, proofTable: { ...d.proofTable, ...patch } }));
                  setSave({ kind: "idle" });
                }}
                onShow={() => send({ source: "dds-portal", type: "scroll", to: "collaborations" })}
              />
            </>
          )}

          {tab === "media" && <MediaLibrary />}
          {tab === "type" && <TypographyEditor />}
          {tab === "theme" && <ThemeEditor />}
          {tab === "playback" && (
            <>
          <div className={styles.transport}>
            <div className={styles.transportButtons}>
              <button type="button" className={styles.primaryButton} disabled={!ready} onClick={() => startRun(0, false)}>
                ▶ Play from start
              </button>
              {holding ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={!ready}
                  onClick={() => startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), false)}
                >
                  ▶ Play from here
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={!ready || onPage}
                  onClick={() => startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), true)}
                >
                  ❚❚ Hold this frame
                </button>
              )}
              <button type="button" className={styles.ghostButton} disabled={!ready} onClick={() => startRun(T.end, false)}>
                Show the page
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={!ready}
                title="Lay the stars out differently"
                onClick={() =>
                  startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), holding, Math.floor(Math.random() * 1e9))
                }
              >
                ⟳ Shuffle stars
              </button>
              <span className={styles.clock}>{onPage ? "Page" : `${playhead.toFixed(1)}s`}</span>
            </div>

            <div className={styles.timeline}>
              <input
                type="range"
                aria-label="Intro timeline"
                className={styles.range}
                min={0}
                max={LAST_INTRO_FRAME}
                step={0.05}
                value={Math.min(playhead, LAST_INTRO_FRAME)}
                disabled={!ready}
                style={
                  {
                    "--fill": `${(Math.min(playhead, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(e) => scrubTo(Number(e.target.value))}
              />
              <div className={styles.beats}>
                {BEATS.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className={styles.beat}
                    style={{
                      left: `${(Math.min(b.at, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%`,
                    }}
                    disabled={!ready}
                    onClick={() => (b.at >= T.fadeStart ? startRun(T.end, false) : startRun(b.at + 0.3, true))}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.tip}>
              Changes appear in the preview instantly — drag the timeline to hold any moment, then adjust. Nothing reaches
              visitors until you press <strong>Save &amp; publish</strong>.
            </p>
          </div>
            </>
          )}
          {tab === "account" && <AccountPanel me={user} />}
          {tab === "activity" && <ActivityPanel me={user} />}
          {tab === "inbox" && <InboxPanel onCount={setUnread} />}
    </>
  );

  function pickSearch(e: SpotEntry) {
    setSpotlight(false);
    const id = e.tab as Tab;
    if (e.section && ["home", "work", "site", "slate", "projects"].includes(id)) {
      // A section found by search: its editing window opens straight away (on the right page).
      if (id === "home" || id === "work" || id === "projects") setPreviewRoute(id === "home" ? "home" : "work");
      openModal({ kind: "section", page: id, id: e.section });
      return;
    }
    selectTab(id);
  }

  const menus: MenuDef[] = [
    {
      label: "Portal",
      items: [
        { label: "Randomize the look", disabled: !!user.setup, onClick: () => update(randomLook(draft)) },
        {
          label: "Reset design to defaults",
          disabled: !!user.setup,
          onClick: () => {
            if (window.confirm("Reset every design setting to the defaults? (Nothing changes on the site until you publish.)")) {
              update(sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS));
            }
          },
        },
        { label: "Sign out", divider: true, onClick: signOut },
      ],
    },
  ];

  const routeTab: Tab = previewRoute === "work" ? "work" : previewRoute === "breakdowns" ? "breakdowns" : "home";
  const open = new Set<string>([sheetOpen ? tab : routeTab]);
  const noneMinimised = new Set<string>();
  const onPage = playhead >= T.fadeStart;

  // ── the editing window ────────────────────────────────────────────────────────────────────────────────────────
  let modalEl: React.ReactNode = null;
  if (modal) {
    const snap = modalSnap;
    const changed = !same(snap, contentDraft);
    const closeModal = () => setModal(null);
    const cancelModal = () => {
      if (snap) setContentDraft(snap); // the preview follows, back to how it was
      setSave({ kind: "idle" });
      setModal(null);
    };
    const all = contentProblems(contentDraft);
    if (modal.kind === "section") {
      const hit = findSection(modal.page, modal.id);
      const isBreakdowns = modal.page === "breakdowns";
      if (hit || isBreakdowns) {
        modalEl = (
          <EditModal
            title={isBreakdowns ? "Breakdowns" : hit!.section.title}
            hint={isBreakdowns ? "Add, edit, reorder and remove the layered designs on the Breakdowns page." : hit!.page.name}
            problems={problemsUnder(all, isBreakdowns ? ["breakdowns"] : sectionPaths(modal.page, modal.id))}
            changed={changed}
            onCancel={cancelModal}
            onSave={closeModal}
          >
            {isBreakdowns ? (
              <BreakdownsEditor initialOpen={modal.index} onShow={(index) => send({ source: "dds-portal", type: "breakdown", index })} />
            ) : (
              <ListModeProvider value={{ compact: ITEM_LISTS, openItem: (list, index) => setModal({ kind: "item", list, index }) }}>
                <SectionEditor pageKey={modal.page} sectionId={modal.id} extra={artExtra} />
              </ListModeProvider>
            )}
          </EditModal>
        );
      }
    } else if (modal.kind === "item") {
      const def = findList(modal.list);
      const items = getAt(contentDraft, modal.list) as Record<string, unknown>[] | undefined;
      const item = items?.[modal.index];
      if (def && item) {
        modalEl = (
          <EditModal
            title={def.title(item, modal.index)}
            hint={`${def.label.split(" — ")[0]} · ${modal.index + 1} of ${items!.length}`}
            headerExtra={
              <>
                {modal.list === "projects" && contentSaved.projects.some((p) => p.slug === (item as { slug?: string }).slug) && (
                  <button
                    type="button"
                    className={edit.cancel}
                    title="Go inside this project: its own page, with Edit buttons on its cover and pictures"
                    onClick={() => {
                      setPreviewProject((item as { slug: string }).slug);
                      setPreviewRoute("project");
                      setEditMode(true);
                      closeModal();
                    }}
                  >
                    Open its page ›
                  </button>
                )}
                <ItemTools list={modal.list} index={modal.index} onIndex={(i) => setModal({ kind: "item", list: modal.list, index: i })} onDeleted={closeModal} />
              </>
            }
            problems={problemsUnder(all, [`${modal.list}.${modal.index}`])}
            changed={changed}
            onCancel={cancelModal}
            onSave={closeModal}
          >
            <ItemEditor list={modal.list} index={modal.index} />
          </EditModal>
        );
      }
    } else {
      const page = CONTENT_PAGES[modal.page as keyof typeof CONTENT_PAGES];
      modalEl = (
        <EditModal title={page.name} hint={page.hint} problems={[]} changed={changed} onCancel={cancelModal} onSave={closeModal}>
          <ContentEditor page={page} extra={artExtra} />
        </EditModal>
      );
    }
  }
  const holdTime = (a: number) => a;
  void holdTime;

  return (
    <EditorProvider value={{ content: contentDraft, update: updateContent, media }}>
      <div className={`${styles.shell} ${mac.desktop}`} data-editing={editMode}>
        <div ref={stageRef} className={mac.wallpaper} data-framed="true" data-device={device}>
          <iframe ref={frameRef} title="Live preview of the site" src={`${previewPath}?${PREVIEW_PARAM}`} />
        </div>

        <MenuBar menus={menus}>
          <button type="button" className={mac.menuSearch} onClick={() => setSpotlight(true)} aria-label="Search settings">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 4 4" />
            </svg>
            <span className={mac.menuSearchText}>Search settings</span> <kbd>Ctrl K</kbd>
          </button>
          <span className={mac.menuStatus} data-kind={dirty ? "dirty" : save.kind} role="status">
            {save.kind === "saving"
              ? "Publishing…"
              : save.kind === "error"
                ? save.message
                : dirty
                  ? "Unsaved changes"
                  : save.kind === "saved"
                    ? "Published — live"
                    : "Everything is live"}
          </span>
          <a className={mac.menuPill} href="/" target="_blank" rel="noreferrer">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" />
            </svg>
            View site
          </a>
          <button
            type="button"
            className={mac.menuBtn}
            disabled={!dirty}
            onClick={() => {
              setDraft(saved);
              setContentDraft(contentSaved);
            }}
          >
            Discard
          </button>
          <button type="button" className={mac.menuPublish} disabled={!dirty || save.kind === "saving"} onClick={publish}>
            Save &amp; publish
          </button>
          <span className={mac.avatar} title={user.name} aria-label={user.name}>
            {(user.name || user.username).slice(0, 1).toUpperCase()}
          </span>
        </MenuBar>

        {/* The screen: one at a time, a normal pane down the left with its own heading, hint and scrolling. */}
        <PageBar
          route={previewRoute}
          onRoute={(k) => {
            setPreviewRoute(k);
            setSheetOpen(false);
            setEditMode(true);
          }}
          editing={editMode}
          onEditing={setEditMode}
          device={device}
          onDevice={setDevice}
          jumps={JUMP_TO}
          onJump={(i) => showInPreview({ to: JUMP_TO[i].to, at: JUMP_TO[i].at ?? "start", label: JUMP_TO[i].label })}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={undo}
          onRedo={redo}
          onReload={() => frameRef.current?.contentWindow?.location.reload()}
          projects={contentSaved.projects.map((p) => ({ slug: p.slug, title: p.title }))}
          projectSlug={projectSlug}
          onProject={setPreviewProject}
          onPageLook={() => openModal({ kind: "section", page: previewRoute === "breakdowns" ? "work" : previewRoute === "work" ? "work" : "home", id: `look-${previewRoute === "work" || previewRoute === "breakdowns" ? previewRoute : "home"}` })}
        />

        {/* The sheet: stars, colours, fonts, account… shown over the bottom of the preview, so what changes stays in view. */}
        {sheetOpen && !modal && (
          <section className={edit.sheet} aria-labelledby="sheet-title">
            <header className={edit.head}>
              <div className={edit.headText}>
                <h2 id="sheet-title" className={edit.title}>
                  {WINDOWS[tab].title}
                </h2>
                {tab !== "playback" && tab !== "account" && tab !== "activity" && tab !== "inbox" && <p className={edit.hint}>{WINDOWS[tab].hint}</p>}
              </div>
              <button type="button" className={edit.close} aria-label="Close" onClick={() => setSheetOpen(false)}>
                ×
              </button>
            </header>
            <div className={edit.sheetBody} key={tab}>
              {renderPanel(tab)}
            </div>
          </section>
        )}

        {modalEl}

        {spotlight && <Spotlight entries={user.setup ? SEARCH_ENTRIES.filter((e) => e.tab === "account") : SEARCH_ENTRIES} onPick={pickSearch} onClose={() => setSpotlight(false)} />}

        <Dock groups={DOCK} badges={{ inbox: unread }} open={open} minimized={noneMinimised} disabled={(id) => !!user.setup && id !== "account"} onToggle={(id) => selectTab(id as Tab)} />
      </div>
    </EditorProvider>
  );
}

const between = (min: number, max: number, step = 0.05) => Math.round((min + Math.random() * (max - min)) / step) * step;

/** A fresh look within tasteful ranges. Keeps the background, the colours themselves and whether the intro plays. */
function randomLook(current: IntroSettings): IntroSettings {
  return sanitizeIntroSettings({
    ...current,
    glow: between(0.3, 0.9),
    glowingShare: between(6, 24, 1),
    starSize: between(0.8, 1.3),
    starDepth: between(0.7, 1.8),
    metallic: between(0.3, 0.85),
    spaceDepth: between(0.8, 1.3),
    formationCount: between(500, 950, 50),
    scatter: between(0.3, 0.8),
    disperse: between(0, 0.3),
    shine: between(0.6, 1.1),
    glassOpacity: between(0.22, 0.5, 0.01),
    glassFrost: between(1.5, 5, 0.5),
    colors: current.colors.map((c) => ({ ...c, share: between(15, 60, 1) })),
    field: {
      ...current.field,
      count: between(24, 48, 1),
      motion: between(0.3, 0.8),
      cursor: between(0.3, 0.8),
      depthBlur: between(0.2, 0.8),
      cornerStars: between(1, 2, 1),
      cornerSize: between(0.8, 1.3),
      size: between(0.8, 1.4),
    },
    front: { count: between(4, 16, 1), blur: between(0, 2, 0.5), size: between(0.8, 1.4) },
    art: {
      ...current.art,
      style: ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)],
      seed: Math.floor(Math.random() * 1e9),
      depth: between(0.35, 0.85),
      lines: between(0.35, 0.85),
    },
  });
}

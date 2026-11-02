"use client";

import { useConfirmDelete } from "./DeleteDialog";
import { resizedSrc } from "@/lib/images";
import { useEffect, useId, useRef, useState } from "react";
import type { ProofItem } from "@/content/proof-table";
import { PROOF_LIMITS, type ProofTableSettings } from "@/lib/intro/settings";
import { ColorRow, Section, Slider, Toggle } from "./controls";
import { DISC_DEFAULTS, DISC_RANGES, DISC_SLOT_LIMIT, sanitizeDisc, discAimProfileForWidth, type DiscControls } from "@/lib/content/disc";
import { ImagePicker, useMedia } from "./ContentEditor";
import styles from "./portal.module.css";
import { moveTo, useReorder } from "./reorder";

export const DISC_GROUPS: { title: string; fields: { key: keyof DiscControls; label: string; hint?: string }[] }[] = [
  { title: "Circle & entrance", fields: [
    { key: "spinSpeed", label: "Rotation speed", hint: "Zero stops rotation. Negative reverses it. Reduced-motion devices show the settled composition." },
    { key: "entranceDuration", label: "Arrival duration", hint: "The full circle keeps turning as it zooms in, then settles into its saved rotation speed without stopping. Plays once per page visit." },
    { key: "circleScale", label: "Circle size", hint: "Fine-tune the oversized arc. Desktop, tablet and mobile use their own framing." },
    { key: "edgeThickness", label: "Arc edge thickness", hint: "1% is ultra-fine; 8% is the thin default; 100% is the broadest edge reflection. Disc placement stays unchanged." },
    { key: "edgeLines", label: "Glass edge lines", hint: "The two hairline reflections and the slim thickness band just inside the rim. Zero leaves only the outer edge." },
    { key: "discTilt", label: "Glass tilt", hint: "Keep this shallow for the broad circle in the reference." },
    { key: "discRoll", label: "Glass angle", hint: "Rotates the presentation of the glass surface." },
  ] },
  { title: "Glass tint", fields: [
    { key: "glassTintColor", label: "Tint colour", hint: "Colours only the glass surface, not the uploaded titles or projector." },
    { key: "glassOpacity", label: "Glass opacity", hint: "A faint clear tint lets the page show through. Zero removes the tint; surface and edge reflections remain visible." },
    { key: "desaturation", label: "Tint colour softness", hint: "0% keeps your chosen colour; 100% makes the tint neutral grey." },
  ] },
  { title: "Shadow behind the glass", fields: [
    { key: "shadowColor", label: "Shadow colour", hint: "The soft backdrop behind this section only. It does not change the page background." },
    { key: "shadowOpacity", label: "Shadow opacity", hint: "Off by default for clear glass. Increase only if you want to add a backdrop behind the disc." },
    { key: "shadowSpread", label: "Shadow spread", hint: "100% keeps the current size. Smaller concentrates it; larger spreads it softly." },
  ] },
  { title: "Projector & light", fields: [
    { key: "projectorSide", label: "Projector side" },
    { key: "lightIntensity", label: "Glass edge light", hint: "Controls only the fine edge reflection, even when glass opacity is zero. Zero turns the edge light off." },
    { key: "rayIntensity", label: "Projector brightness", hint: "Overall light strength. The blue spotlight stays cool while the glass reflection still responds to the focused artwork." },
    { key: "originGlow", label: "Origin glow", hint: "How hot the light is where it enters the frame. It rolls off softly, so higher values stay shaped instead of turning into a flat white patch." },
    { key: "beamWidth", label: "Beam width", hint: "25% gives a slim spotlight; 100% is the reference spread; 200% makes a broad, soft shaft. This does not resize the disc or the title-light landing area." },
    { key: "beamGlow", label: "Beam glow", hint: "Controls the blue atmospheric haze around the central shafts." },
    { key: "rayStrength", label: "Ray strength", hint: "Controls the pale streaks inside the blue spotlight." },
    { key: "surfaceReflection", label: "Surface reflection", hint: "Only the light landing on the glass surface. Zero removes it without disabling the beam, edge light or title glow." },
    { key: "rayStyle", label: "Ray style" },
    { key: "rayMotion", label: "Ray movement", hint: "Gentle, irregular motion with steady brightness. Zero keeps the beam still. Pause and reduced motion stop animation." },
    { key: "raySpread", label: "Title-light spread", hint: "Sets how much of a passing title receives light. Use Beam width above to narrow or expand the visible shaft." },
    { key: "rayPrism", label: "Prism colour separation", hint: "Adds fine spectral streaks to Prismatic fan. The main colour still follows the highlighted artwork." },
    { key: "rayLength", label: "Off-screen beam distance", hint: "Moves the hidden projector farther beyond the selected screen edge. The source itself always remains outside the visible page." },
  ] },
  { title: "Desktop beam position · 1025px+", fields: [
    { key: "originOffsetX", label: "Origin — horizontal", hint: "Moves the source along the upper edge. The projector itself stays off screen." },
    { key: "originOffsetY", label: "Origin — vertical", hint: "Negative lifts the source; positive lowers it, stopping safely above the frame." },
    { key: "focusAngle", label: "Landing — angle", hint: "Moves the gold landing marker around the glass circle." },
    { key: "focusRadius", label: "Landing — distance", hint: "Moves the gold marker between the centre and outer rim." },
  ] },
  { title: "Tablet beam position · 641–1024px", fields: [
    { key: "tabletOriginOffsetX", label: "Origin — horizontal" },
    { key: "tabletOriginOffsetY", label: "Origin — vertical" },
    { key: "tabletFocusAngle", label: "Landing — angle" },
    { key: "tabletFocusRadius", label: "Landing — distance" },
  ] },
  { title: "Mobile beam position · up to 640px", fields: [
    { key: "mobileOriginOffsetX", label: "Origin — horizontal", hint: "The base source remains outside the mobile screen; this fine-tunes its direction." },
    { key: "mobileOriginOffsetY", label: "Origin — vertical" },
    { key: "mobileFocusAngle", label: "Landing — angle" },
    { key: "mobileFocusRadius", label: "Landing — distance" },
  ] },
  { title: "Glow", fields: [
    { key: "bloom", label: "Glow strength", hint: "Zero switches bloom off." },
    { key: "glowRadius", label: "Glow softness", hint: "Spreads the soft projector haze and its surface reflection while keeping the focused artwork clear." },
    { key: "glowThreshold", label: "Glow threshold", hint: "Higher values let only the brightest highlights glow." },
  ] },
  { title: "Artwork colour", fields: [
    { key: "saturation", label: "Colour saturation", hint: "100% keeps the original colour; 0% makes the artwork monochrome." },
    { key: "vibrance", label: "Colour vibrance", hint: "Boosts muted colours more than colours that are already vivid." },
  ] },
  { title: "Title settings", fields: [
    { key: "slotRotation", label: "Title rotation angle", hint: "Rotates each artwork around its own centre, not the glass. Positive angles turn anticlockwise. Individual titles can override this below." },
    { key: "slotSize", label: "Title size", hint: "Scales the transparent title artwork directly on the glass." },
    { key: "slotGap", label: "Gap between titles", hint: "Higher values leave more clear space by reducing each title footprint. Title centres stay evenly spaced around the glass; 3° is the original spacing." },
    { key: "slotOpacity", label: "Artwork opacity", hint: "Shared base opacity. Each title's blend opacity below also fades its projected highlights and glow." },
    { key: "slotBlur", label: "Far-side softness", hint: "Optional mild softness for distant artwork. Front-facing and hovered titles stay sharp. Zero removes all blur." },
    { key: "titleGlass", label: "Title glass strength", hint: "How visible a title is as clear glass outside the light. Inside the beam the original artwork is always shown." },
    { key: "unfocusedBrightness", label: "Glass body brightness", hint: "How much the clear body of a glass title fills in between its bevelled edges." },
  ] },
];

/**
 * Portal controls for the glass circle: artwork, linked projects, order, light and motion.
 * Existing slate entries remain editable and preview live.
 */
export function ProofTableEditor({
  value,
  projects,
  onChange,
  onShow,
  previewWidth = 1440,
}: {
  value: ProofTableSettings;
  projects: { slug: string; title: string }[];
  onChange: (patch: Partial<ProofTableSettings>) => void;
  /** Scrolls the preview to the section's final view. */
  onShow: () => void;
  /** Actual iframe width, not the selected device label on a smaller screen. */
  previewWidth?: number;
}) {
  const media = useMedia();
  const { ask: askDelete, dialog: deleteDialog } = useConfirmDelete();
  const [upload, setUpload] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  /** The card whose picture is being chosen. */
  const [picking, setPicking] = useState<number | null>(null);
  const [openDiscGroup, setOpenDiscGroup] = useState<string | null>("Circle & entrance");
  const [openTitle, setOpenTitle] = useState<number | null>(null);
  const [titleSearch, setTitleSearch] = useState("");
  const titleId = useId();
  const [settingSearch, setSettingSearch] = useState("");
  const settingsRoot = useRef<HTMLDivElement>(null);

  const items = value.items;
  const latestItems = useRef(items);
  useEffect(() => { latestItems.current = items; }, [items]);
  const disc = sanitizeDisc(value.disc);
  const aimProfile = discAimProfileForWidth(previewWidth);
  const activeBeamGroup = `${aimProfile[0].toUpperCase()}${aimProfile.slice(1)} beam`;
  const query = settingSearch.trim().toLowerCase();
  const visibleGroups = DISC_GROUPS.map(group => ({ ...group, fields: group.fields.filter(field =>
    !query || `${group.title} ${field.label} ${field.hint ?? ""} ${field.key}`.toLowerCase().includes(query)) })).filter(group => group.fields.length);
  const jumpTo = (title: string) => {
    setSettingSearch("");
    setOpenDiscGroup(title);
    requestAnimationFrame(() => {
      const target = Array.from(settingsRoot.current?.querySelectorAll<HTMLDetailsElement>("details[data-disc-group]") ?? []).find(element => element.dataset.discGroup === title);
      target?.querySelector("summary")?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  };
  const setItems = (next: ProofItem[]) => { latestItems.current = next; onChange({ items: next }); };
  const patchItem = (i: number, patch: Partial<ProofItem>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const { attach, item: reItem, grip: reGrip } = useReorder((from, to) => {
    setItems(moveTo(latestItems.current, from, to));
    setOpenTitle(current => current === null ? null : current === from ? to : from < current && current <= to ? current - 1 : to <= current && current < from ? current + 1 : current);
    setPicking(null);
  });
  const titleQuery = titleSearch.trim().toLocaleLowerCase();
  const matchesTitle = (it: ProofItem) => !titleQuery || `${it.film} ${it.tag} ${it.year} ${it.slug}`.toLocaleLowerCase().includes(titleQuery);
  const full = items.length >= PROOF_LIMITS.items;
  const addCard = (src?: string) => {
    const currentItems = latestItems.current;
    if (currentItems.length >= PROOF_LIMITS.items) return;
    setTitleSearch("");
    setOpenTitle(currentItems.length);
    setPicking(null);
    const image = src ?? "";
    setItems([
      ...currentItems,
      {
        src: image,
        type: "title-png",
        film: "New title",
        year: new Date().getFullYear(),
        tag: "Title",
        slug: projects[0]?.slug ?? "title-designs",
        alt: "Title design",
      },
    ]);
  };

  async function onUpload(file: File) {
    setUpload({ kind: "busy" });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/portal/proof-image", { method: "POST", body: form });
      const data = (await res.json()) as { src?: string; error?: string };
      if (!res.ok || !data.src) throw new Error(data.error ?? "Upload failed.");
      media.add(data.src);
      addCard(data.src);
      setUpload({ kind: "idle" });
    } catch (err) {
      setUpload({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  return (
    <>
      {deleteDialog}
      <Section title="Glass title circle" scope="Page" hint="The full glass circle approaches, then settles as an oversized arc behind the heading. Uploaded titles rotate through a steady corner light and reveal their colour as they enter it.">
        <Toggle label="Show the section" checked={value.enabled} onChange={(enabled) => onChange({ enabled })} />
        <div className={styles.control}>
          <button type="button" className={styles.ghostButton} onClick={onShow}>Show it in the preview ↓</button>
          <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, ...sanitizeDisc({ ...disc, glassVersion: 0 }), circleScale: 1, entranceDuration: 3.6 } })}>Restore reference placement</button>
          <p className={styles.controlHint}>In the portal preview, cyan marks the beam origin and gold marks its landing point. These guides are never shown on the public site.</p>
          <p className={styles.controlHint} role="status">Live beam controls: {aimProfile} ({Math.round(previewWidth)}px preview). Use the matching beam-position group below; other device groups are saved for those screen sizes.</p>
        </div>
        <div className={styles.control}>
          <button type="button" className={styles.ghostButton} disabled={full} onClick={() => addCard()}>+ Add title</button>
          <p className={styles.controlHint}>{Math.min(items.length, DISC_SLOT_LIMIT)} of {DISC_SLOT_LIMIT} positions assigned. The first {DISC_SLOT_LIMIT} titles appear on the glass; remaining entries are kept here. Drag a title into the first {DISC_SLOT_LIMIT} positions to display it.</p>
          <button type="button" className={styles.linkButton} onClick={() => onChange({ disc: { ...DISC_DEFAULTS } })}>Reset circle settings</button>
          <p className={styles.controlHint}>Reset restores the circle controls; your images and title order stay as they are.</p>
        </div>
      </Section>
      <div className={styles.discFinder}>
        <label className={styles.controlLabel}>Find a circle setting
          <input className={styles.select} type="search" value={settingSearch} placeholder="Try: edge, beam width, title size…" onChange={event => setSettingSearch(event.target.value)} />
        </label>
        <div className={styles.discShortcuts} role="group" aria-label="Circle setting shortcuts">
          {[["Circle & entrance", "Circle"], ["Glass tint", "Glass"], ["Projector & light", "Lighting"], ["Title settings", "Titles"],
            [DISC_GROUPS.find(group => group.title.startsWith(activeBeamGroup))!.title, `Beam position · ${aimProfile}`]].map(([title, label]) =>
            <button key={title} type="button" className={styles.ghostButton} onClick={() => jumpTo(title)}>{label}</button>)}
        </div>
        <div className={styles.discShortcuts}>
          {query && <button type="button" className={styles.linkButton} onClick={() => setSettingSearch("")}>Clear search</button>}
          <button type="button" className={styles.linkButton} onClick={() => setOpenDiscGroup(null)}>Close open settings</button>
        </div>
        <p className={styles.controlHint}>Drag a slider or type an exact value. Press Enter or leave the number field to apply. Changes appear in the preview; use the portal’s save/publish action to keep them.</p>
        {query && <p className={styles.controlHint} role="status">{visibleGroups.reduce((total, group) => total + group.fields.length, 0)} matching controls{visibleGroups.length === 0 ? ". Try edge, light, colour, or title." : ""}</p>}
      </div>
      <div ref={settingsRoot}>
      {visibleGroups.map(group => <details key={group.title} data-disc-group={group.title} className={styles.discControls} open={openDiscGroup === group.title}>
        <summary onClick={event => { event.preventDefault(); setOpenDiscGroup(current => current === group.title ? null : group.title); }}>{group.title}<span>{group.title.startsWith(activeBeamGroup) ? "Active preview · " : ""}{group.fields.length} controls · {openDiscGroup === group.title ? "Click to close" : "Click to edit"}</span></summary>
        <div className={styles.sectionBody}>
        {group.fields.map(({ key, label, hint }) => {
          if (key === "glassTintColor" || key === "shadowColor") return <ColorRow key={key} label={label} hint={hint} value={disc[key]}
            onChange={next => onChange({ disc: { ...disc, [key]: next } })} />;
          if (key === "projectorSide") return <div key={key} className={styles.control}>
            <label className={styles.controlLabel}>Projector side
              <select className={styles.select} aria-label="Projector side" value={disc.projectorSide} onChange={e => onChange({ disc: { ...disc, projectorSide: Number(e.target.value) } })}>
                <option value={-1}>Upper-left corner</option><option value={1}>Upper-right corner</option>
              </select>
            </label>
          </div>;
          if (key === "rayStyle") return <div key={key} className={styles.control}>
            <label className={styles.controlLabel}>Ray style
              <select className={styles.select} aria-label="Ray style" value={disc.rayStyle} onChange={e => onChange({ disc: { ...disc, rayStyle: Number(e.target.value) } })}>
                <option value={0}>Blue spotlight — reference</option><option value={1}>Prismatic fan</option><option value={2}>Soft light fan</option>
              </select>
            </label>
          </div>;
          const [min, max, step] = DISC_RANGES[key];
          const angle = key === "discTilt" || key === "discRoll" || key.endsWith("FocusAngle") || key === "focusAngle" || key === "slotGap" || key === "slotRotation";
          const raw = ["slotBlur", "rayLength", "rayElevation", "glowThreshold", "spinSpeed", "entranceDuration"].includes(key);
          return <Slider key={key} label={label} hint={hint} value={disc[key]} min={min} max={max} step={step}
            editable inputScale={angle || raw ? 1 : 100} inputUnit={angle ? "°" : key === "entranceDuration" ? "s" : key === "spinSpeed" ? "rad/s" : raw ? "" : "%"}
            format={n => key === "entranceDuration" ? `${n.toFixed(1)} seconds` : key === "discTilt" || key === "discRoll" || key.endsWith("FocusAngle") || key === "focusAngle" || key === "slotGap" || key === "slotRotation" ? `${n}°` : key === "spinSpeed" ? `${Number(n.toFixed(2))} rad/s` : ["slotBlur", "rayLength", "rayElevation", "glowThreshold"].includes(key) ? String(Number(n.toFixed(2))) : `${Math.round(n * 100)}%`}
            onChange={next => onChange({ disc: { ...disc, [key]: next } })} />;
        })}
        {group.title === "Glass tint" && <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, glassTintColor: DISC_DEFAULTS.glassTintColor, glassOpacity: DISC_DEFAULTS.glassOpacity, desaturation: DISC_DEFAULTS.desaturation } })}>Reset glass tint</button>}
        {group.title === "Circle & entrance" && <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, edgeThickness: DISC_DEFAULTS.edgeThickness } })}>Use ultra-thin edge</button>}
        {group.title === "Projector & light" && <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, ...Object.fromEntries(DISC_GROUPS.find(original => original.title === group.title)!.fields.map(({ key }) => [key, DISC_DEFAULTS[key]])) } })}>Reset lighting only</button>}
        {group.title === "Shadow behind the glass" && <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, shadowColor: DISC_DEFAULTS.shadowColor, shadowOpacity: DISC_DEFAULTS.shadowOpacity, shadowSpread: DISC_DEFAULTS.shadowSpread } })}>Reset shadow</button>}
        </div>
      </details>)}
      </div>
      <Section
        title={`Title collection (${items.length} / ${PROOF_LIMITS.items})`}
        scope="Page"
        hint={`The first ${DISC_SLOT_LIMIT} images appear around the glass in this order. Additional entries stay saved here until you move them into those positions.`}
      >
        <label className={`${styles.controlLabel} ${styles.titleSearch}`}>Find a title
          <input className={styles.select} type="search" placeholder="Search title, category or year" value={titleSearch}
            onChange={event => { setTitleSearch(event.target.value); setOpenTitle(null); setPicking(null); }} />
        </label>
        <p className={styles.controlHint}>Select a title block to edit it. Opening another closes the previous block without losing your changes.</p>
        {titleQuery && <div className={styles.discShortcuts}>
          <span className={styles.controlHint} role="status">{items.filter(matchesTitle).length} matching titles</span>
          <button type="button" className={styles.linkButton} onClick={() => setTitleSearch("")}>Clear title search</button>
        </div>}
        {!items.length && <p className={styles.controlHint}>No titles yet. Add a title or upload artwork below to begin.</p>}
        <div ref={attach} style={{ display: "contents" }}>
        {items.map((it, i) => (
          <div key={i} className={`${styles.slot} ${styles.titleBlock}`} data-title-block={i} data-selected={openTitle === i} hidden={!matchesTitle(it) && openTitle !== i} {...reItem(i)}>
            <div className={styles.slotHead}>
              {!titleQuery && reGrip(i, items.length)}
              <button type="button" className={styles.titleBlockButton} aria-expanded={openTitle === i} aria-controls={`${titleId}-${i}`}
                onClick={() => { setOpenTitle(current => current === i ? null : i); setPicking(null); }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the chosen title */}
              {it.src && <img className={styles.slotThumb} src={resizedSrc(it.src, 240)} alt="" />}
              <span className={styles.titleBlockText}><strong>{it.film || "Untitled artwork"}</strong>
                <span>{String(i + 1).padStart(2, "0")} · {i < DISC_SLOT_LIMIT ? "On glass" : "Saved for later"} · {it.year}</span>
              </span>
              <span className={styles.titleBlockChevron} aria-hidden="true">{openTitle === i ? "−" : "+"}</span>
              </button>
              <span className={styles.slotActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove ${it.film}`}
                  onClick={() =>
                    askDelete({
                      what: `the circle title “${it.film}”`,
                      item: it,
                      elsewhere: items.filter((_, j) => j !== i),
                      onDelete: () => {
                        setItems(latestItems.current.filter((_, j) => j !== i));
                        setOpenTitle(current => current === i ? null : current !== null && current > i ? current - 1 : current);
                        setPicking(null);
                      },
                    })
                  }
                >
                  ×
                </button>
              </span>
            </div>
            <div id={`${titleId}-${i}`} hidden={openTitle !== i}>
            <div className={styles.slotGrid}>
              <label>
                <span>Film / project name</span>
                <input
                  className={styles.select}
                  value={it.film}
                  maxLength={80}
                  onChange={(e) => patchItem(i, { film: e.target.value, alt: `${e.target.value} title design` })}
                />
              </label>
              <label>
                <span>Category label</span>
                <input
                  className={styles.select}
                  value={it.tag}
                  maxLength={30}
                  onChange={(e) => patchItem(i, { tag: e.target.value })}
                />
              </label>
              <label>
                <span>Year</span>
                <input
                  className={styles.select}
                  type="number"
                  min={1950}
                  max={2100}
                  value={it.year}
                  onChange={(e) => patchItem(i, { year: Number(e.target.value) || it.year })}
                />
              </label>
              <label>
                <span>Linked project</span>
                <select className={styles.select} value={it.slug} onChange={(e) => patchItem(i, { slug: e.target.value })}>
                  {projects.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.slotWide}>
                <span>Title artwork</span>
                <button type="button" className={styles.picture} onClick={() => setPicking(picking === i ? null : i)} aria-expanded={picking === i} title="Choose the uploaded title artwork shown on the glass">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the card's current picture */}
                  {it.src && <img src={resizedSrc(it.src, 480)} alt="" />}
                  <span>{picking === i ? "Close the pictures" : it.src ? "Change the picture" : "Upload or choose a picture"}</span>
                </button>
                {picking === i && <ImagePicker value={it.src} onPick={(src) => patchItem(i, { src })} onClose={() => setPicking(null)} />}
              </div>
              <div className={`${styles.slotWide} ${styles.slotTint}`}>
                <div className={styles.slotTintGroup}>
                  <Slider label="This title — rotation angle" min={-180} max={180} step={1}
                    editable inputUnit="°"
                    hint="Changes this artwork only. Use the shared angle to follow Title settings again."
                    value={it.titleRotation ?? disc.slotRotation} format={v => `${v}°`}
                    onChange={(titleRotation) => patchItem(i, { titleRotation })} />
                  <button type="button" className={styles.linkButton} disabled={it.titleRotation === undefined}
                    onClick={() => patchItem(i, { titleRotation: undefined })}>Use shared title angle</button>
                </div>
                <div className={styles.slotTintGroup}>
                  <Slider label="This title — size" min={.25} max={1} step={.01}
                    editable inputScale={100} inputUnit="%"
                    hint="25%–100% of the shared title size. Keeps the artwork inside the glass and separated from its neighbours."
                    value={it.titleScale ?? 1} format={v => `${Math.round(v * 100)}%`}
                    onChange={(titleScale) => patchItem(i, { titleScale })} />
                  <button type="button" className={styles.linkButton} disabled={it.titleScale === undefined}
                    onClick={() => patchItem(i, { titleScale: undefined })}>Use shared title size</button>
                </div>
                <div className={styles.slotTintGroup}>
                  <Slider label="This title — blend opacity" min={0} max={1} step={.01}
                    editable inputScale={100} inputUnit="%"
                    hint="100% keeps the artwork solid; lower values blend it into the glass. 0% hides it, including its glow."
                    value={it.titleOpacity ?? 1} format={v => `${Math.round(v * 100)}%`}
                    onChange={(titleOpacity) => patchItem(i, { titleOpacity })} />
                  <label className={styles.controlLabel}>Blend mode
                    <select className={styles.select} aria-label={`Blend mode for ${it.film || `title ${i + 1}`}`}
                      value={it.titleBlend ?? "normal"} onChange={e => patchItem(i, { titleBlend: e.target.value as ProofItem["titleBlend"] })}>
                      <option value="normal">Normal — original artwork</option>
                      <option value="screen">Screen — light over glass</option>
                      <option value="additive">Additive — luminous</option>
                    </select>
                  </label>
                  <button type="button" className={styles.linkButton} disabled={it.titleOpacity === undefined && it.titleBlend === undefined}
                    onClick={() => patchItem(i, { titleOpacity: undefined, titleBlend: undefined })}>Reset title blend</button>
                </div>
                <div className={styles.slotTintGroup}>
                  <ColorRow label="Title colour" value={it.titleColor ?? "#ffffff"} onChange={(titleColor) => patchItem(i, { titleColor })} />
                  <button type="button" className={styles.linkButton} disabled={!it.titleColor}
                    onClick={() => patchItem(i, { titleColor: undefined })}>Use uploaded title colour</button>
                </div>
                <div className={styles.slotTintGroup}>
                  <ColorRow label="Title glow colour" value={it.titleGlowColor ?? it.titleColor ?? "#ffffff"}
                    onChange={(titleGlowColor) => patchItem(i, { titleGlowColor })} />
                  <button type="button" className={styles.linkButton} disabled={!it.titleGlowColor}
                    onClick={() => patchItem(i, { titleGlowColor: undefined })}>Match glow to artwork</button>
                </div>
                <div className={styles.slotTintGroup}>
                  <Slider label="Title glow intensity" min={0} max={2} step={.05}
                    editable inputScale={100} inputUnit="%"
                    value={it.titleGlowIntensity ?? 1} format={v => `${Math.round(v * 100)}%`}
                    onChange={(titleGlowIntensity) => patchItem(i, { titleGlowIntensity })} />
                </div>
              </div>
            </div>
            </div>
          </div>
        ))}
        <div className={styles.slotFooter}>
          <button type="button" className={styles.ghostButton} disabled={full} onClick={() => addCard()}>
            + Add title
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            disabled={full || upload.kind === "busy"}
            onClick={() => fileRef.current?.click()}
          >
            {upload.kind === "busy" ? "Uploading…" : "Upload a new title"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/webp,image/jpeg,image/avif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
        </div>
        {upload.kind === "error" && <p className={styles.controlHint}>{upload.message}</p>}
        <p className={styles.controlHint}>Transparent PNGs work best; the empty margin is trimmed automatically.</p>
        </div>
      </Section>
    </>
  );
}

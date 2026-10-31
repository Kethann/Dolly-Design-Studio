"use client";

import { useConfirmDelete } from "./DeleteDialog";
import { resizedSrc } from "@/lib/images";
import { useEffect, useRef, useState } from "react";
import type { ProofItem } from "@/content/proof-table";
import { PROOF_LIMITS, type ProofTableSettings } from "@/lib/intro/settings";
import { Section, Slider, Toggle } from "./controls";
import { DISC_DEFAULTS, DISC_RANGES, DISC_SLOT_LIMIT, sanitizeDisc, type DiscControls } from "@/lib/content/disc";
import { ImagePicker, useMedia } from "./ContentEditor";
import styles from "./portal.module.css";
import { moveTo, useReorder } from "./reorder";

const DISC_GROUPS: { title: string; fields: { key: keyof DiscControls; label: string; hint?: string }[] }[] = [
  { title: "Disc motion", fields: [
    { key: "spinSpeed", label: "Spin speed", hint: "Zero stops rotation. Negative reverses direction. Reduced-motion devices keep the disc still." },
    { key: "discTilt", label: "Disc tilt", hint: "The disc is automatically reframed on phones and tablets so this angle stays inside the screen." },
    { key: "discRoll", label: "Disc angle", hint: "Rotates the whole disc's presentation. −65° gives the upright diagonal reference pose." },
  ] },
  { title: "Projector & light", fields: [
    { key: "projectorSide", label: "Projector side" },
    { key: "lightIntensity", label: "Studio light", hint: "Lighting and reflections on the silver disc and glass." },
    { key: "rayIntensity", label: "Projector brightness", hint: "The beam, haze and landing reflection automatically follow the focused artwork's colour." },
    { key: "beamGlow", label: "Beam glow", hint: "The soft haze filling the beam. 100% is the normal look; up to 300%." },
    { key: "rayStrength", label: "Ray strength", hint: "How bright and defined the moving streaks inside the beam are." },
    { key: "surfaceReflection", label: "Surface reflection", hint: "A subtle artwork-coloured glow on the focused image plus the light touching the silver disc. It does not brighten the other cards." },
    { key: "rayStyle", label: "Ray style" },
    { key: "rayMotion", label: "Ray movement", hint: "Gentle, irregular motion with steady brightness. Zero keeps the beam still. Pause and reduced motion stop animation." },
    { key: "rayElevation", label: "Ray height", hint: "Raises or lowers the source on the selected side." },
    { key: "raySpread", label: "Ray spread", hint: "The landing area automatically fits the slot. Increase to fill the panel; decrease for a narrower beam." },
    { key: "rayPrism", label: "Prism colour separation", hint: "Adds fine spectral streaks to Prismatic fan. The main colour still follows the highlighted artwork." },
    { key: "rayLength", label: "Off-screen beam distance", hint: "Moves the hidden projector farther beyond the selected screen edge. The source itself always remains outside the visible page." },
    { key: "focusAngle", label: "Projector focus angle", hint: "−25° places the landing light on the lower-right front face; −180° moves it back to the left rim." },
    { key: "focusRadius", label: "Focus radius" },
  ] },
  { title: "Glow", fields: [
    { key: "bloom", label: "Glow strength", hint: "Zero switches bloom off." },
    { key: "glowRadius", label: "Glow softness", hint: "Spreads the soft projector haze and its surface reflection while keeping the focused artwork clear." },
    { key: "glowThreshold", label: "Glow threshold", hint: "Higher values let only the brightest highlights glow." },
  ] },
  { title: "Artwork colour", fields: [
    { key: "saturation", label: "Colour saturation", hint: "100% keeps the original colour; 0% makes the artwork monochrome." },
    { key: "vibrance", label: "Colour vibrance", hint: "Boosts muted colours more than colours that are already vivid." },
    { key: "desaturation", label: "Silver desaturation", hint: "Mutes the disc's iridescence without changing the artwork." },
  ] },
  { title: "Slot appearance", fields: [
    { key: "slotSize", label: "Card size", hint: "Controls the clean rectangular artwork cards. Responsive fitting remains automatic." },
    { key: "slotGap", label: "Gap between cards", hint: "Spacing adjusts automatically to the number of cards without changing them into wedge shapes." },
    { key: "slotOpacity", label: "Artwork opacity" },
    { key: "slotBlur", label: "Far-side softness", hint: "Only artwork on the far side of the disc softens, capped at a mild blur. Front-facing and hovered titles stay sharp. Zero removes all blur." },
    { key: "unfocusedBrightness", label: "Unfocused image brightness" },
  ] },
];

/**
 * Portal controls for the title disc: artwork, linked projects, order, light and motion.
 * Existing slate entries remain editable and preview live.
 */
export function ProofTableEditor({
  value,
  projects,
  onChange,
  onShow,
}: {
  value: ProofTableSettings;
  projects: { slug: string; title: string }[];
  onChange: (patch: Partial<ProofTableSettings>) => void;
  /** Scrolls the preview to the section's final view. */
  onShow: () => void;
}) {
  const media = useMedia();
  const { ask: askDelete, dialog: deleteDialog } = useConfirmDelete();
  const [upload, setUpload] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  /** The card whose picture is being chosen. */
  const [picking, setPicking] = useState<number | null>(null);

  const items = value.items;
  const latestItems = useRef(items);
  useEffect(() => { latestItems.current = items; }, [items]);
  const disc = sanitizeDisc(value.disc);
  const setItems = (next: ProofItem[]) => { latestItems.current = next; onChange({ items: next }); };
  const patchItem = (i: number, patch: Partial<ProofItem>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const { attach, item: reItem, grip: reGrip } = useReorder((from, to) => setItems(moveTo(items, from, to)));
  const full = items.length >= PROOF_LIMITS.items;
  const addCard = (src?: string) => {
    const currentItems = latestItems.current;
    if (currentItems.length >= PROOF_LIMITS.items) return;
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
      <Section title="Title disc" scope="Page" hint="Uploaded title artwork rotates on rectangular cards through a fixed cinema-projector beam. The projector stays outside the viewport, mobile framing is automatic, and movement respects reduced motion.">
        <Toggle label="Show the section" checked={value.enabled} onChange={(enabled) => onChange({ enabled })} />
        <div className={styles.control}>
          <button type="button" className={styles.ghostButton} onClick={onShow}>Show it in the preview ↓</button>
          <button type="button" className={styles.ghostButton} onClick={() => onChange({ disc: { ...disc, discRoll: -65, discTilt: -65, focusAngle: -25, focusRadius: 0.67, projectorSide: -1, rayLength: 5, rayStyle: 1, rayElevation: 2.4, raySpread: 1.1, rayPrism: 0.65, slotSize: 1, slotGap: 3 } })}>Use responsive cinema setup</button>
        </div>
        <div className={styles.control}>
          <button type="button" className={styles.ghostButton} disabled={full} onClick={() => addCard()}>+ Add title</button>
          <p className={styles.controlHint}>{Math.min(items.length, DISC_SLOT_LIMIT)} of {DISC_SLOT_LIMIT} disc slots filled. The first {DISC_SLOT_LIMIT} titles appear on the disc; remaining titles stay in the collection. Drag a title into the first {DISC_SLOT_LIMIT} positions to display it.</p>
          <button type="button" className={styles.linkButton} onClick={() => onChange({ disc: { ...DISC_DEFAULTS } })}>Reset disc settings</button>
          <p className={styles.controlHint}>Reset restores the disc controls; your images and slot order stay as they are.</p>
        </div>
      </Section>
      {DISC_GROUPS.map(group => <details key={group.title} className={styles.discControls} open={group.title === "Disc motion" || undefined}>
        <summary>{group.title}<span>{group.fields.length} controls</span></summary>
        <div className={styles.sectionBody}>
        {group.fields.map(({ key, label, hint }) => {
          if (key === "projectorSide") return <div key={key} className={styles.control}>
            <label className={styles.controlLabel}>Projector side
              <select className={styles.select} aria-label="Projector side" value={disc.projectorSide} onChange={e => onChange({ disc: { ...disc, projectorSide: Number(e.target.value) } })}>
                <option value={-1}>Left — behind the heading</option><option value={1}>Right</option>
              </select>
            </label>
          </div>;
          if (key === "rayStyle") return <div key={key} className={styles.control}>
            <label className={styles.controlLabel}>Ray style
              <select className={styles.select} aria-label="Ray style" value={disc.rayStyle} onChange={e => onChange({ disc: { ...disc, rayStyle: Number(e.target.value) } })}>
                <option value={0}>Cinema projector</option><option value={1}>Prismatic fan — reference</option><option value={2}>Soft light fan</option>
              </select>
            </label>
          </div>;
          const [min, max, step] = DISC_RANGES[key];
          return <Slider key={key} label={label} hint={hint} value={disc[key]} min={min} max={max} step={step}
            format={n => key === "discTilt" || key === "discRoll" || key === "focusAngle" || key === "slotGap" ? `${n}°` : key === "spinSpeed" ? `${Number(n.toFixed(2))} rad/s` : ["slotBlur", "rayLength", "rayElevation", "glowThreshold"].includes(key) ? String(Number(n.toFixed(2))) : `${Math.round(n * 100)}%`}
            onChange={next => onChange({ disc: { ...disc, [key]: next } })} />;
        })}
        </div>
      </details>)}
      <Section
        title={`Title collection (${items.length} / ${PROOF_LIMITS.items})`}
        scope="Page"
        hint={`The first ${DISC_SLOT_LIMIT} images appear around the disc in this order. All titles remain in the collection below it.`}
      >
        <div ref={attach} style={{ display: "contents" }}>
        {items.map((it, i) => (
          <div key={i} className={styles.slot} {...reItem(i)}>
            <div className={styles.slotHead}>
              {reGrip(i, items.length)}
              {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the chosen title */}
              {it.src && <img className={styles.slotThumb} src={resizedSrc(it.src, 240)} alt="" />}
              <span className={styles.slotIndex}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.controlHint}>{i < DISC_SLOT_LIMIT ? "On disc" : "Collection only"}</span>
              <span className={styles.slotActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove ${it.film}`}
                  onClick={() =>
                    askDelete({
                      what: `the slate title “${it.film}”`,
                      item: it,
                      elsewhere: items.filter((_, j) => j !== i),
                      onDelete: () => setItems(items.filter((_, j) => j !== i)),
                    })
                  }
                >
                  ×
                </button>
              </span>
            </div>
            <div className={styles.slotGrid}>
              <label>
                <span>Film</span>
                <input
                  className={styles.select}
                  value={it.film}
                  maxLength={80}
                  onChange={(e) => patchItem(i, { film: e.target.value, alt: `${e.target.value} title design` })}
                />
              </label>
              <label>
                <span>Tag</span>
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
                <span>Opens</span>
                <select className={styles.select} value={it.slug} onChange={(e) => patchItem(i, { slug: e.target.value })}>
                  {projects.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.slotWide}>
                <span>Image</span>
                <button type="button" className={styles.picture} onClick={() => setPicking(picking === i ? null : i)} aria-expanded={picking === i} title="Choose a different picture for this card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the card's current picture */}
                  {it.src && <img src={resizedSrc(it.src, 480)} alt="" />}
                  <span>{picking === i ? "Close the pictures" : it.src ? "Change the picture" : "Upload or choose a picture"}</span>
                </button>
                {picking === i && <ImagePicker value={it.src} onPick={(src) => patchItem(i, { src })} onClose={() => setPicking(null)} />}
              </div>
              <div className={`${styles.slotWide} ${styles.slotTint}`}>
                <span>Glass tint</span>
                <span className={styles.colorField}>
                  <input
                    type="color"
                    aria-label={`Glass tint for ${it.film}`}
                    className={styles.swatch}
                    value={it.tint ?? "#dde5f2"}
                    onChange={(e) => patchItem(i, { tint: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={!it.tint}
                    onClick={() => patchItem(i, { tint: undefined })}
                  >
                    {it.tint ? "Use default glass" : "Default glass colour"}
                  </button>
                </span>
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

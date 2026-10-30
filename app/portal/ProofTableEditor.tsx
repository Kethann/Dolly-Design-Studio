"use client";

import { useConfirmDelete } from "./DeleteDialog";
import { resizedSrc } from "@/lib/images";
import { useRef, useState } from "react";
import type { ProofItem } from "@/content/proof-table";
import { PROOF_LIMITS, type ProofTableSettings } from "@/lib/intro/settings";
import { ColorRow, Section, Slider, Toggle, percent } from "./controls";
import { ImagePicker, useMedia } from "./ContentEditor";
import styles from "./portal.module.css";
import { moveTo, useReorder } from "./reorder";

/**
 * Portal controls for the Proof Table (the 3D collaborations section): the cards (add, remove, reorder, upload a
 * new title), their size, the glass and how long the section plays. Everything previews live.
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
  const images = media.images; // everything uploaded anywhere in the portal
  const [upload, setUpload] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  /** The card whose picture is being chosen. */
  const [picking, setPicking] = useState<number | null>(null);

  const items = value.items;
  const setItems = (next: ProofItem[]) => onChange({ items: next });
  const patchItem = (i: number, patch: Partial<ProofItem>) =>
    setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const { attach, item: reItem, grip: reGrip } = useReorder((from, to) => setItems(moveTo(items, from, to)));
  const full = items.length >= PROOF_LIMITS.items;
  const addCard = (src?: string) => {
    if (full) return;
    const unused = images.find((im) => !items.some((it) => it.src === im));
    const image = src ?? unused ?? images[0] ?? items[0]?.src;
    if (!image) return;
    setItems([
      ...items,
      {
        src: image,
        type: "title-png",
        film: "New title",
        year: new Date().getFullYear(),
        tag: "Title",
        slug: "title-designs",
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
      <Section title="Proof Table" scope="Page" hint="The 3D section where your titles drop onto a lit proofing table.">
        <Toggle label="Show the section" checked={value.enabled} onChange={(enabled) => onChange({ enabled })} />
        <div className={styles.control}>
          <button type="button" className={styles.ghostButton} onClick={onShow}>
            Show it in the preview ↓
          </button>
        </div>
        <Slider
          label="Scroll length"
          value={value.length}
          min={0.8}
          max={4}
          step={0.1}
          format={(v) => `${v.toFixed(1)} screens`}
          hint="How much scrolling the story takes. Shorter plays it faster."
          onChange={(length) => onChange({ length })}
        />
        <Slider
          label="Card size"
          hint="100% fills the glass; more cards automatically make each card smaller."
          value={value.cardSize}
          min={0.25}
          max={1}
          step={0.05}
          format={percent}
          onChange={(cardSize) => onChange({ cardSize })}
        />
      </Section>

      <Section title="Glass slab" scope="Page" hint="The slim pane of glass the cards lie on.">
        <ColorRow label="Slab tint" value={value.slabColor} onChange={(slabColor) => onChange({ slabColor })} />
        <Slider
          label="Slab opacity"
          value={value.slabOpacity}
          min={0.05}
          max={1}
          step={0.05}
          format={percent}
          hint="Lower is clearer glass; the page behind shows through."
          onChange={(slabOpacity) => onChange({ slabOpacity })}
        />
      </Section>

      <Section title="Card glass" scope="Page" hint="The glass plate each title is mounted on.">
        <ColorRow label="Glass colour" value={value.glassColor} onChange={(glassColor) => onChange({ glassColor })} />
        <Slider
          label="Glass opacity"
          value={value.glassOpacity}
          min={0.15}
          max={1}
          step={0.05}
          format={percent}
          hint="Lower lets more of the lit table show through."
          onChange={(glassOpacity) => onChange({ glassOpacity })}
        />
        <Slider
          label="Frosted blur"
          value={value.frost}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="Frosts the glass so the light behind it softens. Off = clear glass."
          onChange={(frost) => onChange({ frost })}
        />
        <Slider
          label="Reflection"
          value={value.reflection}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="How much the glass mirrors the room light. Lower it if the shine covers the titles."
          onChange={(reflection) => onChange({ reflection })}
        />
      </Section>

      <Section
        title={`Cards (${items.length} / ${PROOF_LIMITS.items})`}
        scope="Page"
        hint="They drop in this order, on phones too."
      >
        <div ref={attach} style={{ display: "contents" }}>
        {items.map((it, i) => (
          <div key={i} className={styles.slot} {...reItem(i)}>
            <div className={styles.slotHead}>
              {reGrip(i, items.length)}
              {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the chosen title */}
              <img className={styles.slotThumb} src={resizedSrc(it.src, 240)} alt="" />
              <span className={styles.slotIndex}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.slotActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove ${it.film}`}
                  disabled={items.length <= 1}
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
                  <img src={resizedSrc(it.src, 480)} alt="" />
                  <span>{picking === i ? "Close the pictures" : "Change the picture"}</span>
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
                    value={it.tint ?? value.glassColor}
                    onChange={(e) => patchItem(i, { tint: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={!it.tint}
                    onClick={() => patchItem(i, { tint: undefined })}
                  >
                    {it.tint ? "Use the glass colour" : "Same as the glass colour"}
                  </button>
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className={styles.slotFooter}>
          <button type="button" className={styles.ghostButton} disabled={full} onClick={() => addCard()}>
            + Add a card
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

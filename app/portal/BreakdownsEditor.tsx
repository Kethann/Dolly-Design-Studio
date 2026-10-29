"use client";

import { useRef, useState } from "react";
import type { BreakdownLayer } from "@/lib/content/types";
import { MAX_BREAKDOWNS, MAX_BREAKDOWN_LAYERS } from "@/lib/content/limits";
import { DropZone, FieldView, useEditor, useUploads } from "./ContentEditor";
import type { Field } from "./content-schema";
import { canvasToPng, readPsdLayers } from "./psd";
import styles from "./content.module.css";
import bd from "./breakdowns.module.css";

/** "0003-Speaker cone.png" → "Speaker cone": a readable first label from a layer's file name. */
const labelFrom = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/^[\d\s_.-]+/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase()) || "Layer";

const PAGE_FIELDS: Field[] = [
  { kind: "text", path: "breakdownsPage.label", label: "Small heading", style: true },
  { kind: "text", path: "breakdownsPage.title", label: "Page heading", style: true },
  { kind: "area", path: "breakdownsPage.intro", label: "Introduction under the heading", style: true },
  { kind: "text", path: "breakdownsPage.backLink", label: "Back link" },
];

/**
 * Breakdowns: layered artworks that fall apart into their layers when someone hovers them on the site. Each breakdown
 * is one finished image made of as many transparent PNG layers as the design file has, each with its own label.
 */
export function BreakdownsEditor({ onShow, initialOpen }: { onShow: (index: number | null) => void; /** Open this breakdown first (the Edit button on one of the page's entries). */ initialOpen?: number }) {
  const { content, update, media } = useEditor();
  const items = content.breakdowns;
  const [open, setOpen] = useState<number | null>(initialOpen !== undefined && initialOpen < items.length ? initialOpen : items.length ? 0 : null);
  /** Why the last layer upload added fewer files than were chosen. */
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (i: number, fn: (b: (typeof items)[number]) => (typeof items)[number]) =>
    update((c) => ({ ...c, breakdowns: c.breakdowns.map((b, j) => (j === i ? fn(b) : b)) }));
  const move = (i: number, by: number) =>
    update((c) => {
      const j = i + by;
      if (j < 0 || j >= c.breakdowns.length) return c;
      const next = [...c.breakdowns];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, breakdowns: next };
    });
  const moveLayer = (i: number, k: number, by: number) =>
    patch(i, (x) => {
      const j = k + by;
      if (j < 0 || j >= x.layers.length) return x;
      const layers = [...x.layers];
      [layers[k], layers[j]] = [layers[j], layers[k]];
      return { ...x, layers };
    });
  const choose = (i: number | null) => {
    setOpen(i);
    onShow(i);
  };

  return (
    <div className={styles.page}>
      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>How it works</div>
        <div className={styles.sectionBody}>
          <p className={styles.hint}>
            The “Breakdowns” card in <strong>How we work</strong> opens its own page on the site (<strong>/breakdowns</strong>), made like the other pages.
            Every breakdown below follows the one before it down that page. Each shows your finished artwork; when someone puts the cursor on it, it falls
            apart into its layers, each with a numbered line and the label you give it. Add as many breakdowns as you like, and as many layers as your file has.
          </p>
          <button
            type="button"
            className={styles.add}
            onClick={() => {
              update((c) => ({ ...c, breakdowns: [...c.breakdowns, { title: "New breakdown", note: "", description: "", layers: [], spread: "normal", turn: "side", labels: true, textPosition: "left" }] }));
              choose(items.length);
            }}
            disabled={items.length >= MAX_BREAKDOWNS}
          >
            ＋ Add a breakdown
          </button>
          <p className={styles.hint} role="status" data-full={items.length >= MAX_BREAKDOWNS}>
            {items.length >= MAX_BREAKDOWNS
              ? `You have reached the limit of ${MAX_BREAKDOWNS} breakdowns. Delete one to add another.`
              : `${items.length} of ${MAX_BREAKDOWNS} breakdowns used. Each can hold up to ${MAX_BREAKDOWN_LAYERS} layers.`}
          </p>
        </div>
      </section>

      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>The page&apos;s heading and text</div>
        <div className={styles.sectionBody}>
          {PAGE_FIELDS.map((f) => (
            <FieldView key={f.path} field={f} />
          ))}
        </div>
      </section>

      {items.map((b, i) => (
        <section key={i} className={styles.section} data-open={open === i}>
          <div className={styles.cardHead}>
            <button type="button" className={styles.sectionHead} aria-expanded={open === i} onClick={() => choose(open === i ? null : i)}>
              <span className={styles.chev} aria-hidden="true">
                ›
              </span>
              {i + 1}. {b.title || "Breakdown"} <em className={styles.badge}>{b.layers.length} layers</em>
            </button>
            <span className={styles.mini}>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button
                type="button"
                aria-label="Delete this breakdown"
                onClick={() => {
                  if (window.confirm(`Delete the breakdown “${b.title}” and its layer list? (The pictures stay in your library.)`)) {
                    update((c) => ({ ...c, breakdowns: c.breakdowns.filter((_, j) => j !== i) }));
                    choose(null);
                  }
                }}
              >
                ×
              </button>
            </span>
          </div>

          {open === i && (
            <div className={styles.sectionBody}>
              <label className={styles.field}>
                <span className={styles.label}>Title</span>
                <input className={styles.input} value={b.title} onChange={(e) => patch(i, (x) => ({ ...x, title: e.target.value }))} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>A line about it (optional)</span>
                <input className={styles.input} value={b.note} onChange={(e) => patch(i, (x) => ({ ...x, note: e.target.value }))} placeholder="e.g. Poster for the first look — 9 layers" />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  Description <em>shown on the left of the artwork — a blank line starts a new paragraph</em>
                </span>
                <textarea
                  className={styles.input}
                  rows={5}
                  maxLength={1200}
                  value={b.description}
                  onChange={(e) => patch(i, (x) => ({ ...x, description: e.target.value }))}
                  placeholder="Tell the story: what the design is for, the idea behind it, the tools and steps you used…"
                />
              </label>

              <p className={styles.hint} role="status" data-full={b.layers.length >= MAX_BREAKDOWN_LAYERS}>
                {b.layers.length} of {MAX_BREAKDOWN_LAYERS} layers used{b.layers.length >= MAX_BREAKDOWN_LAYERS ? " — this breakdown is full. Remove a layer to add another." : "."}
              </p>
              {notice && (
                <p className={/^Added/.test(notice) ? styles.hint : styles.error} role={/^Added/.test(notice) ? "status" : "alert"}>
                  {notice}{" "}
                  <button type="button" className={styles.pill} onClick={() => setNotice(null)}>
                    Dismiss
                  </button>
                </p>
              )}
              {b.layers.length < MAX_BREAKDOWN_LAYERS && (
                <PsdImport
                  room={MAX_BREAKDOWN_LAYERS - b.layers.length}
                  upload={media.upload}
                  onNotice={setNotice}
                  onLayers={(added) => patch(i, (x) => ({ ...x, layers: [...x.layers, ...added] }))}
                />
              )}
              <LayerUpload
                full={b.layers.length >= MAX_BREAKDOWN_LAYERS}
                onFiles={async (files, start) => {
                  // In the order of the file names, each becoming the next layer up, named after its file.
                  const sorted = [...files].sort((a, b2) => a.name.localeCompare(b2.name, undefined, { numeric: true }));
                  const room = MAX_BREAKDOWN_LAYERS - b.layers.length;
                  if (sorted.length > room) {
                    setNotice(
                      room <= 0
                        ? `This breakdown already has ${MAX_BREAKDOWN_LAYERS} layers, the most it can hold. Nothing was added.`
                        : `A breakdown holds up to ${MAX_BREAKDOWN_LAYERS} layers. Only the first ${room} of the ${sorted.length} files you chose were added; the other ${sorted.length - room} were skipped.`,
                    );
                  } else setNotice(null);
                  if (room <= 0) return;
                  await start(sorted.slice(0, room), (src, file) => {
                    const layer: BreakdownLayer = { image: src, label: labelFrom(file.name) };
                    patch(i, (x) => ({ ...x, layers: [...x.layers, layer] }));
                  });
                }}
                upload={media.upload}
              />

              <div className={styles.label}>
                Layers <em>bottom first, top last — click a name to rename it</em>
              </div>
              {b.layers.length === 0 ? (
                <p className={bd.empty}>No layers yet. Drop your PNG layers above.</p>
              ) : (
                <div className={bd.layers}>
                  {b.layers.map((l, k) => (
                    <div key={`${l.image}-${k}`} className={bd.row}>
                      <span className={bd.num}>{k + 1}</span>
                      <span className={bd.thumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- small preview of a library picture */}
                        <img src={l.image} alt="" />
                      </span>
                      <input
                        className={bd.name}
                        value={l.label}
                        maxLength={60}
                        placeholder={`Name layer ${k + 1}`}
                        aria-label={`Label for layer ${k + 1}`}
                        onChange={(e) => patch(i, (x) => ({ ...x, layers: x.layers.map((y, j) => (j === k ? { ...y, label: e.target.value } : y)) }))}
                      />
                      <ReplaceLayer
                        upload={media.upload}
                        onDone={(src) => patch(i, (x) => ({ ...x, layers: x.layers.map((y, j) => (j === k ? { ...y, image: src } : y)) }))}
                      />
                      <span className={styles.mini}>
                        <button type="button" aria-label="Move this layer down (towards the bottom)" disabled={k === 0} onClick={() => moveLayer(i, k, -1)}>
                          ↑
                        </button>
                        <button type="button" aria-label="Move this layer up (towards the top)" disabled={k === b.layers.length - 1} onClick={() => moveLayer(i, k, 1)}>
                          ↓
                        </button>
                        <button type="button" aria-label="Remove this layer" onClick={() => patch(i, (x) => ({ ...x, layers: x.layers.filter((_, j) => j !== k) }))}>
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Choice
                label="How far the layers spread"
                value={b.spread}
                options={[
                  ["tight", "Close"],
                  ["normal", "Normal"],
                  ["wide", "Far apart"],
                ]}
                onPick={(v) => patch(i, (x) => ({ ...x, spread: v }))}
              />
              <Choice
                label="Viewing angle"
                value={b.turn}
                options={[
                  ["side", "From the side"],
                  ["angled", "Tilted"],
                ]}
                onPick={(v) => patch(i, (x) => ({ ...x, turn: v }))}
              />
              <Choice
                label="Where the title and text go"
                value={b.textPosition}
                options={[
                  ["left", "Left of the picture"],
                  ["right", "Right"],
                  ["top", "Above"],
                  ["bottom", "Below"],
                ]}
                onPick={(v) => patch(i, (x) => ({ ...x, textPosition: v }))}
              />
              <Choice
                label="Numbered label lines"
                value={b.labels ? "on" : "off"}
                options={[
                  ["on", "Show"],
                  ["off", "Hide"],
                ]}
                onPick={(v) => patch(i, (x) => ({ ...x, labels: v === "on" }))}
              />

              <div className={styles.rowSplit}>
                <button
                  type="button"
                  className={styles.pill}
                  disabled={b.layers.length < 2}
                  onClick={() => patch(i, (x) => ({ ...x, layers: [...x.layers].reverse() }))}
                  title="If the layers came out of your design file top-first, flip them"
                >
                  ⇅ Reverse the layer order
                </button>
                <button type="button" className={styles.pill} onClick={() => onShow(i)}>
                  ▶ Show it on the page preview
                </button>
                <button
                  type="button"
                  className={styles.pill}
                  disabled={items.length >= MAX_BREAKDOWNS}
                  title={items.length >= MAX_BREAKDOWNS ? `The limit is ${MAX_BREAKDOWNS} breakdowns` : undefined}
                  onClick={() => {
                    update((c) => ({ ...c, breakdowns: [...c.breakdowns, { ...b, title: `${b.title} copy`, layers: b.layers.map((l) => ({ ...l })) }] }));
                    choose(items.length);
                  }}
                >
                  ⧉ Duplicate this breakdown
                </button>
              </div>
              <p className={styles.hint}>
                The preview scrolls to this breakdown and takes it apart. Layers must all be the same size (export them from your design file at the same
                canvas size), so they line up when stacked.
              </p>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** A small button that swaps a layer's picture for a new upload, keeping its name and its place in the stack. */
function ReplaceLayer({ upload, onDone }: { upload: (file: File, onProgress?: (percent: number) => void) => Promise<string>; onDone: (src: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  return (
    <>
      <button
        type="button"
        className={styles.pill}
        disabled={state.busy}
        title={state.error || "Replace this layer's picture (its name and place stay)"}
        aria-label="Replace this layer's picture"
        onClick={() => input.current?.click()}
      >
        {state.busy ? "…" : state.error ? "⚠" : "⇄"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/*,.png,.jpg,.jpeg,.webp,.avif,.gif,.svg,.bmp,.ico,.tif,.tiff"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setState({ busy: true, error: "" });
          try {
            onDone(await upload(file));
            setState({ busy: false, error: "" });
          } catch (err) {
            setState({ busy: false, error: err instanceof Error ? err.message : "Upload failed." });
          }
        }}
      />
    </>
  );
}

/**
 * A drop area for a Photoshop file: every visible pixel layer in it becomes a breakdown layer (named after the layer, in
 * Photoshop's own order, each the size of the whole canvas so they line up). Nothing to export by hand.
 */
function PsdImport({
  room,
  upload,
  onNotice,
  onLayers,
}: {
  room: number;
  upload: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
  onNotice: (message: string | null) => void;
  onLayers: (layers: BreakdownLayer[]) => void;
}) {
  const uploads = useUploads<{ layers: BreakdownLayer[]; message: string }>("psd", async (file, progress) => {
    progress(1);
    const psd = await readPsdLayers(file);
    if (!psd.layers.length) throw new Error("No visible pixel layers were found in this file.");
    const take = psd.layers.slice(0, room);
    const out: BreakdownLayer[] = [];
    for (let k = 0; k < take.length; k++) {
      const name = take[k].name || `Layer ${k + 1}`;
      const png = await canvasToPng(take[k].draw(), `${String(k + 1).padStart(2, "0")}-${name.replace(/[^\w\- ]+/g, "").trim() || "layer"}.png`);
      const src = await upload(png, (p) => progress(Math.round(((k + p / 100) / take.length) * 100)));
      out.push({ image: src, label: name.slice(0, 60) });
    }
    const parts = [`Added ${out.length} layer${out.length === 1 ? "" : "s"} from the Photoshop file.`];
    if (psd.skipped) parts.push(`${psd.skipped} hidden or empty layer${psd.skipped === 1 ? " was" : "s were"} left out.`);
    if (psd.layers.length > take.length) parts.push(`A breakdown holds ${MAX_BREAKDOWN_LAYERS} layers, so the last ${psd.layers.length - take.length} were skipped.`);
    return { layers: out, message: parts.join(" ") };
  });
  return (
    <DropZone
      kind="psd"
      state={uploads.state}
      title="Drop a Photoshop file (.psd) here to take its layers automatically"
      hint="Every visible layer becomes a breakdown layer, named after the layer and in the same order. Hidden layers are left out, and groups are opened up."
      onFiles={(files) =>
        uploads.start(files, (result) => {
          onLayers(result.layers);
          onNotice(result.message);
        })
      }
    />
  );
}

/** A drop area that takes many PNG layers at once. */
function LayerUpload({
  onFiles,
  upload,
  full,
}: {
  full?: boolean;
  onFiles: (files: File[], start: (files: File[], onEach: (src: string, file: File) => void) => Promise<void>) => Promise<void>;
  upload: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
}) {
  const uploads = useUploads<string>("image", (f, p) => upload(f, p));
  if (full) return null; // the drop area gives way to the "full" message above it
  return (
    <DropZone
      kind="image"
      multiple
      state={uploads.state}
      title="Drop all your layer PNGs here, or click to choose"
      hint="Select every layer file at once. They are added in file-name order, each named after its file — you can rename them and change the order below."
      onFiles={(files) => onFiles(files, (fs, each) => uploads.start(fs, each))}
    />
  );
}

/** A small set of buttons to pick one option from. */
function Choice<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className={bd.setting} role="group" aria-label={label}>
      <span className={bd.settingLabel}>{label}</span>
      <div className={bd.choices}>
        {options.map(([v, text]) => (
          <button key={v} type="button" className={styles.pill} data-on={value === v} aria-pressed={value === v} onClick={() => onPick(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

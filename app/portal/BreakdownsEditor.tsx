"use client";

import { useState } from "react";
import type { BreakdownLayer } from "@/lib/content/types";
import { DropZone, FieldView, useEditor, useUploads } from "./ContentEditor";
import type { Field } from "./content-schema";
import styles from "./content.module.css";

/** "0003-Speaker cone.png" → "Speaker cone": a readable first label from a layer's file name. */
const labelFrom = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/^[\d\s_.-]+/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase()) || "Layer";

const LAYERS_FIELD: Extract<Field, { kind: "list" }> = {
  kind: "list",
  path: "layers",
  label: "Layers — the bottom one first, the top one last",
  add: "Add one layer",
  max: 24,
  min: 1,
  title: (it, i) => `${i + 1}. ${(it.label as string) || "Unnamed layer"}`,
  blank: () => ({ image: "", label: "" }),
  fields: [
    { kind: "text", path: "label", label: "Label shown on its line" },
    { kind: "image", path: "image", label: "Picture (a transparent PNG)" },
  ],
};

/**
 * Breakdowns: layered artworks that fall apart into their layers when someone hovers them on the site. Each breakdown
 * is one finished image made of as many transparent PNG layers as the design file has, each with its own label.
 */
export function BreakdownsEditor({ onShow }: { onShow: (index: number | null) => void }) {
  const { content, update, media } = useEditor();
  const items = content.breakdowns;
  const [open, setOpen] = useState<number | null>(items.length ? 0 : null);

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
            On the site, the “Breakdowns” card in <strong>How we work</strong> opens a viewer. It shows your finished artwork; when someone puts the cursor on the
            image, it falls apart into its layers, each with a numbered line and the label you give it. Add as many layers as your file has, and as many
            breakdowns as you like.
          </p>
          <button
            type="button"
            className={styles.add}
            onClick={() => {
              update((c) => ({ ...c, breakdowns: [...c.breakdowns, { title: "New breakdown", note: "", layers: [] }] }));
              choose(items.length);
            }}
            disabled={items.length >= 12}
          >
            ＋ Add a breakdown
          </button>
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

              <LayerUpload
                onFiles={async (files, start) => {
                  // In the order of the file names, each becoming the next layer up, named after its file.
                  const sorted = [...files].sort((a, b2) => a.name.localeCompare(b2.name, undefined, { numeric: true }));
                  await start(sorted, (src, file) => {
                    const layer: BreakdownLayer = { image: src, label: labelFrom(file.name) };
                    patch(i, (x) => ({ ...x, layers: [...x.layers, layer] }));
                  });
                }}
                upload={media.upload}
              />

              <FieldView field={LAYERS_FIELD} base={`breakdowns.${i}.`} />

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
                  ▶ Show it in the preview
                </button>
              </div>
              <p className={styles.hint}>
                In the preview, put the cursor on the artwork to see it break apart. Layers must all be the same size (export them from your design file at the same
                canvas size), so they line up when stacked.
              </p>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** A drop area that takes many PNG layers at once. */
function LayerUpload({
  onFiles,
  upload,
}: {
  onFiles: (files: File[], start: (files: File[], onEach: (src: string, file: File) => void) => Promise<void>) => Promise<void>;
  upload: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
}) {
  const uploads = useUploads<string>("image", (f, p) => upload(f, p));
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

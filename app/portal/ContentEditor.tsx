"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { allFonts } from "@/lib/content/fonts";
import { fontFaceCss, glassVars } from "@/lib/content/css";
import { DEFAULT_GLASS, DEFAULT_MENU_TONES, GLASS_COLOR_COUNT, GLASS_EFFECTS, GLASS_PRESETS, type GlassLook, type PageKey, type SiteContent, type TextStyle } from "@/lib/content/types";
import { Choice, ColorRow, Slider } from "./controls";
import { styledTexts, type Field, type SchemaPage, type SchemaSection } from "./content-schema";
import { MAX_CATEGORIES, MAX_CATEGORY_LENGTH } from "@/lib/content/limits";
import type { Problem } from "./validate";
import { checkFile, postFile, UPLOAD_KINDS, type UploadKind } from "./upload";
import { fileSizeLabel } from "./image-info";
import styles from "./content.module.css";

// ── shared state: the draft content, and the image library ───────────────────────────────────────────────────────

export interface MediaApi {
  images: string[];
  /** The pictures that were uploaded in the portal, and so can be deleted for good. */
  removable: string[];
  /** Deletes an uploaded picture from the storage completely (the caller has already asked "are you sure?"). */
  remove: (src: string) => Promise<void>;
  /** Adds a picture that was uploaded somewhere else to the shared library, so it shows up everywhere. */
  add: (src: string) => void;
  upload: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
}

interface EditorValue {
  content: SiteContent;
  update: (fn: (c: SiteContent) => SiteContent) => void;
  media: MediaApi;
}

const EditorCtx = createContext<EditorValue | null>(null);

/** The shared picture library: everything uploaded anywhere in the portal is listed here, for every picker. */
export const useMedia = () => {
  const v = useContext(EditorCtx);
  if (!v) throw new Error("Editor context missing");
  return v.media;
};
export const EditorProvider = EditorCtx.Provider;
export const useEditor = () => {
  const v = useContext(EditorCtx);
  if (!v) throw new Error("Editor context missing");
  return v;
};

/**
 * Inside a section's editing window, a list whose items have their own Edit button on the page (projects, services,
 * numbers, cards) is shown as a compact manager (add, reorder, delete, and an Edit shortcut) instead of repeating every
 * field of every item. Each item's fields are edited in its own window, so nothing is offered twice.
 */
const ListModeCtx = createContext<{ compact: ReadonlySet<string>; openItem: (list: string, index: number) => void } | null>(null);
export const ListModeProvider = ListModeCtx.Provider;

/** What is wrong, by field path: fields show their message right under themselves. */
const ProblemsCtx = createContext<Problem[]>([]);
export const ProblemsProvider = ProblemsCtx.Provider;

// ── path helpers: "home.process.cards.2.title" ──────────────────────────────────────────────────────────────────

const keys = (path: string) => path.split(".").filter(Boolean);

export function getAt(obj: unknown, path: string): unknown {
  return keys(path).reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setAt<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = keys(path);
  if (head === undefined) return value as T;
  const copy = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string, unknown>;
  copy[head] = rest.length ? setAt(copy[head] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join("."), value) : value;
  return copy as T;
}

/** "home.process.cards.2.title" → "home.process.cards.title": the key a text's style is stored under. */
const styleKey = (path: string) => path.replace(/\.\d+(?=\.|$)/g, "");

export const moveItem = <T,>(list: T[], i: number, by: number) => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// ── text style controls (font, size, weight…) ───────────────────────────────────────────────────────────────────

const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

export function StyleControls({ value, onChange }: { value: TextStyle; onChange: (next: TextStyle | null) => void }) {
  const { content } = useEditor();
  const fonts = allFonts(content.customFonts);
  const patch = (p: Partial<TextStyle>) => {
    const next = { ...value, ...p } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === false) delete next[k];
    onChange(Object.keys(next).length ? (next as TextStyle) : null);
  };
  return (
    <div className={styles.style}>
      <label className={styles.row}>
        <span>Font</span>
        <select className={styles.input} value={value.font ?? ""} onChange={(e) => patch({ font: e.target.value || undefined })}>
          <option value="">Site default</option>
          {fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <Slider
        label="Size"
        value={value.size ?? 20}
        min={10}
        max={140}
        step={1}
        format={(v) => (value.size ? `${v}px` : "default")}
        onChange={(size) => patch({ size })}
      />
      <div className={styles.twoCols}>
        <label className={styles.row}>
          <span>Weight</span>
          <select className={styles.input} value={value.weight ?? ""} onChange={(e) => patch({ weight: Number(e.target.value) || undefined })}>
            <option value="">Default</option>
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={!!value.italic} onChange={(e) => patch({ italic: e.target.checked || undefined })} />
          <span>Italic</span>
        </label>
      </div>
      <Choice
        label="Alignment"
        value={value.align ?? "default"}
        options={[
          { value: "default", label: "Default" },
          { value: "left", label: "Left" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Right" },
        ]}
        onChange={(v) => patch({ align: v === "default" ? undefined : (v as TextStyle["align"]) })}
      />
      <Slider
        label="Line spacing"
        value={value.lineHeight ?? 1.4}
        min={0.9}
        max={2.4}
        step={0.05}
        format={(v) => (value.lineHeight ? v.toFixed(2) : "default")}
        onChange={(lineHeight) => patch({ lineHeight })}
      />
      <Slider
        label="Letter spacing"
        value={value.tracking ?? 0}
        min={-5}
        max={40}
        step={1}
        format={(v) => (value.tracking !== undefined ? `${v}` : "default")}
        onChange={(tracking) => patch({ tracking })}
      />
      <div className={styles.rowSplit}>
        <label className={styles.row}>
          <span>Colour</span>
          <input type="color" className={styles.swatch} value={value.color ?? "#f4ede1"} onChange={(e) => patch({ color: e.target.value })} />
        </label>
        <button type="button" className={styles.link} disabled={!value.color} onClick={() => patch({ color: undefined })}>
          Default colour
        </button>
        <button type="button" className={styles.link} onClick={() => onChange(null)}>
          Reset this text
        </button>
      </div>
    </div>
  );
}

// ── uploading: drag a file in or click, see it go, get told clearly if something is wrong ──────────────────────────

interface UploadState {
  busy: boolean;
  /** Which file of how many, and how far through it is. */
  index: number;
  total: number;
  percent: number;
  errors: string[];
}

const IDLE: UploadState = { busy: false, index: 0, total: 0, percent: 0, errors: [] };

/** Uploads a batch of files one after another, with progress and a plain message for each that can't be sent. */
export function useUploads<T>(kind: UploadKind, send: (file: File, onProgress: (percent: number) => void) => Promise<T>) {
  const [state, setState] = useState<UploadState>(IDLE);
  async function start(files: File[], onEach: (result: T, file: File) => void) {
    const errors: string[] = [];
    const ok = files.filter((f) => {
      const problem = checkFile(f, kind);
      if (problem) errors.push(problem);
      return !problem;
    });
    setState({ busy: ok.length > 0, index: 0, total: ok.length, percent: 0, errors });
    for (let i = 0; i < ok.length; i++) {
      setState((st) => ({ ...st, index: i + 1, percent: 0 }));
      try {
        onEach(await send(ok[i], (percent) => setState((st) => ({ ...st, percent }))), ok[i]);
      } catch (err) {
        errors.push(`“${ok[i].name}”: ${err instanceof Error ? err.message : "Upload failed."}`);
      }
    }
    setState({ ...IDLE, errors });
  }
  return { state, start, clearErrors: () => setState((st) => ({ ...st, errors: [] })) };
}

/** A drop target that is also a button: drag files onto it, or click to choose them. */
export function DropZone({
  kind,
  multiple,
  state,
  onFiles,
  title,
  hint,
  compact,
}: {
  kind: UploadKind;
  multiple?: boolean;
  state: UploadState;
  onFiles: (files: File[]) => void;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div className={styles.dropWrap}>
      <div
        className={styles.drop}
        data-over={over}
        data-busy={state.busy}
        data-compact={compact}
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={() => !state.busy && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !state.busy) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!state.busy) take(e.dataTransfer.files);
        }}
      >
        {state.busy ? (
          <>
            <span className={styles.dropTitle}>
              Uploading{state.total > 1 ? ` ${state.index} of ${state.total}` : ""}… {state.percent}%
            </span>
            <span className={styles.dropBar} aria-hidden="true">
              <i style={{ width: `${state.percent}%` }} />
            </span>
          </>
        ) : (
          <>
            <span className={styles.dropIcon} aria-hidden="true">
              ⬆
            </span>
            <span className={styles.dropTitle}>{over ? "Drop to upload" : title}</span>
            {hint && !compact && <span className={styles.dropHint}>{hint}</span>}
          </>
        )}
        <input
          ref={input}
          type="file"
          hidden
          multiple={multiple}
          accept={UPLOAD_KINDS[kind].accept}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {state.errors.map((m, i) => (
        <p key={i} className={styles.error}>
          {m}
        </p>
      ))}
    </div>
  );
}

// ── image picking ───────────────────────────────────────────────────────────────────────────────────────────────

export function ImagePicker({ value, onPick, onClose }: { value: string; onPick: (src: string) => void; onClose: () => void }) {
  const { media } = useEditor();
  const [filter, setFilter] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploads = useUploads<string>("image", (f, p) => media.upload(f, p));
  const busy = uploads.state.busy;
  const shown = media.images.filter((src) => src.toLowerCase().includes(filter.toLowerCase()));
  /** The picture you upload here is used straight away. */
  const take = (list: FileList | File[] | null) => {
    const f = Array.from(list ?? [])[0];
    if (f && !busy) {
      void uploads.start([f], (src) => {
        onPick(src);
        onClose();
      });
    }
  };
  return (
    <div className={styles.picker}>
      <div className={styles.pickerHead}>
        <input className={styles.input} placeholder="Search your pictures" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" className={styles.link} onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.pickerGrid}>
        {/* The first box is always the upload box (click it, or drop a file on it); then the pictures you already have. */}
        <button
          type="button"
          className={styles.pickerUpload}
          data-over={over}
          data-busy={busy}
          aria-label="Upload a new picture"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          {busy ? (
            <>
              <span>{uploads.state.percent}%</span>
              <i aria-hidden="true">
                <b style={{ width: `${uploads.state.percent}%` }} />
              </i>
            </>
          ) : (
            <>
              <strong aria-hidden="true">＋</strong>
              <span>{over ? "Drop it" : "Upload"}</span>
            </>
          )}
        </button>
        {shown.map((src) => (
          <button
            key={src}
            type="button"
            className={styles.pickerTile}
            data-on={src === value}
            title={src.replace("/images/", "")}
            aria-label={`Use ${src.replace("/images/", "")}`}
            onClick={() => {
              onPick(src);
              onClose();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny library thumbnails */}
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
        {shown.length === 0 && filter && <p className={styles.hint}>No picture matches “{filter}”.</p>}
      </div>
      {uploads.state.errors.map((m, i) => (
        <p key={i} className={styles.error} role="alert">
          {m}
        </p>
      ))}
      <input
        ref={input}
        type="file"
        hidden
        accept={UPLOAD_KINDS.image.accept}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The same chooser in a window of its own, for places with no room for it inline. */
export function PickerDialog({ title, value, onPick, onClose }: { title: string; value: string; onPick: (src: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.pickerBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.pickerDialog} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <ImagePicker value={value} onPick={onPick} onClose={onClose} />
      </div>
    </div>
  );
}

const SHAPE_CHOICES = [
  ["round", "Round"],
  ["rounded", "Rounded"],
  ["square", "Square"],
] as const;
const SIZE_CHOICES = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
] as const;

/**
 * One picture, all in one place: a preview, Upload (or drop a file on it), pick from the library, Remove, a
 * description, and (where the page has them) its shape and size.
 */
function ImageField({ field, path }: { field: Extract<Field, { kind: "image" }>; path: string }) {
  const { content, update, media } = useEditor();
  const value = (getAt(content, path) as string) || "";
  const sibling = (name: string) => path.replace(/[^.]+$/, name);
  const altPath = field.alt ? sibling(field.alt) : null;
  const shapePath = field.shape ? sibling(field.shape) : null;
  const sizePath = field.size ? sibling(field.size) : null;
  const alt = altPath ? ((getAt(content, altPath) as string) ?? "") : "";
  const shape = shapePath ? ((getAt(content, shapePath) as string) ?? "round") : "round";
  const size = sizePath ? ((getAt(content, sizePath) as string) ?? "medium") : "medium";
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploads = useUploads<string>("image", (f, p) => media.upload(f, p));
  const set = (src: string) => update((c) => setAt(c, path, src));
  const setSibling = (p: string, v: string) => update((c) => setAt(c, p, v));
  const take = (list: FileList | File[] | null) => {
    const f = Array.from(list ?? [])[0];
    if (f && !uploads.state.busy) void uploads.start([f], (src) => set(src)); // the new picture is used straight away
  };
  const name = value ? decodeURIComponent(value.split("/").pop() ?? "") : "";
  const busy = uploads.state.busy;

  return (
    <div className={styles.field}>
      <span className={styles.label}>{field.label}</span>
      <div className={styles.imageBox}>
        <div
          className={styles.imageDrop}
          data-over={over}
          data-shape={shapePath ? shape : undefined}
          role="button"
          tabIndex={0}
          title="Click to choose or upload a picture"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- a preview of the chosen picture
            <img src={value} alt={alt || ""} />
          ) : (
            <span>{over ? "Drop it here" : "No picture yet"}</span>
          )}
          {busy && (
            <span className={styles.imageBusy} role="status">
              Uploading… {uploads.state.percent}%
            </span>
          )}
        </div>
        <div className={styles.imageSide}>
          <div className={styles.imageButtons}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => input.current?.click()}>
              ⬆ {value ? "Upload a new picture" : "Upload a picture"}
            </button>
            <button type="button" className={styles.pill} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              Choose a picture
            </button>
            {value && (
              <button type="button" className={styles.link} onClick={() => set("")}>
                Remove
              </button>
            )}
          </div>
          <p className={styles.imageName}>
            {value ? name : "Drop a file on the preview, or press Upload."} <em>{value ? fileSizeLabel(value) : ""}</em>
          </p>
          {field.hint && <p className={styles.hint}>{field.hint}</p>}
        </div>
        <input
          ref={input}
          type="file"
          hidden
          accept={UPLOAD_KINDS.image.accept}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.state.errors.map((m, i) => (
        <p key={i} className={styles.error} role="alert">
          {m}
        </p>
      ))}

      {altPath && (
        <label className={styles.field}>
          <span className={styles.label}>
            Description <em>what the picture shows, for screen readers and search engines</em>
          </span>
          <input className={styles.input} value={alt} maxLength={200} placeholder="e.g. Sasank Muppalla at his desk" onChange={(e) => setSibling(altPath, e.target.value)} />
        </label>
      )}
      {(shapePath || sizePath) && (
        <div className={styles.imageOptions}>
          {shapePath && (
            <div role="group" aria-label="Shape">
              <span className={styles.label}>Shape</span>
              <div className={styles.choices}>
                {SHAPE_CHOICES.map(([v, text]) => (
                  <button key={v} type="button" className={styles.pill} data-on={shape === v} aria-pressed={shape === v} onClick={() => setSibling(shapePath, v)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sizePath && (
            <div role="group" aria-label="Size">
              <span className={styles.label}>Size</span>
              <div className={styles.choices}>
                {SIZE_CHOICES.map(([v, text]) => (
                  <button key={v} type="button" className={styles.pill} data-on={size === v} aria-pressed={size === v} onClick={() => setSibling(sizePath, v)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {open && <ImagePicker value={value} onPick={set} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── fields ──────────────────────────────────────────────────────────────────────────────────────────────────────

function StyleToggle({ path }: { path: string }) {
  const { content, update } = useEditor();
  const [open, setOpen] = useState(false);
  const key = styleKey(path);
  const style = content.type[key] ?? {};
  const customised = Object.keys(style).length > 0;
  return (
    <>
      <button
        type="button"
        className={styles.aa}
        data-on={customised}
        aria-expanded={open}
        title="Font, size and look of this text"
        onClick={() => setOpen((o) => !o)}
      >
        Aa
      </button>
      {open && (
        <div className={styles.styleWrap}>
          <StyleControls
            value={style}
            onChange={(next) =>
              update((c) => {
                const type = { ...c.type };
                if (next) type[key] = next;
                else delete type[key];
                return { ...c, type };
              })
            }
          />
        </div>
      )}
    </>
  );
}

function TextInput({ field, path }: { field: Extract<Field, { kind: "text" | "area" }>; path: string }) {
  const { content, update } = useEditor();
  const value = (getAt(content, path) as string | undefined) ?? "";
  const set = (v: string) => update((c) => setAt(c, path, v));
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{field.label}</span>
        {field.style && <StyleToggleButtonSlot path={path} />}
      </div>
      {field.kind === "area" ? (
        <textarea className={styles.input} rows={Math.min(14, Math.max(3, Math.ceil(value.length / 48) + 1))} value={value} onChange={(e) => set(e.target.value)} />
      ) : (
        <input className={styles.input} value={value} onChange={(e) => set(e.target.value)} />
      )}
      {field.hint && <p className={styles.hint}>{field.hint}</p>}
      {field.style && <StyleToggleBody path={path} />}
    </div>
  );
}

/* The “Aa” button sits beside the label while its controls open under the field; they share one open state. */
const StyleOpenCtx = createContext<{ open: boolean; toggle: () => void } | null>(null);
function StyleToggleButtonSlot({ path }: { path: string }) {
  const { content } = useEditor();
  const ctx = useContext(StyleOpenCtx);
  const customised = Object.keys(content.type[styleKey(path)] ?? {}).length > 0;
  return (
    <button type="button" className={styles.aa} data-on={customised} aria-expanded={ctx?.open} title="Font, size and look of this text" onClick={ctx?.toggle}>
      Aa
    </button>
  );
}
function StyleToggleBody({ path }: { path: string }) {
  const { content, update } = useEditor();
  const ctx = useContext(StyleOpenCtx);
  if (!ctx?.open) return null;
  const key = styleKey(path);
  return (
    <div className={styles.styleWrap}>
      <StyleControls
        value={content.type[key] ?? {}}
        onChange={(next) =>
          update((c) => {
            const type = { ...c.type };
            if (next) type[key] = next;
            else delete type[key];
            return { ...c, type };
          })
        }
      />
    </div>
  );
}
function WithStyleState({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <StyleOpenCtx.Provider value={{ open, toggle: () => setOpen((o) => !o) }}>{children}</StyleOpenCtx.Provider>;
}

function Stringlist({ field, path }: { field: Extract<Field, { kind: "strings" }>; path: string }) {
  const { content, update } = useEditor();
  const list = ((getAt(content, path) as string[] | undefined) ?? []).map((s) => (typeof s === "string" ? s : ""));
  const set = (next: string[]) => update((c) => setAt(c, path, next));
  return (
    <WithStyleState>
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label}>
            {field.label} <em>{list.length}</em>
          </span>
          {field.style && <StyleToggleButtonSlot path={path} />}
        </div>
        {field.style && <StyleToggleBody path={path} />}
        <div className={styles.stack}>
          {list.map((item, i) => (
            <div key={i} className={styles.stringRow}>
              {field.area ? (
                <textarea
                  className={styles.input}
                  rows={Math.min(10, Math.max(3, Math.ceil(item.length / 48) + 1))}
                  value={item}
                  onChange={(e) => set(list.map((s, j) => (j === i ? e.target.value : s)))}
                />
              ) : (
                <input className={styles.input} value={item} onChange={(e) => set(list.map((s, j) => (j === i ? e.target.value : s)))} />
              )}
              <span className={styles.mini}>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => set(moveItem(list, i, -1))}>
                  ↑
                </button>
                <button type="button" aria-label="Move down" disabled={i === list.length - 1} onClick={() => set(moveItem(list, i, 1))}>
                  ↓
                </button>
                <button type="button" aria-label="Delete" disabled={list.length <= (field.min ?? 0)} onClick={() => set(list.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" className={styles.add} onClick={() => set([...list, ""])}>
          ＋ {field.add}
        </button>
      </div>
    </WithStyleState>
  );
}

/** The project types: add, rename, reorder and remove them. Projects follow a rename; a removed type's projects move to the first one left. */
function CategoriesField({ field }: { field: Extract<Field, { kind: "categories" }> }) {
  const { content, update } = useEditor();
  const cats = content.categories;
  const count = (name: string) => content.projects.filter((p) => p.category === name).length;
  const set = (next: string[], projects = content.projects) => update((c) => ({ ...c, categories: next, projects }));

  function rename(i: number, name: string) {
    const old = cats[i];
    set(
      cats.map((c, j) => (j === i ? name : c)),
      content.projects.map((p) => (p.category === old ? { ...p, category: name } : p)),
    );
  }
  function add() {
    let n = cats.length + 1;
    while (cats.some((c) => c.toLowerCase() === `new type ${n}`)) n++;
    set([...cats, `New type ${n}`]);
  }
  function remove(i: number) {
    if (cats.length <= 1) return;
    const name = cats[i];
    const used = count(name);
    const rest = cats.filter((_, j) => j !== i);
    const msg = used
      ? `Remove “${name}”? Its ${used} project${used === 1 ? "" : "s"} will move to “${rest[0]}”. (It only changes on the site when you publish.)`
      : `Remove “${name}”?`;
    if (window.confirm(msg)) set(rest, content.projects.map((p) => (p.category === name ? { ...p, category: rest[0] } : p)));
  }

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label}>
          {field.label} <em>{cats.length} of {MAX_CATEGORIES}</em>
        </span>
      </div>
      <div className={styles.stack}>
        {cats.map((name, i) => (
          <div key={i} className={styles.stringRow}>
            <input className={styles.input} value={name} maxLength={MAX_CATEGORY_LENGTH} aria-label={`Project type ${i + 1}`} onChange={(e) => rename(i, e.target.value)} />
            <span className={styles.badge} title="Projects of this type">
              {count(name)}
            </span>
            <span className={styles.mini}>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => set(moveItem(cats, i, -1))}>
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={i === cats.length - 1} onClick={() => set(moveItem(cats, i, 1))}>
                ↓
              </button>
              <button type="button" aria-label={`Remove ${name}`} disabled={cats.length <= 1} onClick={() => remove(i)}>
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <button type="button" className={styles.add} disabled={cats.length >= MAX_CATEGORIES} onClick={add}>
        ＋ Add a project type
      </button>
      <p className={styles.hint}>These are the filter buttons above the gallery, in this order. Renaming one renames it on every project that uses it.</p>
    </div>
  );
}

/** The first picture an item has (its own image field, or the first of an "images" list), for a small preview. */
function thumbOf(item: Record<string, unknown>, field: Extract<Field, { kind: "list" }>): string {
  const imageField = field.fields.find((f) => f.kind === "image");
  if (imageField && typeof item[imageField.path] === "string") return item[imageField.path] as string;
  const first = Array.isArray(item.images) ? (item.images[0] as { src?: string } | undefined) : undefined;
  return typeof first?.src === "string" ? first.src : "";
}

function ListField({ field, path }: { field: Extract<Field, { kind: "list" }>; path: string }) {
  const { content, update } = useEditor();
  const list = (getAt(content, path) as Record<string, unknown>[] | undefined) ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const mode = useContext(ListModeCtx);
  const compact = !!mode?.compact.has(path);
  const set = (next: unknown[]) => update((c) => setAt(c, path, next));
  const atMax = field.max !== undefined && list.length >= field.max;
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label}>
          {field.label} <em>{list.length}</em>
        </span>
      </div>
      <div className={styles.stack}>
        {list.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={i} className={styles.card} data-open={open}>
              <div className={styles.cardHead}>
                <button type="button" className={styles.cardTitle} aria-expanded={compact ? undefined : open} onClick={() => (compact ? mode!.openItem(path, i) : setOpenIndex(open ? null : i))}>
                  <span className={styles.chev} aria-hidden="true">
                    ›
                  </span>
                  <span className={styles.cardIndex}>{String(i + 1).padStart(2, "0")}</span>
                  {thumbOf(item, field) && (
                    // eslint-disable-next-line @next/next/no-img-element -- a small preview of the item's picture
                    <img className={styles.cardThumb} src={thumbOf(item, field)} alt="" />
                  )}
                  <span className={styles.cardName}>{field.title(item, i)}</span>
                </button>
                {!field.fixed && (
                  <span className={styles.mini}>
                    {compact && (
                      <button type="button" aria-label="Edit this item" title="Edit this item" onClick={() => mode!.openItem(path, i)}>
                        ✎
                      </button>
                    )}
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => set(moveItem(list, i, -1))}>
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === list.length - 1} onClick={() => set(moveItem(list, i, 1))}>
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      disabled={list.length <= (field.min ?? 0)}
                      onClick={() => {
                        if (window.confirm(`Delete “${field.title(item, i)}”? (It only disappears from the site when you publish.)`)) {
                          set(list.filter((_, j) => j !== i));
                          setOpenIndex(null);
                        }
                      }}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              {open && !compact && (
                <div className={styles.cardBody}>
                  {field.fields.map((f) => (
                    <FieldView key={f.path} field={f} base={`${path}.${i}.`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!field.fixed && (
        <button
          type="button"
          className={styles.add}
          disabled={atMax}
          onClick={() => {
            set([...list, field.blank()]);
            if (compact) mode!.openItem(path, list.length);
            else setOpenIndex(list.length);
          }}
        >
          ＋ {field.add}
        </button>
      )}
    </div>
  );
}

/** One setting, with the message under it when something about it needs fixing. */
export function FieldView({ field, base = "" }: { field: Field; base?: string }) {
  const problems = useContext(ProblemsCtx);
  const path = base + field.path;
  const mine = problems.filter((p) => p.path === path);
  return (
    <>
      <FieldInner field={field} base={base} />
      {mine.map((p, i) => (
        <p key={i} className={styles.error} role="alert">
          {p.message}
        </p>
      ))}
    </>
  );
}

function FieldInner({ field, base = "" }: { field: Field; base?: string }) {
  const { content, update } = useEditor();
  const path = base + field.path;
  switch (field.kind) {
    case "text":
    case "area":
      return (
        <WithStyleState>
          <TextInput field={field} path={path} />
        </WithStyleState>
      );
    case "number": {
      const v = getAt(content, path);
      return (
        <label className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <input
            className={styles.input}
            type="number"
            min={field.min}
            max={field.max}
            value={typeof v === "number" ? v : 0}
            onChange={(e) => update((c) => setAt(c, path, Math.min(field.max, Math.max(field.min, Number(e.target.value) || 0))))}
          />
        </label>
      );
    }
    case "bool":
      return (
        <label className={styles.check}>
          <input type="checkbox" checked={getAt(content, path) === true} onChange={(e) => update((c) => setAt(c, path, e.target.checked))} />
          <span>{field.label}</span>
        </label>
      );
    case "select": {
      const options = field.optionsFrom ? ((getAt(content, field.optionsFrom) as string[] | undefined) ?? []) : field.options;
      return (
        <label className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <select className={styles.input} value={(getAt(content, path) as string) ?? ""} onChange={(e) => update((c) => setAt(c, path, e.target.value))}>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case "checks": {
      const current = (getAt(content, path) as string[] | undefined) ?? [];
      return (
        <div className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <div className={styles.checks}>
            {field.options.map((o) => (
              <label key={o} className={styles.check}>
                <input
                  type="checkbox"
                  checked={current.includes(o)}
                  onChange={(e) => update((c) => setAt(c, path, e.target.checked ? [...current, o] : current.filter((x) => x !== o)))}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "image":
      return <ImageField field={field} path={path} />;
    case "font": {
      const fonts = allFonts(content.customFonts);
      return (
        <label className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <select className={styles.input} value={(getAt(content, path) as string) ?? ""} onChange={(e) => update((c) => setAt(c, path, e.target.value))}>
            <option value="">Same as the rest of the site</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {field.hint && <p className={styles.hint}>{field.hint}</p>}
        </label>
      );
    }
    case "colour": {
      const v = ((getAt(content, path) as string) ?? "").trim();
      return (
        <div className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <div className={styles.rowSplit}>
            <input type="color" className={styles.swatch} value={v || "#e8b04b"} aria-label={field.label} onChange={(e) => update((c) => setAt(c, path, e.target.value))} />
            <span className={styles.hint}>{v || "Same as the site"}</span>
            {v && (
              <button type="button" className={styles.link} onClick={() => update((c) => setAt(c, path, ""))}>
                Use the site’s colour
              </button>
            )}
          </div>
          {field.hint && <p className={styles.hint}>{field.hint}</p>}
        </div>
      );
    }
    case "slider": {
      const raw = getAt(content, path);
      const v = typeof raw === "number" ? raw : field.min;
      return (
        <Slider
          label={field.label}
          value={v}
          min={field.min}
          max={field.max}
          step={field.step}
          format={(n) => (field.percent ? `${Math.round(n * 100)}%` : String(n))}
          hint={field.hint}
          onChange={(n) => update((c) => setAt(c, path, n))}
        />
      );
    }
    case "categories":
      return <CategoriesField field={field} />;
    case "strings":
      return <Stringlist field={field} path={path} />;
    case "list":
      return <ListField field={field} path={path} />;
  }
}

// ── a page of content: collapsible sections ─────────────────────────────────────────────────────────────────────

export function ContentEditor({
  page,
  extra,
  onFocus,
  onPage,
  goto,
}: {
  page: SchemaPage;
  /** Extra controls at the foot of a section (e.g. its background colours). */
  extra?: (section: SchemaSection) => ReactNode;
  /** A section opened: scroll the preview to its part of the site. */
  onFocus?: (target: string) => void;
  /** A section opened: show this page in the preview (the gallery, a project, “not found”…). */
  onPage?: (page: PageKey) => void;
  /** Open this section (a search result): `n` changes every time so the same section can be asked for again. */
  goto?: { section: string; n: number };
}) {
  const [open, setOpen] = useState<string>(goto?.section ?? page.sections[0].id);
  const [lastGoto, setLastGoto] = useState(goto?.n);
  if (goto && goto.n !== lastGoto) {
    setLastGoto(goto.n);
    setOpen(goto.section);
  }
  const section = page.sections.find((x) => x.id === open) ?? page.sections[0];
  useEffect(() => {
    if (section.route) onPage?.(section.route);
    if (section.target) onFocus?.(section.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a different section opens
  }, [section.id]);
  return (
    <div className={styles.page}>
      {/* The parts of this page, one tap each: the section you pick is shown below, and the preview scrolls to it. */}
      {page.sections.length > 1 && (
        <div className={styles.sectionTabs} role="tablist" aria-label={`Parts of ${page.name}`}>
          {page.sections.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === section.id} data-on={s.id === section.id} onClick={() => setOpen(s.id)}>
              {s.title}
            </button>
          ))}
        </div>
      )}
      <section className={styles.section} data-open="true" key={section.id}>
        <div className={styles.sectionHeadStatic}>{section.title}</div>
        <div className={styles.sectionBody}>
          {section.fields.map((f) => (
            <FieldView key={f.path} field={f} />
          ))}
          {extra?.(section)}
        </div>
      </section>
    </div>
  );
}

// ── typography window: the three typefaces, and every restyled text ─────────────────────────────────────────────

const ROLE_INFO = [
  { role: "display", name: "Headings", hint: "Titles, big statements, numbers" },
  { role: "label", name: "Labels", hint: "Small capitals above headings, menu, buttons" },
  { role: "body", name: "Paragraphs", hint: "Body text and forms" },
] as const;

export function TypographyEditor({ onFocus }: { onFocus?: (target: string) => void }) {
  const { content, update } = useEditor();
  const texts = styledTexts();
  const fonts = allFonts(content.customFonts);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const uploads = useUploads<{ url?: string; label?: string }>("font", (f, p) => postFile("/api/portal/fonts", f, p));
  const pages = Array.from(new Set(texts.map((t) => t.page)));
  void onFocus;

  function addFont(data: { url?: string; label?: string }) {
    if (!data.url) return;
    update((c) => {
      if (c.customFonts.some((x) => x.url === data.url)) return c;
      const base = (data.label || "font").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "font";
      let id = `c-${base}`;
      let n = 2;
      while (c.customFonts.some((x) => x.id === id)) id = `c-${base}-${n++}`;
      return { ...c, customFonts: [...c.customFonts, { id, label: data.label || "My font", url: data.url! }] };
    });
  }

  const setRole = (role: "display" | "label" | "body", id: string) => update((c) => ({ ...c, fonts: { ...c.fonts, [role]: id } }));

  return (
    <div className={styles.page}>
      {/* The uploaded fonts need their @font-face here too, so their previews in this window use the real font. */}
      {content.customFonts.length > 0 && <style>{fontFaceCss(content.customFonts)}</style>}

      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>Your fonts</div>
        <div className={styles.sectionBody}>
          <DropZone
            kind="font"
            multiple
            state={uploads.state}
            title="Drop font files here, or click to choose"
            hint=".ttf, .otf, .woff or .woff2 — one file per weight or style (Bold, Light, Italic…). Then use them for headings, subheadings or text, or pick them in any “Aa” list."
            onFiles={(files) => uploads.start(files, addFont)}
          />
          {content.customFonts.length === 0 && <p className={styles.hint}>No fonts uploaded yet.</p>}
          <div className={styles.stack}>
            {content.customFonts.map((f) => (
              <div key={f.id} className={styles.card} data-open="true">
                <div className={styles.fontSample} style={{ fontFamily: `"${f.id}", Georgia, serif` }}>
                  Aa Bb Cc 123 — The quick brown fox
                </div>
                <div className={styles.cardBody}>
                  <label className={styles.field}>
                    <span className={styles.label}>Name</span>
                    <input
                      className={styles.input}
                      value={f.label}
                      onChange={(e) => update((c) => ({ ...c, customFonts: c.customFonts.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)) }))}
                    />
                  </label>
                  <div className={styles.rowSplit}>
                    <span className={styles.label}>Use for:</span>
                    {(
                      [
                        ["display", "Headings"],
                        ["label", "Subheadings"],
                        ["body", "Text"],
                      ] as const
                    ).map(([role, name]) => (
                      <button key={role} type="button" className={styles.pill} data-on={content.fonts[role] === f.id} onClick={() => setRole(role, f.id)}>
                        {content.fonts[role] === f.id ? `✓ ${name}` : name}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => {
                        if (window.confirm(`Remove “${f.label}”? Anything using it goes back to the default font.`)) {
                          update((c) => ({ ...c, customFonts: c.customFonts.filter((x) => x.id !== f.id) }));
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>Site fonts</div>
        <div className={styles.sectionBody}>
          {ROLE_INFO.map((r) => (
            <label key={r.role} className={styles.field}>
              <span className={styles.label}>
                {r.name} <em>{r.hint}</em>
              </span>
              <select className={styles.input} value={content.fonts[r.role]} onChange={(e) => setRole(r.role, e.target.value)}>
                {fonts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className={styles.hint}>Every text uses these. To change just one text, open it below — or use its “Aa” button in the content windows.</p>
        </div>
      </section>

      {pages.map((page) => (
        <section key={page} className={styles.section} data-open="true">
          <div className={styles.sectionHeadStatic}>{page}</div>
          <div className={styles.sectionBody}>
            {texts
              .filter((t) => t.page === page)
              .map((t) => {
                const style = content.type[t.key] ?? {};
                const custom = Object.keys(style).length > 0;
                const open = openKey === t.key;
                return (
                  <div key={t.key} className={styles.card} data-open={open}>
                    <div className={styles.cardHead}>
                      <button type="button" className={styles.cardTitle} aria-expanded={open} onClick={() => setOpenKey(open ? null : t.key)}>
                        <span className={styles.chev} aria-hidden="true">
                          ›
                        </span>
                        <span className={styles.cardName}>{t.label}</span>
                        {custom && <span className={styles.badge}>styled</span>}
                      </button>
                    </div>
                    {open && (
                      <div className={styles.cardBody}>
                        <StyleControls
                          value={style}
                          onChange={(next) =>
                            update((c) => {
                              const type = { ...c.type };
                              if (next) type[t.key] = next;
                              else delete type[t.key];
                              return { ...c, type };
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A colour from its hue (0–360), saturation and lightness (percent), as #rrggbb. */
function hslHex(h: number, sat: number, light: number): string {
  const s = sat / 100;
  const l = light / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Brand colours: the gold used for accents and highlights, and the colour of normal text. */
export function ThemeEditor() {
  const { content, update } = useEditor();
  const DEFAULTS = { accent: "#e8b04b", accentBright: "#fff195", text: "#f4ede1" };
  const set = (k: keyof typeof DEFAULTS, hex: string) => update((c) => ({ ...c, theme: { ...c.theme, [k]: hex } }));
  const glass = content.theme.glass;
  const setGlass = (patch: Partial<GlassLook>) => update((c) => ({ ...c, theme: { ...c.theme, glass: { ...c.theme.glass, ...patch } } }));
  const glassChanged = JSON.stringify(glass) !== JSON.stringify(DEFAULT_GLASS);
  /** Three bright colours that belong together: a random starting hue, and two more a good way round the colour wheel. */
  const randomGlass = () => {
    const h = Math.random() * 360;
    const step = 35 + Math.random() * 30;
    setGlass({
      colors: [hslHex(h, 85, 55), hslHex((h + step) % 360, 85, 64), hslHex((h + step * 2) % 360, 90, 72), "#ffffff", hslHex((h + step * 3.5) % 360, 85, 62), hslHex((h + step * 5) % 360, 80, 66)],
    });
  };
  const preview = Object.fromEntries(glassVars(glass).map((d) => [d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1)])) as React.CSSProperties;
  const rows: { key: keyof typeof DEFAULTS; label: string; hint: string }[] = [
    { key: "accent", label: "Accent colour", hint: "Small headings, lines, buttons and highlights." },
    { key: "accentBright", label: "Bright accent", hint: "The brightest highlights, like glints and hover states." },
    { key: "text", label: "Text colour", hint: "Normal text across the site." },
  ];
  return (
    <div className={styles.page}>
      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>Brand colours</div>
        <div className={styles.sectionBody}>
          {rows.map((r) => (
            <div key={r.key}>
              <ColorRow label={r.label} hint={r.hint} value={content.theme[r.key]} onChange={(hex) => set(r.key, hex)} />
              {content.theme[r.key] !== DEFAULTS[r.key] && (
                <button type="button" className={styles.link} onClick={() => set(r.key, DEFAULTS[r.key])}>
                  Back to the original
                </button>
              )}
            </div>
          ))}
          <p className={styles.hint}>
            The page background and the star colours are in “Page background” and “Star colours”; the colour of any single text is under its “Aa” button.
          </p>
        </div>
      </section>

      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>Glass</div>
        <div className={styles.sectionBody}>
          <p className={styles.hint}>The glass cards (the numbers and the founder) hold these colours, spread over them in places that change, but keep them hidden. Where the cursor is, a small soft circle lets the colour that is there glow. The sample is shown lit, and follows your cursor. Changes show on the page straight away.</p>
          <div className={`glass-panel ${styles.glassPreview}`} style={preview} data-lit="true" aria-hidden="true">
            <strong>Glass</strong>
            <span>Colour, blur and tint</span>
          </div>
          <Choice
            label="Effect"
            hint="Neon: full colour. Frosted: milky white light. Clear: a faint hint of colour."
            value={glass.effect}
            options={GLASS_EFFECTS.map((e) => ({ value: e, label: e }))}
            onChange={(effect) => setGlass({ effect })}
          />
          <div className={styles.glassPresets} role="group" aria-label="Colour sets">
            {GLASS_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className={styles.glassPreset}
                data-on={glass.colors.join() === p.colors.join()}
                onClick={() => setGlass({ colors: [...p.colors] })}
                title={`${p.name} colours`}
              >
                <i style={{ background: `linear-gradient(90deg, ${p.colors.join(", ")})` }} />
                <span>{p.name}</span>
              </button>
            ))}
            <button type="button" className={styles.glassPreset} onClick={randomGlass} title="Pick six new colours that go well together">
              <i className={styles.glassDice} aria-hidden="true">
                ⚄
              </i>
              <span>Randomise</span>
            </button>
          </div>
          {glass.colors.map((c, i) => (
            <div key={i}>
              <ColorRow label={`Colour ${i + 1}`} value={c} onChange={(hex) => setGlass({ colors: glass.colors.map((x, j) => (j === i ? hex : x)) })} />
              {glass.colors.length > GLASS_COLOR_COUNT[0] && (
                <button type="button" className={styles.link} onClick={() => setGlass({ colors: glass.colors.filter((_, j) => j !== i) })}>
                  Remove colour {i + 1}
                </button>
              )}
            </div>
          ))}
          <button type="button" className={styles.add} disabled={glass.colors.length >= GLASS_COLOR_COUNT[1]} onClick={() => setGlass({ colors: [...glass.colors, "#ffffff"] })}>
            ＋ Add a colour ({glass.colors.length} of {GLASS_COLOR_COUNT[1]})
          </button>
          <Choice
            label="Colour order"
            hint="Random: every glass card mixes the colours in an order of its own, and a new one each time the cursor comes back. Fixed: the order above, on every card."
            value={glass.shuffle ? "random" : "fixed"}
            options={[
              { value: "random", label: "Different on every glass" },
              { value: "fixed", label: "Same on every glass" },
            ]}
            onChange={(v) => setGlass({ shuffle: v === "random" })}
          />
          <Slider label="Tint" hint="How strong the colour is under the cursor." value={glass.tint} min={0} max={0.7} step={0.02} format={(n) => `${Math.round((n / 0.7) * 100)}%`} onChange={(tint) => setGlass({ tint })} />
          <Slider label="Spread" hint="How big the point of light under the cursor is." value={glass.spread} min={0} max={1} step={0.02} format={(n) => `${Math.round(n * 100)}%`} onChange={(spread) => setGlass({ spread })} />
          <Slider label="Glow" hint="How brightly the edge of the glass glows near the cursor." value={glass.glow} min={0} max={0.8} step={0.02} format={(n) => `${Math.round((n / 0.8) * 100)}%`} onChange={(glow) => setGlass({ glow })} />
          <Slider label="Blur" hint="How much of what is behind the glass is blurred." value={glass.blur} min={0} max={30} step={1} format={(n) => `${n} px`} onChange={(blur) => setGlass({ blur })} />
          {glassChanged && (
            <button type="button" className={styles.link} onClick={() => setGlass({ ...DEFAULT_GLASS, colors: [...DEFAULT_GLASS.colors] })}>
              Back to the original glass
            </button>
          )}
        </div>
      </section>

      <section className={styles.section} data-open="true">
        <div className={styles.sectionHeadStatic}>Menu glow</div>
        <div className={styles.sectionBody}>
          <p className={styles.hint}>
            The menu at the top lights the page you are on with a soft glow under it, in that item&apos;s own colour; the other items dim. Pick each
            item&apos;s colour.
          </p>
          {content.nav.map((n) => (
            <ColorRow
              key={n.id}
              label={n.label}
              value={content.theme.menuTones[n.id] ?? DEFAULT_MENU_TONES[n.id] ?? "#ffc857"}
              onChange={(hex) => update((c) => ({ ...c, theme: { ...c.theme, menuTones: { ...c.theme.menuTones, [n.id]: hex } } }))}
            />
          ))}
          {JSON.stringify(content.theme.menuTones) !== JSON.stringify(DEFAULT_MENU_TONES) && (
            <button type="button" className={styles.link} onClick={() => update((c) => ({ ...c, theme: { ...c.theme, menuTones: { ...DEFAULT_MENU_TONES } } }))}>
              Back to the original glow colours
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ── media window: the image library ─────────────────────────────────────────────────────────────────────────────

export function MediaLibrary() {
  const { media, content } = useEditor();
  const [filter, setFilter] = useState("");
  /** The picture waiting for the second click ("Delete"), and what went wrong with the last deletion. */
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploads = useUploads<string>("image", (f, p) => media.upload(f, p));
  const shown = media.images.filter((s) => s.toLowerCase().includes(filter.toLowerCase()));
  const used = (src: string) => JSON.stringify(content).includes(src);
  async function remove(src: string) {
    setBusy(true);
    setError("");
    try {
      await media.remove(src);
      setAsking(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t delete that picture.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <section className={styles.section} data-open="true">
        <div className={styles.sectionBody}>
          <DropZone
            kind="image"
            multiple
            state={uploads.state}
            title="Drop pictures here, or click to choose"
            hint="PNG, JPG, WebP, AVIF, GIF, SVG, TIFF, BMP or ICO, up to 30 MB each. Photos are kept at up to 3200 px as high-quality WebP (GIFs stay animated, SVGs stay sharp), ready to pick in any picture field."
            onFiles={(files) => uploads.start(files, () => {})}
          />
          <input className={styles.input} placeholder="Search by name or folder" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <p className={styles.hint}>
            {media.images.length} pictures{filter ? ` — ${shown.length} match` : ""}. Pictures you uploaded have a ✕ to delete them for good.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.libraryGrid}>
            {shown.map((src) => {
              const canRemove = media.removable.includes(src);
              return (
                <figure key={src} className={styles.libraryTile} title={src} data-asking={asking === src}>
                  <span className={styles.libraryPic}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                    <img src={src} alt="" loading="lazy" />
                    {canRemove && asking !== src && (
                      <button type="button" className={styles.libraryX} aria-label={`Delete ${src.replace("/images/", "")}`} title="Delete this picture" onClick={() => { setError(""); setAsking(src); }}>
                        ✕
                      </button>
                    )}
                    {asking === src && (
                      <span className={styles.libraryAsk} role="group" aria-label="Delete this picture for good?">
                        <strong>Delete for good?</strong>
                        <small>{used(src) ? "It is used on the site: that spot will be left empty." : "If a card or page uses it, that spot will be left empty."}</small>
                        <span>
                          <button type="button" onClick={() => setAsking(null)} disabled={busy}>
                            Cancel
                          </button>
                          <button type="button" data-danger="true" onClick={() => remove(src)} disabled={busy} autoFocus>
                            {busy ? "Deleting…" : "Delete"}
                          </button>
                        </span>
                      </span>
                    )}
                  </span>
                  <figcaption>{src.replace("/images/", "")}</figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

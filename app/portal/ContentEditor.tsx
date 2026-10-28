"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { allFonts } from "@/lib/content/fonts";
import { fontFaceCss } from "@/lib/content/css";
import type { PageKey, SiteContent, TextStyle } from "@/lib/content/types";
import { Choice, ColorRow, Slider } from "./controls";
import { styledTexts, type Field, type SchemaPage, type SchemaSection } from "./content-schema";
import { checkFile, postFile, UPLOAD_KINDS, type UploadKind } from "./upload";
import styles from "./content.module.css";

// ── shared state: the draft content, and the image library ───────────────────────────────────────────────────────

export interface MediaApi {
  images: string[];
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

// ── path helpers: "home.process.cards.2.title" ──────────────────────────────────────────────────────────────────

const keys = (path: string) => path.split(".").filter(Boolean);

export function getAt(obj: unknown, path: string): unknown {
  return keys(path).reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setAt<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = keys(path);
  if (head === undefined) return value as T;
  const copy = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string, unknown>;
  copy[head] = rest.length ? setAt(copy[head] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join("."), value) : value;
  return copy as T;
}

/** "home.process.cards.2.title" → "home.process.cards.title": the key a text's style is stored under. */
const styleKey = (path: string) => path.replace(/\.\d+(?=\.|$)/g, "");

const moveItem = <T,>(list: T[], i: number, by: number) => {
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

function ImagePicker({ value, onPick, onClose }: { value: string; onPick: (src: string) => void; onClose: () => void }) {
  const { media } = useEditor();
  const [filter, setFilter] = useState("");
  const uploads = useUploads<string>("image", (f, p) => media.upload(f, p));
  const shown = media.images.filter((src) => src.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className={styles.picker}>
      <DropZone
        kind="image"
        compact
        state={uploads.state}
        title="Drop a picture here, or click to upload"
        onFiles={(files) =>
          uploads.start(files, (src) => {
            onPick(src); // the new picture is used straight away
            onClose();
          })
        }
      />
      <div className={styles.pickerHead}>
        <input className={styles.input} placeholder="Search your pictures" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" className={styles.link} onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.pickerGrid}>
        {shown.map((src) => (
          <button
            key={src}
            type="button"
            className={styles.pickerTile}
            data-on={src === value}
            title={src.replace("/images/", "")}
            onClick={() => {
              onPick(src);
              onClose();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny library thumbnails */}
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
        {shown.length === 0 && <p className={styles.hint}>No picture matches “{filter}”.</p>}
      </div>
    </div>
  );
}

function ImageField({ field, path }: { field: Extract<Field, { kind: "image" }>; path: string }) {
  const { content, update } = useEditor();
  const value = (getAt(content, path) as string) || "";
  const [open, setOpen] = useState(false);
  const set = (src: string) => update((c) => setAt(c, path, src));
  return (
    <div className={styles.field}>
      <span className={styles.label}>{field.label}</span>
      <div className={styles.imageRow}>
        <div className={styles.thumb}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the chosen image */}
          {value ? <img src={value} alt="" /> : <span>none</span>}
        </div>
        <div className={styles.imageActions}>
          <span className={styles.imageName}>{value ? value.split("/").pop() : "No image"}</span>
          <span>
            <button type="button" className={styles.pill} onClick={() => setOpen((o) => !o)}>
              {value ? "Change" : "Choose"}
            </button>
            {value && (path.endsWith("photo") || path.endsWith("logo") || path.endsWith("backdrop")) && (
              <button type="button" className={styles.link} onClick={() => set("")}>
                Remove
              </button>
            )}
          </span>
        </div>
      </div>
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

function ListField({ field, path }: { field: Extract<Field, { kind: "list" }>; path: string }) {
  const { content, update } = useEditor();
  const list = (getAt(content, path) as Record<string, unknown>[] | undefined) ?? [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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
                <button type="button" className={styles.cardTitle} aria-expanded={open} onClick={() => setOpenIndex(open ? null : i)}>
                  <span className={styles.chev} aria-hidden="true">
                    ›
                  </span>
                  <span className={styles.cardIndex}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.cardName}>{field.title(item, i)}</span>
                </button>
                {!field.fixed && (
                  <span className={styles.mini}>
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
              {open && (
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
            setOpenIndex(list.length);
          }}
        >
          ＋ {field.add}
        </button>
      )}
    </div>
  );
}

export function FieldView({ field, base = "" }: { field: Field; base?: string }) {
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
    case "select":
      return (
        <label className={styles.field}>
          <span className={styles.label}>{field.label}</span>
          <select className={styles.input} value={(getAt(content, path) as string) ?? ""} onChange={(e) => update((c) => setAt(c, path, e.target.value))}>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
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
  firstOpen = true,
  goto,
}: {
  page: SchemaPage;
  /** Extra controls at the foot of a section (e.g. its background colours). */
  extra?: (section: SchemaSection) => ReactNode;
  /** A section opened: scroll the preview to its part of the site. */
  onFocus?: (target: string) => void;
  /** A section opened: show this page in the preview (the gallery, a project, “not found”…). */
  onPage?: (page: PageKey) => void;
  firstOpen?: boolean;
  /** Open this section (a search result): `n` changes every time so the same section can be asked for again. */
  goto?: { section: string; n: number };
}) {
  const [open, setOpen] = useState<string | null>(goto?.section ?? (firstOpen ? page.sections[0].id : null));
  const [lastGoto, setLastGoto] = useState(goto?.n);
  if (goto && goto.n !== lastGoto) {
    setLastGoto(goto.n);
    setOpen(goto.section);
  }
  useEffect(() => {
    const s = page.sections.find((x) => x.id === open);
    if (s?.route) onPage?.(s.route);
    if (s?.target) onFocus?.(s.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a different section opens
  }, [open]);
  return (
    <div className={styles.page}>
      {page.sections.map((s) => (
        <section key={s.id} className={styles.section} data-open={open === s.id}>
          <button type="button" className={styles.sectionHead} aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className={styles.chev} aria-hidden="true">
              ›
            </span>
            {s.title}
          </button>
          {open === s.id && (
            <div className={styles.sectionBody}>
              {s.fields.map((f) => (
                <FieldView key={f.path} field={f} />
              ))}
              {extra?.(s)}
            </div>
          )}
        </section>
      ))}
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

/** Brand colours: the gold used for accents and highlights, and the colour of normal text. */
export function ThemeEditor() {
  const { content, update } = useEditor();
  const DEFAULTS = { accent: "#e8b04b", accentBright: "#fff195", text: "#f4ede1" };
  const set = (k: keyof typeof DEFAULTS, hex: string) => update((c) => ({ ...c, theme: { ...c.theme, [k]: hex } }));
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
    </div>
  );
}

// ── media window: the image library ─────────────────────────────────────────────────────────────────────────────

export function MediaLibrary() {
  const { media } = useEditor();
  const [filter, setFilter] = useState("");
  const uploads = useUploads<string>("image", (f, p) => media.upload(f, p));
  const shown = media.images.filter((s) => s.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className={styles.page}>
      <section className={styles.section} data-open="true">
        <div className={styles.sectionBody}>
          <DropZone
            kind="image"
            multiple
            state={uploads.state}
            title="Drop pictures here, or click to choose"
            hint="PNG, JPG, WebP or AVIF, up to 30 MB each. They are kept at up to 3200 px, as high-quality WebP, ready to pick in any picture field."
            onFiles={(files) => uploads.start(files, () => {})}
          />
          <input className={styles.input} placeholder="Search by name or folder" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <p className={styles.hint}>{media.images.length} pictures{filter ? ` — ${shown.length} match` : ""}.</p>
          <div className={styles.libraryGrid}>
            {shown.map((src) => (
              <figure key={src} className={styles.libraryTile} title={src}>
                {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails */}
                <img src={src} alt="" loading="lazy" />
                <figcaption>{src.replace("/images/", "")}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

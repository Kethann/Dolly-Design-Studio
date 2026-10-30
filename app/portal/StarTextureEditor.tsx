"use client";

import { useEffect, useRef, useState } from "react";
import { PATTERN_BLENDS, type PatternBlend, type StarPattern } from "@/lib/intro/settings";
import { ColorRow, Section, Slider, percent } from "./controls";
import styles from "./portal.module.css";

const BLEND_NAMES: Record<PatternBlend, string> = {
  normal: "Normal",
  multiply: "Multiply",
  overlay: "Overlay",
  screen: "Screen",
  "soft-light": "Soft light",
};

/**
 * The Sweep star's texture, like a pattern overlay in Photoshop: pick an uploaded image (or upload one), choose how it
 * blends into the gold, and adjust its amount, size, angle, relief and tint. Every change shows live on the star.
 */
export function StarTextureEditor({
  value,
  onChange,
  onShowStar,
}: {
  value: StarPattern;
  onChange: (patch: Partial<StarPattern>) => void;
  /** Holds the preview with the star over the logo, so the texture is easy to judge. */
  onShowStar: () => void;
}) {
  const [textures, setTextures] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error"; message?: string }>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/portal/texture")
      .then((r) => (r.ok ? r.json() : { textures: [] }))
      .then((d: { textures?: string[] }) => setTextures(d.textures ?? []))
      .catch(() => {});
  }, []);

  async function upload(file: File) {
    setStatus({ kind: "busy" });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/portal/texture", { method: "POST", body: form });
      const data = (await res.json()) as { src?: string; error?: string };
      if (!res.ok || !data.src) throw new Error(data.error ?? "Upload failed.");
      setTextures((list) => (list.includes(data.src!) ? list : [...list, data.src!]));
      onChange({ src: data.src });
      onShowStar();
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  async function remove(src: string) {
    if (!window.confirm("Delete this texture from the library? (Stars already published with it keep working until you change it.)")) return;
    const res = await fetch("/api/portal/texture", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src }),
    });
    if (!res.ok) {
      setStatus({ kind: "error", message: "Couldn’t delete that texture." });
      return;
    }
    setTextures((list) => list.filter((t) => t !== src));
    if (value.src === src) onChange({ src: null });
  }

  const on = !!value.src;
  return (
    <Section title="Sweep star texture" scope="Intro" hint="Lay your own pattern over the star, like a pattern overlay in Photoshop.">
      <div className={styles.control}>
        <button type="button" className={styles.ghostButton} onClick={onShowStar}>
          ◉ Show the star in the preview
        </button>
      </div>

      <div className={styles.control}>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Texture</span>
        </div>
        <div className={styles.texGrid} role="radiogroup" aria-label="Star texture">
          <button
            type="button"
            className={`${styles.texTile} ${styles.texUpload}`}
            disabled={status.kind === "busy"}
            onClick={() => fileRef.current?.click()}
          >
            {status.kind === "busy" ? "Uploading…" : "+ Upload"}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!on}
            className={styles.texTile}
            data-active={!on}
            onClick={() => onChange({ src: null })}
          >
            <span className={styles.texNone}>None</span>
          </button>
          {textures.map((src) => (
            <div key={src} className={styles.texItem}>
              <button
                type="button"
                role="radio"
                aria-checked={value.src === src}
                aria-label={src.split("/").pop()}
                className={styles.texTile}
                data-active={value.src === src}
                style={{ backgroundImage: `url(${src})` }}
                onClick={() => {
                  onChange({ src });
                  onShowStar();
                }}
              />
              <button type="button" className={styles.texRemove} aria-label="Delete this texture" onClick={() => remove(src)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
        {status.kind === "error" && <p className={styles.loginError}>{status.message}</p>}
        <p className={styles.controlHint}>
          Seamless patterns tile best (marble, foil, engraving, film grain…). PNG, JPG or WebP, up to 6 MB.
        </p>
      </div>

      {on && (
        <>
          <div className={styles.control}>
            <div className={styles.controlRow}>
              <span className={styles.controlLabel}>Blend mode</span>
              <select
                className={styles.select}
                value={value.blend}
                onChange={(e) => onChange({ blend: e.target.value as PatternBlend })}
              >
                {PATTERN_BLENDS.map((b) => (
                  <option key={b} value={b}>
                    {BLEND_NAMES[b]}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.controlHint}>
              Overlay and Soft light keep the gold and add the pattern&apos;s light and shade; Multiply darkens; Screen
              brightens; Normal lays the image on as it is.
            </p>
          </div>
          <Slider
            label="Amount"
            value={value.amount}
            min={0}
            max={1}
            step={0.05}
            format={percent}
            hint="Like a layer's opacity."
            onChange={(amount) => onChange({ amount })}
          />
          <Slider
            label="Scale"
            value={value.scale}
            min={0.1}
            max={4}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            hint="100% lays one copy across the whole star; smaller repeats it."
            onChange={(scale) => onChange({ scale })}
          />
          <Slider
            label="Angle"
            value={value.rotation}
            min={-180}
            max={180}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(rotation) => onChange({ rotation })}
          />
          <Slider
            label="Relief"
            value={value.relief}
            min={0}
            max={1}
            step={0.05}
            format={percent}
            hint="Presses the pattern into the metal, so it catches the light as the star turns."
            onChange={(relief) => onChange({ relief })}
          />
          <ColorRow label="Tint" value={value.tint} onChange={(tint) => onChange({ tint })} />
          <Slider
            label="Tint amount"
            value={value.tintAmount}
            min={0}
            max={1}
            step={0.05}
            format={percent}
            onChange={(tintAmount) => onChange({ tintAmount })}
          />
        </>
      )}
    </Section>
  );
}

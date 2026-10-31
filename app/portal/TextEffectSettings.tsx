"use client";

import { PARTICLE_DEFAULTS, PARTICLE_PRESETS, PARTICLE_RANGES, type TextEffect, type TextEffectOptions } from "@/lib/content/text-effects";
import { Choice, ColorRow, Slider } from "./controls";
import styles from "./content.module.css";

/** Uses the existing page preview for feedback, without allocating extra preview canvases. */
export function TextEffectSettings({ effect, value, disabled, onChange }: {
  effect: TextEffect;
  value: TextEffectOptions;
  disabled: boolean;
  onChange: (value: TextEffectOptions) => void;
}) {
  const patch = (next: Partial<TextEffectOptions>) => onChange({ ...value, ...next });
  return <details className={styles.effectSettings} open={effect === "glow" || undefined}>
    <summary>{effect === "particles" ? "Colour & particle settings" : "Colour & glow settings"}</summary>
    <fieldset disabled={disabled}>
      <ColorRow label="Text colour" value={value.color ?? "#fff195"} onChange={color => patch({ color })} />
      <button type="button" className={styles.link} disabled={!value.color} onClick={() => patch({ color: undefined })}>Use original text colour</button>
      {effect === "particles" && <>
        <ColorRow label="Dot colour" value={value.particleColor ?? value.color ?? "#fff195"} onChange={particleColor => patch({ particleColor })} />
        <button type="button" className={styles.link} disabled={!value.particleColor} onClick={() => patch({ particleColor: undefined })}>Match dots to text colour</button>
        <div className={styles.particlePresets} role="group" aria-label="Particle quick looks">
          {PARTICLE_PRESETS.map(preset => <button type="button" key={preset.label}
            aria-pressed={(Object.keys(PARTICLE_DEFAULTS) as (keyof typeof PARTICLE_DEFAULTS)[]).every(key => (value[key] ?? PARTICLE_DEFAULTS[key]) === preset.options[key])}
            onClick={() => patch(preset.options)}>{preset.label}</button>)}
        </div>
        <Slider label="Dot size" min={PARTICLE_RANGES.particleSize[0]} max={PARTICLE_RANGES.particleSize[1]} step={.05} value={value.particleSize ?? PARTICLE_DEFAULTS.particleSize} format={v => `${Math.round(v * 100)}%`} onChange={particleSize => patch({ particleSize })} />
        <Slider label="Scatter distance" min={0} max={8} step={.5} value={value.particleScatter ?? PARTICLE_DEFAULTS.particleScatter} format={v => `${v}px`} onChange={particleScatter => patch({ particleScatter })} hint="Zero keeps the dots still. Higher values add a little more drift, never rotation." />
        <Slider label="Movement speed" min={.5} max={2} step={.1} value={value.particleSpeed ?? PARTICLE_DEFAULTS.particleSpeed} format={v => `${v.toFixed(1)}×`} onChange={particleSpeed => patch({ particleSpeed })} />
        <Slider label="Dot glow" min={0} max={1} step={.05} value={value.particleGlow ?? PARTICLE_DEFAULTS.particleGlow} format={v => `${Math.round(v * 100)}%`} onChange={particleGlow => patch({ particleGlow })} />
        <p className={styles.hint}>Hover or tap the marked words in the page preview. Dot colour can differ from the normal text. These controls do not add more particles.</p>
      </>}
      {effect === "glow" && <>
        <ColorRow label="Glow colour" value={value.glowColor ?? value.color ?? "#fff195"} onChange={glowColor => patch({ glowColor })} />
        <button type="button" className={styles.link} disabled={!value.glowColor} onClick={() => patch({ glowColor: undefined })}>Match glow to text colour</button>
        <Slider label="Glow strength" min={0} max={100} step={5} value={(value.glowStrength ?? 1) * 100} format={v => `${Math.round(v)}%`} onChange={v => patch({ glowStrength: v / 100 })} />
        <Slider label="Glow spread" min={1} max={32} step={1} value={value.glowRadius ?? 12} format={v => `${v}px`} onChange={glowRadius => patch({ glowRadius })} />
        <Choice label="Show glow" value={value.glowMode ?? "hover"} options={[{ value: "hover", label: "Hover / touch" }, { value: "always", label: "Always" }]} onChange={glowMode => patch({ glowMode })} />
      </>}
      <p className={styles.hint}>Only [[marked text]] in this field changes. To colour a whole heading, put the whole heading inside [[ ]]. The card background glow is separate.</p>
      <button type="button" className={styles.link} disabled={!Object.keys(value).length} onClick={() => onChange({})}>{effect === "particles" ? "Reset colour & dots" : "Reset colour & glow"}</button>
    </fieldset>
  </details>;
}

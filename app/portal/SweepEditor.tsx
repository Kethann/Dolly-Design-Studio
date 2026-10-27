"use client";

import type { SweepSettings } from "@/lib/intro/settings";
import { SWEEP_SHAPE_PRESETS } from "@/lib/intro/sweep-path";
import { Choice, Section, Slider, percent } from "./controls";
import { StarTextureEditor } from "./StarTextureEditor";
import styles from "./portal.module.css";

/** The settings the shape presets set. */
const SHAPE_KEYS = ["depth", "bevel", "edge", "facets", "arms"] as const;

/** Portal controls for the Sweep reveal: how the big star crosses the logo, how it looks, and its texture. */
export function SweepEditor({
  value,
  onChange,
  onShowStar,
}: {
  value: SweepSettings;
  onChange: (patch: Partial<SweepSettings>) => void;
  /** Holds the preview with the star over the logo. */
  onShowStar: () => void;
}) {
  return (
    <>
      <Section
        title="Sweep motion"
        scope="Intro"
        hint="The big star crosses in front of the logo; the finished logo appears behind it."
      >
        <Choice
          label="Direction"
          value={value.direction}
          options={[
            { value: "rtl", label: "Right to left" },
            { value: "ltr", label: "Left to right" },
          ]}
          onChange={(direction) => onChange({ direction })}
        />
        <Slider
          label="Sweep time"
          value={value.duration}
          min={1.2}
          max={2.4}
          step={0.05}
          format={(v) => `${v.toFixed(2)} s`}
          hint="How long the crossing takes. Shorter is faster."
          onChange={(duration) => onChange({ duration })}
        />
        <Slider
          label="Spin"
          value={value.spin}
          min={-2}
          max={2}
          step={0.05}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} turns`}
          hint="How far it turns while crossing (negative turns the other way)."
          onChange={(spin) => onChange({ spin })}
        />
        <Slider
          label="3D tilt"
          value={value.tilt}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="How much it leans in depth as it passes, so its facets catch the light."
          onChange={(tilt) => onChange({ tilt })}
        />
        <Slider
          label="Grows to"
          value={value.grow}
          min={1}
          max={1.8}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          hint="How much bigger it is when it leaves than when it enters."
          onChange={(grow) => onChange({ grow })}
        />
        <Slider
          label="Reveal bloom"
          value={value.bloom}
          min={0}
          max={2}
          step={0.05}
          format={percent}
          hint="How far the star shapes it leaves behind open up. 0% uncovers the logo only exactly where the star passed."
          onChange={(bloom) => onChange({ bloom })}
        />
        <Slider
          label="Reveal edge softness"
          value={value.feather}
          min={6}
          max={120}
          step={2}
          format={(v) => `${Math.round(v)} px`}
          hint="How soft the edge is where the logo appears behind the star."
          onChange={(feather) => onChange({ feather })}
        />
      </Section>

      <Section
        title="Sweep star shape"
        scope="Intro"
        hint="Build the star's form: from a thin, flat cut-out to a deep, sharply faceted gem."
      >
        <div className={styles.control}>
          <div className={styles.controlRow}>
            <span className={styles.controlLabel}>Preset</span>
          </div>
          <div className={styles.choice} role="group" aria-label="Star shape presets">
            {(Object.keys(SWEEP_SHAPE_PRESETS) as (keyof typeof SWEEP_SHAPE_PRESETS)[]).map((key) => {
              const preset = SWEEP_SHAPE_PRESETS[key];
              const active = SHAPE_KEYS.every((k) => Math.abs(value[k] - preset[k]) < 0.001);
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.choiceOption}
                  aria-pressed={active}
                  data-active={active}
                  onClick={() => {
                    onChange({
                      depth: preset.depth,
                      bevel: preset.bevel,
                      edge: preset.edge,
                      facets: preset.facets,
                      arms: preset.arms,
                    });
                    onShowStar();
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className={styles.controlHint}>
            Minimal is a slim, nearly flat star; Gem is the default cut; Bold is deep and sharp.
          </p>
        </div>
        <Slider
          label="Depth"
          value={value.depth}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          hint="How thick the star is. Low is a slim, nearly flat cut-out."
          onChange={(depth) => onChange({ depth })}
        />
        <Slider
          label="Bevel"
          value={value.bevel}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          hint="How wide the angled rim around its face is. Low is a crisp, hairline edge."
          onChange={(bevel) => onChange({ bevel })}
        />
        <Slider
          label="Edge thickness"
          value={value.edge}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          hint="The thickness of its side wall, seen as it turns side-on."
          onChange={(edge) => onChange({ edge })}
        />
        <Slider
          label="Facets"
          value={value.facets}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          hint="How pronounced the ridges and valleys on its face are. Low is a smooth, flat crown."
          onChange={(facets) => onChange({ facets })}
        />
        <Slider
          label="Arm width"
          value={value.arms}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          hint="Low gives thin, sharp arms; high gives broad, stubby ones."
          onChange={(arms) => onChange({ arms })}
        />
      </Section>

      <Section title="Sweep star finish" scope="Intro" hint="The same clean gold as the background stars.">
        <Slider
          label="Size"
          value={value.size}
          min={0.5}
          max={2}
          step={0.05}
          format={percent}
          hint="100% is a little taller than the logo."
          onChange={(size) => onChange({ size })}
        />
        <Slider
          label="Texture"
          value={value.texture}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="The brushed-metal grain on its facets."
          onChange={(texture) => onChange({ texture })}
        />
        <Slider
          label="Shine"
          value={value.shine}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="How much its polished gold reflects."
          onChange={(shine) => onChange({ shine })}
        />
        <Slider
          label="Glow"
          value={value.glow}
          min={0}
          max={1}
          step={0.05}
          format={percent}
          hint="A soft warm light from the star and along the edge where the logo appears. Keep it low for a clean star."
          onChange={(glow) => onChange({ glow })}
        />
      </Section>

      <StarTextureEditor
        value={value.pattern}
        onChange={(patch) => onChange({ pattern: { ...value.pattern, ...patch } })}
        onShowStar={onShowStar}
      />
    </>
  );
}

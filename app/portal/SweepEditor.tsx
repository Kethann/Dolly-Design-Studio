"use client";

import type { SweepSettings } from "@/lib/intro/settings";
import { Choice, Section, Slider, percent } from "./controls";
import { StarTextureEditor } from "./StarTextureEditor";

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

      <Section title="Sweep star" scope="Intro" hint="The same clean, faceted gold as the background stars.">
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
          label="Depth"
          value={value.depth}
          min={0.05}
          max={1}
          step={0.05}
          format={percent}
          hint="How deep its faceted arms are."
          onChange={(depth) => onChange({ depth })}
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

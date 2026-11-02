"use client";

import { useState, type ReactNode } from "react";
import { resizedSrc } from "@/lib/images";
import { DISC_RANGES, GLASS_DESIGN_DEFAULTS, GLASS_LOOKS, type DiscControls, type DiscNumericKey, type GlassDesign, type GlassEdge, type GlassEffect, type GlassPattern } from "@/lib/content/disc";
import { ImagePicker } from "./ContentEditor";
import { ColorRow, Section, Slider, Toggle } from "./controls";
import styles from "./portal.module.css";

type Tab = "looks" | "surface" | "pattern" | "edge" | "picture";
type ImageField = "patternImage" | "edgeImage" | "pictureImage";

const TABS: { id: Tab; label: string }[] = [
  { id: "looks", label: "Looks" }, { id: "surface", label: "Surface" }, { id: "pattern", label: "Pattern" }, { id: "edge", label: "Edge" }, { id: "picture", label: "Picture" },
];

/** A small drawing of the glass, so each choice shows what it does. */
function Swatch({ children }: { children?: ReactNode }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <circle cx="20" cy="20" r="17" opacity=".35" />
      {children}
    </svg>
  );
}
const spokes = (count: number, inner: number, outer: number) => Array.from({ length: count }, (_, i) => {
  const a = i / count * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  return <line key={i} x1={20 + c * inner} y1={20 + s * inner} x2={20 + c * outer} y2={20 + s * outer} />;
});
const dots = (count: number, radius: number, size: number) => Array.from({ length: count }, (_, i) => {
  const a = i / count * Math.PI * 2;
  return <circle key={i} cx={20 + Math.cos(a) * radius} cy={20 + Math.sin(a) * radius} r={size} fill="currentColor" stroke="none" />;
});
const outline = (count: number, depth: number) => Array.from({ length: 121 }, (_, i) => {
  const a = i / 120 * Math.PI * 2, r = 17 - depth * (.5 + .5 * Math.cos(a * count));
  return `${(20 + Math.cos(a) * r).toFixed(2)},${(20 + Math.sin(a) * r).toFixed(2)}`;
}).join(" ");
const IMAGE_SWATCH = <Swatch><path d="M12 25l5-6 4 4 3-3 5 5M14 14h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" /></Swatch>;

const EFFECTS: { id: GlassEffect; label: string; hint: string; art: ReactNode }[] = [
  { id: "clear", label: "Clear", hint: "See-through glass, as it is today.", art: <Swatch><path d="M12 24 24 12" opacity=".7" /></Swatch> },
  { id: "frosted", label: "Frosted", hint: "Soft, milky glass. The stars and page behind it really blur.", art: <Swatch><circle cx="20" cy="20" r="16" fill="currentColor" opacity=".28" stroke="none" />{dots(9, 9, .7)}</Swatch> },
  { id: "liquid", label: "Liquid", hint: "Slow rippling highlights, like water poured over glass.", art: <Swatch><path d="M6 17c4-4 8-4 12 0s8 4 16 0M6 24c4-4 8-4 12 0s8 4 16 0" strokeLinecap="round" /></Swatch> },
  { id: "bubble", label: "Soap bubble", hint: "Iridescent colours running through a thin glossy skin, strongest at the rim.", art: <Swatch><circle cx="20" cy="20" r="15" strokeWidth="2.4" stroke="url(#glass-bubble-swatch)" /><defs><linearGradient id="glass-bubble-swatch" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffc6ec" /><stop offset=".5" stopColor="#a9f0ff" /><stop offset="1" stopColor="#d7c2ff" /></linearGradient></defs><path d="M13 14c2-3 5-4 8-4" strokeLinecap="round" /></Swatch> },
  { id: "ribbed", label: "Fluted", hint: "Fine ridges running out from the centre, like reeded glass.", art: <Swatch>{spokes(20, 5, 16)}</Swatch> },
  { id: "hammered", label: "Hammered", hint: "A dimpled, hand-beaten surface that catches the light.", art: <Swatch>{dots(6, 10, 2)}{dots(1, 0, 2)}</Swatch> },
  { id: "crystal", label: "Crystal", hint: "Cut facets with small flashes of colour.", art: <Swatch><path d="M20 4 32 15 20 36 8 15ZM8 15h24M20 4l-5 11 5 21 5-21Z" strokeLinejoin="round" /></Swatch> },
];
const PATTERNS: { id: GlassPattern; label: string; art: ReactNode }[] = [
  { id: "none", label: "None", art: <Swatch /> },
  { id: "rings", label: "Rings", art: <Swatch><circle cx="20" cy="20" r="11" /><circle cx="20" cy="20" r="6" /></Swatch> },
  { id: "rays", label: "Sunburst", art: <Swatch>{spokes(12, 3, 16)}</Swatch> },
  { id: "grid", label: "Grid", art: <Swatch><path d="M13 6v28M20 3v34M27 6v28M6 13h28M3 20h34M6 27h28" /></Swatch> },
  { id: "dots", label: "Dots", art: <Swatch>{dots(8, 11, 1.2)}{dots(4, 5, 1.2)}</Swatch> },
  { id: "waves", label: "Waves", art: <Swatch><path d="M6 14c4-4 8 4 14 0s10 4 14 0M4 21c4-4 10 4 16 0s12 4 16 0M6 28c4-4 8 4 14 0s10 4 14 0" /></Swatch> },
  { id: "diamonds", label: "Diamonds", art: <Swatch><path d="M20 6 34 20 20 34 6 20ZM13 13l14 14M27 13 13 27" /></Swatch> },
  { id: "image", label: "My image", art: IMAGE_SWATCH },
];
const EDGES: { id: GlassEdge; label: string; art: ReactNode }[] = [
  { id: "classic", label: "Classic", art: <Swatch><circle cx="20" cy="20" r="17" /></Swatch> },
  { id: "double", label: "Double", art: <Swatch><circle cx="20" cy="20" r="17" /><circle cx="20" cy="20" r="14" /></Swatch> },
  { id: "dashed", label: "Dashed", art: <Swatch><circle cx="20" cy="20" r="16" strokeWidth="2" strokeDasharray="5 3" /></Swatch> },
  { id: "beaded", label: "Beaded", art: <Swatch>{dots(22, 16, 1.5)}</Swatch> },
  { id: "film", label: "Film strip", art: <Swatch><circle cx="20" cy="20" r="18" /><circle cx="20" cy="20" r="13" /><circle cx="20" cy="20" r="15.5" strokeWidth="2.5" strokeDasharray="2 2.8" /></Swatch> },
  { id: "rope", label: "Rope", art: <Swatch><circle cx="20" cy="20" r="15.5" strokeWidth="3.5" strokeDasharray="1.4 1.6" /></Swatch> },
  { id: "scallop", label: "Scallop", art: <Swatch><polyline points={outline(14, 3)} /></Swatch> },
  { id: "gear", label: "Notched", art: <Swatch><polyline points={outline(16, 2.4)} strokeWidth="1.8" /></Swatch> },
  { id: "image", label: "My image", art: IMAGE_SWATCH },
];

/**
 * Everything about how the glass disc is made, in one place: pick a look, or
 * change its surface, pattern, edge and picture one at a time. Changes show live.
 */
export function GlassDesignEditor({ disc, onChange, onShow }: { disc: DiscControls; onChange: (patch: Partial<GlassDesign>) => void; onShow: () => void }) {
  const [tab, setTab] = useState<Tab>("looks");
  const [picking, setPicking] = useState<ImageField | null>(null);

  const percent = (key: DiscNumericKey, label: string, hint?: string) => {
    const [min, max, step] = DISC_RANGES[key];
    return <Slider key={key} label={label} hint={hint} value={disc[key]} min={min} max={max} step={step} editable inputScale={100} inputUnit="%"
      format={(n) => `${Math.round(n * 100)}%`} onChange={(next) => onChange({ [key]: next })} />;
  };
  const whole = (key: DiscNumericKey, label: string, unit: string, hint?: string) => {
    const [min, max, step] = DISC_RANGES[key];
    return <Slider key={key} label={label} hint={hint} value={disc[key]} min={min} max={max} step={step} editable inputUnit={unit}
      format={(n) => `${n}${unit}`} onChange={(next) => onChange({ [key]: next })} />;
  };
  const choices = <T extends string>(label: string, options: { id: T; label: string; hint?: string; art: ReactNode }[], value: T, pick: (id: T) => void) => (
    <div className={styles.designChoices} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} title={option.hint} onClick={() => pick(option.id)}>
          {option.art}
          {option.label}
        </button>
      ))}
    </div>
  );
  const imageField = (field: ImageField, label: string, hint: string) => {
    const src = disc[field];
    return (
      <div className={styles.control}>
        <span className={styles.controlLabel}>{label}</span>
        <button type="button" className={styles.picture} aria-expanded={picking === field} onClick={() => setPicking(picking === field ? null : field)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the chosen picture */}
          {src && <img src={resizedSrc(src, 480)} alt="" />}
          <span>{picking === field ? "Close the pictures" : src ? "Change the picture" : "Upload or choose a picture"}</span>
        </button>
        {picking === field && <ImagePicker value={src} onPick={(next) => onChange({ [field]: next })} onClose={() => setPicking(null)} />}
        {src && <button type="button" className={styles.linkButton} onClick={() => { onChange({ [field]: "" }); setPicking(null); }}>Take this picture off the glass</button>}
        <p className={styles.controlHint}>{hint}</p>
      </div>
    );
  };
  const activeEffect = EFFECTS.find((effect) => effect.id === disc.glassEffect)!;

  return (
    <Section id="glass-design" title="Glass design" scope="Page" hint="Design the disc itself: its surface, a pattern across it, its outer edge, and a picture on the glass. Every change shows in the preview straight away.">
      <div className={styles.designTabs} role="group" aria-label="Glass design tools">
        {TABS.map(({ id, label }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setPicking(null); }}>{label}</button>)}
      </div>

      {tab === "looks" && <>
        <p className={styles.controlHint}>Start from a finished look, then fine-tune it in the other tabs. Your uploaded pictures are kept.</p>
        {choices("Finished looks", GLASS_LOOKS.map((look) => ({ id: look.id, label: look.label, art: EFFECTS.find((effect) => effect.id === look.patch.glassEffect)!.art })),
          GLASS_LOOKS.find((look) => Object.entries(look.patch).every(([key, value]) => disc[key as keyof GlassDesign] === value))?.id ?? "",
          (id) => onChange(GLASS_LOOKS.find((look) => look.id === id)!.patch))}
      </>}

      {tab === "surface" && <>
        {choices("Glass surface", EFFECTS, disc.glassEffect, (glassEffect) => onChange({ glassEffect }))}
        <p className={styles.controlHint}>{activeEffect.hint}</p>
        {disc.glassEffect !== "clear" && percent("glassEffectAmount", "Strength")}
        {disc.glassEffect !== "clear" && disc.glassEffect !== "frosted" && percent("glassEffectScale", "Texture size", "Smaller is finer; larger is bolder.")}
        {disc.glassEffect === "liquid" && percent("glassEffectFlow", "Movement", "Zero holds the ripples still. Visitors who ask for reduced motion always see them still.")}
      </>}

      {tab === "pattern" && <>
        {choices("Pattern across the disc", PATTERNS, disc.patternKind, (patternKind) => { onChange({ patternKind }); if (patternKind === "image" && !disc.patternImage) setPicking("patternImage"); })}
        {disc.patternKind === "image" && <>
          {imageField("patternImage", "Your pattern", "A transparent PNG works best. On a flat picture, its light or dark marks become the pattern.")}
          <label className={styles.controlLabel}>How it fills the disc
            <select className={styles.select} value={disc.patternFit} onChange={(event) => onChange({ patternFit: event.target.value as GlassDesign["patternFit"] })}>
              <option value="tile">Repeat it across the disc</option>
              <option value="cover">One image over the whole disc</option>
            </select>
          </label>
          {percent("patternGlass", "Glass effect", "0% shows your image's own colours. 100% turns it into etched glass that catches the light.")}
        </>}
        {disc.patternKind !== "none" && <>
          {percent("patternAmount", "Visibility")}
          {percent("patternScale", "Pattern size")}
          {(disc.patternKind !== "image" || disc.patternGlass > 0) && <ColorRow label="Pattern colour" value={disc.patternColor} onChange={(patternColor) => onChange({ patternColor })} />}
        </>}
      </>}

      {tab === "edge" && <>
        {choices("Outer edge", EDGES, disc.edgeStyle, (edgeStyle) => { onChange({ edgeStyle }); if (edgeStyle === "image" && !disc.edgeImage) setPicking("edgeImage"); })}
        {disc.edgeStyle === "image" && <>
          {imageField("edgeImage", "Your edge pattern", "Replaces the arc border. Your image repeats around the rim, with its top facing outward. Until one is chosen, the classic edge stays.")}
          {percent("edgeGlass", "Glass effect", "0% shows your image's own colours. 100% turns it into etched glass.")}
        </>}
        {disc.edgeStyle === "classic"
          ? <p className={styles.controlHint}>The fine classic rim. Its thickness and hairlines are in Circle &amp; entrance below.</p>
          : <>
            {percent("edgeWidth", "Edge width")}
            {percent("edgeBrightness", "Brightness")}
            {disc.edgeStyle !== "double" && whole("edgeRepeats", "Repeats around the rim", "", "How many times the shape repeats around the whole circle.")}
            {disc.edgeStyle !== "image" && <ColorRow label="Edge colour" value={disc.edgeColor} onChange={(edgeColor) => onChange({ edgeColor })} />}
          </>}
        <p className={styles.designHeading}>Circle marks on the rim</p>
        {whole("ringMarks", "How many", "", "The small circles on the rim. Zero removes them.")}
        {disc.ringMarks > 0 && percent("ringMarkSize", "Size")}
      </>}

      {tab === "picture" && <>
        {imageField("pictureImage", "Picture on the glass", "Sits on the glass, under your titles. A transparent PNG looks best.")}
        {disc.pictureImage && <>
          {percent("pictureGlass", "Glass effect", "0% shows your picture's own colours. 100% turns it into etched glass that lights up under the beam.")}
          {percent("pictureOpacity", "Visibility")}
          {percent("pictureSize", "Size")}
          {percent("pictureDistance", "Distance from the centre", "Only the outer part of the disc is on screen, so keep this high enough to see it.")}
          {whole("pictureAngle", "Position around the disc", "°")}
          {whole("pictureRotation", "Turn the picture", "°")}
          <Toggle label="Turn with the disc" hint="On: it travels around with your titles, on every screen size. Off: it stays where you place it, so check it on phone and tablet too."
            checked={disc.pictureFollow === 1} onChange={(follow) => onChange({ pictureFollow: follow ? 1 : 0 })} />
        </>}
      </>}

      <div className={styles.discShortcuts}>
        <button type="button" className={styles.ghostButton} onClick={onShow}>Show it in the preview ↓</button>
        <button type="button" className={styles.linkButton} onClick={() => { onChange({ ...GLASS_DESIGN_DEFAULTS }); setPicking(null); }}>Reset the glass design</button>
      </div>
    </Section>
  );
}

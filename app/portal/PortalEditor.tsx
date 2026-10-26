"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_INTRO_SETTINGS,
  LIMITS,
  colorFractions,
  sanitizeIntroSettings,
  type FieldSettings,
  type IntroSettings,
} from "@/lib/intro/settings";
import { PREVIEW_PARAM, type PortalToSite, type PreviewRun, type SiteToPortal } from "@/lib/intro/preview-protocol";
import { T } from "@/lib/intro/timeline";
import { Section, Slider, Toggle, percent } from "./controls";
import styles from "./portal.module.css";

const PREVIEW_W = 1440;
const PREVIEW_H = 810;
/** Latest moment a held frame still shows the intro (after this the page has taken over). */
const LAST_INTRO_FRAME = T.fadeStart - 0.05;
const NEW_COLORS = ["#b76e79", "#e8b04b", "#9fb7ff", "#ffffff", "#ff8a3d", "#7fd1b9"];

const BEATS = [
  { at: 0, label: "Stars" },
  { at: T.bigStarEnter, label: "Big star" },
  { at: T.docked, label: "Lands" },
  { at: T.shiverStart, label: "Shiver" },
  { at: T.waveStart, label: "Wave" },
  { at: T.sheenStart, label: "Sheen" },
  { at: T.fadeStart, label: "Page" },
];

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const same = (a: IntroSettings, b: IntroSettings) => JSON.stringify(a) === JSON.stringify(b);

export function PortalEditor({ initial }: { initial: IntroSettings }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const dirty = !same(saved, draft);

  // --- preview ------------------------------------------------------------------------
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [holding, setHolding] = useState(false);
  const runRef = useRef<PreviewRun>({ key: 0, at: 0, paused: false, seed: 7 });
  const sentRef = useRef<IntroSettings | null>(null);
  const playheadRef = useRef(0);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const send = useCallback((msg: PortalToSite) => {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  const startRun = useCallback(
    (at: number, paused: boolean, seed = runRef.current.seed) => {
      runRef.current = { key: runRef.current.key + 1, at, paused, seed };
      playheadRef.current = at;
      setPlayhead(at);
      setHolding(paused);
      send({ source: "dds-portal", type: "run", run: runRef.current });
    },
    [send],
  );

  // Dragging the timeline rebuilds the held frame at most ~8 times a second; the last position always lands.
  const scrubRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; at: number }>({ timer: null, at: 0 });
  const scrubTo = useCallback(
    (at: number) => {
      const scrub = scrubRef.current;
      scrub.at = at;
      playheadRef.current = at;
      setPlayhead(at);
      if (scrub.timer) return;
      startRun(at, true);
      scrub.timer = setTimeout(() => {
        scrub.timer = null;
        if (scrub.at !== runRef.current.at) startRun(scrub.at, true);
      }, 120);
    },
    [startRun],
  );

  // Scale the full-size preview page down to fit the stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => setScale(stage.clientWidth / PREVIEW_W));
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Messages from the preview page. When it says it's ready, hand it the current draft and play from the top.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data as SiteToPortal;
      if (msg?.source !== "dds-site") return;
      if (msg.type === "ready") {
        sentRef.current = draftRef.current;
        send({ source: "dds-portal", type: "settings", settings: draftRef.current });
        startRun(0, false);
        setReady(true);
      }
      if (msg.type === "time") {
        playheadRef.current = msg.t;
        setPlayhead(msg.t);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, startRun]);

  // Every change shows up in the preview straight away: the page and lasting stars update live, and the intro
  // re-renders the moment you're looking at (held, so you can compare).
  useEffect(() => {
    if (!ready || sentRef.current === draft) return;
    const timer = setTimeout(() => {
      sentRef.current = draft;
      send({ source: "dds-portal", type: "settings", settings: draft });
      if (playheadRef.current >= T.fadeStart) return; // on the page: it and its stars already reflect the change
      startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), true);
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, ready, send, startRun]);

  // Don't lose unsaved work by accident.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // --- editing ------------------------------------------------------------------------
  function update(patch: Partial<IntroSettings>) {
    setDraft((d) => ({ ...d, ...patch }));
    setSave({ kind: "idle" });
  }
  function updateField(patch: Partial<FieldSettings>) {
    setDraft((d) => ({ ...d, field: { ...d.field, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateColor(index: number, patch: Partial<{ hex: string; share: number }>) {
    update({ colors: draft.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  }

  async function publish() {
    setSave({ kind: "saving" });
    try {
      const res = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) router.refresh();
        setSave({ kind: "error", message: body.error ?? "Couldn’t save. Try again." });
        return;
      }
      const next = sanitizeIntroSettings(body.settings);
      if (same(next, draft)) sentRef.current = next; // the preview already shows exactly this
      setSaved(next);
      setDraft(next);
      setSave({ kind: "saved" });
    } catch {
      setSave({ kind: "error", message: "Couldn’t reach the server. Check the connection and try again." });
    }
  }

  async function signOut() {
    await fetch("/api/portal/session", { method: "DELETE" });
    router.refresh();
  }

  const fractions = colorFractions(draft.colors);
  const onPage = playhead >= T.fadeStart;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandStar} aria-hidden="true">
            ★
          </span>
          <span className={styles.brandName}>Dolly Studio</span>
          <span className={styles.brandDivider} aria-hidden="true" />
          <span className={styles.brandArea}>Creator portal</span>
          <span className={styles.version}>Intro V1</span>
        </div>
        <div className={styles.actions}>
          <span className={styles.status} data-kind={dirty ? "dirty" : save.kind} role="status">
            {save.kind === "saving"
              ? "Publishing…"
              : save.kind === "error"
                ? save.message
                : dirty
                  ? "Unsaved changes"
                  : save.kind === "saved"
                    ? "Published — live on the site"
                    : "Everything is live"}
          </span>
          <button type="button" className={styles.ghostButton} disabled={!dirty} onClick={() => setDraft(saved)}>
            Discard changes
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            title="Try a new look: random finish, colour mix, motion and glass (background and colours kept)"
            onClick={() => update(randomLook(draft))}
          >
            ⚄ Randomize
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => update(sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS))}>
            Reset to defaults
          </button>
          <button type="button" className={styles.primaryButton} disabled={!dirty || save.kind === "saving"} onClick={publish}>
            Save &amp; publish
          </button>
          <button type="button" className={styles.linkButton} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.panel} aria-label="Intro settings">
          <Section title="Backdrop" hint="The background, and the dark tinted glass between the background stars and the logo.">
            <div className={styles.control}>
              <div className={styles.controlRow}>
                <span className={styles.controlLabel}>Background colour</span>
                <span className={styles.colorField}>
                  <input
                    type="color"
                    aria-label="Background colour"
                    className={styles.swatch}
                    value={draft.background}
                    onChange={(e) => update({ background: e.target.value })}
                  />
                  <HexInput value={draft.background} label="Background colour code" onChange={(hex) => update({ background: hex })} />
                </span>
              </div>
            </div>
            <div className={styles.control}>
              <div className={styles.controlRow}>
                <span className={styles.controlLabel}>Glass tint</span>
                <span className={styles.colorField}>
                  <input
                    type="color"
                    aria-label="Glass tint"
                    className={styles.swatch}
                    value={draft.glassColor}
                    onChange={(e) => update({ glassColor: e.target.value })}
                  />
                  <HexInput value={draft.glassColor} label="Glass tint code" onChange={(hex) => update({ glassColor: hex })} />
                </span>
              </div>
            </div>
            <Slider
              label="Glass opacity"
              value={draft.glassOpacity}
              min={0}
              max={0.85}
              step={0.01}
              format={percent}
              hint="How strongly the glass darkens the stars behind it, so the logo stands forward."
              onChange={(glassOpacity) => update({ glassOpacity })}
            />
            <Slider
              label="Glass blur"
              value={draft.glassFrost}
              min={0}
              max={8}
              step={0.5}
              format={(v) => (v === 0 ? "Clear" : `${v.toFixed(1)} px`)}
              hint="How frosted the glass is."
              onChange={(glassFrost) => update({ glassFrost })}
            />
          </Section>

          <Section title="Star finish" hint="How every star looks — in the intro and behind the page.">
            <Slider
              label="Glow intensity"
              value={draft.glow}
              min={LIMITS.glow[0]}
              max={LIMITS.glow[1]}
              step={0.05}
              format={percent}
              hint="100% is the original intro’s glow."
              onChange={(glow) => update({ glow })}
            />
            <div className={styles.control}>
              <div className={styles.controlRow}>
                <span className={styles.controlLabel}>Glow colour</span>
                <span className={styles.colorField}>
                  <input
                    type="color"
                    aria-label="Glow colour"
                    className={styles.swatch}
                    value={draft.glowColor}
                    disabled={draft.glowMatchStar}
                    onChange={(e) => update({ glowColor: e.target.value })}
                  />
                  <HexInput value={draft.glowColor} label="Glow colour code" onChange={(hex) => update({ glowColor: hex })} />
                </span>
              </div>
              <p className={styles.controlHint}>The glints on the stars, the glitter, and the light of the reveal wave.</p>
            </div>
            <Toggle
              label="Glint in each star’s own colour"
              hint="Glowing stars use their own colour instead of the glow colour."
              checked={draft.glowMatchStar}
              onChange={(glowMatchStar) => update({ glowMatchStar })}
            />
            <Slider
              label="Glowing stars"
              value={draft.glowingShare}
              min={LIMITS.glowingShare[0]}
              max={LIMITS.glowingShare[1]}
              step={1}
              format={(v) => `${Math.round(v)}% of stars`}
              onChange={(glowingShare) => update({ glowingShare })}
            />
            <Slider
              label="Star size"
              value={draft.starSize}
              min={LIMITS.starSize[0]}
              max={LIMITS.starSize[1]}
              step={0.05}
              format={percent}
              onChange={(starSize) => update({ starSize })}
            />
            <Slider
              label="Facet depth"
              value={draft.starDepth}
              min={LIMITS.starDepth[0]}
              max={LIMITS.starDepth[1]}
              step={0.05}
              format={percent}
              hint="How deeply each star’s facets are cut."
              onChange={(starDepth) => update({ starDepth })}
            />
            <Slider
              label="Metallic texture"
              value={draft.metallic}
              min={LIMITS.metallic[0]}
              max={LIMITS.metallic[1]}
              step={0.05}
              format={percent}
              hint="Brushed, spun-metal grain on the facets."
              onChange={(metallic) => update({ metallic })}
            />
          </Section>

          <Section title="Star colours" hint="Each colour’s share of the stars. Glowing stars glow in their own colour.">
            <div className={styles.mixBar} aria-hidden="true">
              {draft.colors.map((c, i) => (
                <span key={i} style={{ background: c.hex, flexGrow: fractions[i] }} />
              ))}
            </div>
            <ul className={styles.colorList}>
              {draft.colors.map((c, i) => (
                <li key={i} className={styles.colorRow}>
                  <input
                    type="color"
                    aria-label={`Colour ${i + 1}`}
                    className={styles.swatch}
                    value={c.hex}
                    onChange={(e) => updateColor(i, { hex: e.target.value })}
                  />
                  <HexInput value={c.hex} label={`Colour ${i + 1} code`} onChange={(hex) => updateColor(i, { hex })} />
                  <input
                    type="range"
                    aria-label={`Colour ${i + 1} share`}
                    className={styles.range}
                    min={LIMITS.colorShare[0]}
                    max={LIMITS.colorShare[1]}
                    step={1}
                    value={c.share}
                    style={{ "--fill": `${c.share}%` } as React.CSSProperties}
                    onChange={(e) => updateColor(i, { share: Number(e.target.value) })}
                  />
                  <span className={styles.share}>{Math.round(fractions[i] * 100)}%</span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove colour ${i + 1}`}
                    disabled={draft.colors.length <= LIMITS.colorCount[0]}
                    onClick={() => update({ colors: draft.colors.filter((_, k) => k !== i) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={draft.colors.length >= LIMITS.colorCount[1]}
                onClick={() => {
                  const hex = NEW_COLORS.find((h) => !draft.colors.some((c) => c.hex === h)) ?? "#ffffff";
                  update({ colors: [...draft.colors, { hex, share: 25 }] });
                }}
              >
                + Add colour
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={draft.colors.length < 2}
                onClick={() => update({ colors: draft.colors.map((c) => ({ ...c, share: 50 })) })}
              >
                Even split
              </button>
            </div>
          </Section>

          <Section title="Formation" hint="The stars that fly in and draw the logo.">
            <Slider
              label="Number of stars"
              value={draft.formationCount}
              min={LIMITS.formationCount[0]}
              max={LIMITS.formationCount[1]}
              step={50}
              format={(v) => String(Math.round(v))}
              onChange={(formationCount) => update({ formationCount })}
            />
            <Slider
              label="Depth of space"
              value={draft.spaceDepth}
              min={LIMITS.spaceDepth[0]}
              max={LIMITS.spaceDepth[1]}
              step={0.05}
              format={percent}
              hint="How far behind and in front of the logo the stars spread."
              onChange={(spaceDepth) => update({ spaceDepth })}
            />
          </Section>

          <Section title="After the reveal" hint="The few stars that stay behind the logo on the page.">
            <Slider
              label="Stars that stay"
              value={draft.field.count}
              min={LIMITS.fieldCount[0]}
              max={LIMITS.fieldCount[1]}
              step={1}
              format={(v) => (v === 0 ? "None" : String(Math.round(v)))}
              onChange={(count) => updateField({ count })}
            />
            <Slider
              label="Floating motion"
              value={draft.field.motion}
              min={0}
              max={1}
              step={0.05}
              format={percent}
              onChange={(motion) => updateField({ motion })}
            />
            <Slider
              label="Cursor response"
              value={draft.field.cursor}
              min={0}
              max={1}
              step={0.05}
              format={percent}
              hint="Moving the cursor sends soft ripples through the stars."
              onChange={(cursor) => updateField({ cursor })}
            />
            <Slider
              label="Depth blur"
              value={draft.field.depthBlur}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v === 0 ? "Off" : percent(v))}
              hint="Near stars stay crisp; farther ones go soft."
              onChange={(depthBlur) => updateField({ depthBlur })}
            />
            <Slider
              label="Corner stars"
              value={draft.field.cornerStars}
              min={0}
              max={2}
              step={1}
              format={(v) => (v === 0 ? "None" : String(v))}
              hint="Big stars peeking in from the corners, turning slowly."
              onChange={(cornerStars) => updateField({ cornerStars })}
            />
          </Section>

          <Section title="Intro">
            <Toggle
              label="Play the intro on the home page"
              hint="When off, the home page opens straight onto the logo."
              checked={draft.enabled}
              onChange={(enabled) => update({ enabled })}
            />
          </Section>
        </aside>

        <main className={styles.stageColumn}>
          <div className={styles.stageFrame}>
            <div ref={stageRef} className={styles.stage} style={{ aspectRatio: `${PREVIEW_W} / ${PREVIEW_H}` }}>
              <iframe
                ref={frameRef}
                title="Live preview of the home page"
                src={`/?${PREVIEW_PARAM}`}
                className={styles.frame}
                style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${scale})` }}
              />
              {!ready && <div className={styles.loading}>Loading preview…</div>}
            </div>
          </div>

          <div className={styles.transport}>
            <div className={styles.transportButtons}>
              <button type="button" className={styles.primaryButton} disabled={!ready} onClick={() => startRun(0, false)}>
                ▶ Play from start
              </button>
              {holding ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={!ready}
                  onClick={() => startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), false)}
                >
                  ▶ Play from here
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={!ready || onPage}
                  onClick={() => startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), true)}
                >
                  ❚❚ Hold this frame
                </button>
              )}
              <button type="button" className={styles.ghostButton} disabled={!ready} onClick={() => startRun(T.end, false)}>
                Show the page
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                disabled={!ready}
                title="Lay the stars out differently"
                onClick={() => startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), holding, Math.floor(Math.random() * 1e9))}
              >
                ⟳ Shuffle stars
              </button>
              <span className={styles.clock}>{onPage ? "Page" : `${playhead.toFixed(1)}s`}</span>
            </div>

            <div className={styles.timeline}>
              <input
                type="range"
                aria-label="Intro timeline"
                className={styles.range}
                min={0}
                max={LAST_INTRO_FRAME}
                step={0.05}
                value={Math.min(playhead, LAST_INTRO_FRAME)}
                disabled={!ready}
                style={{ "--fill": `${(Math.min(playhead, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%` } as React.CSSProperties}
                onChange={(e) => scrubTo(Number(e.target.value))}
              />
              <div className={styles.beats}>
                {BEATS.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className={styles.beat}
                    style={{ left: `${(Math.min(b.at, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%` }}
                    disabled={!ready}
                    onClick={() => (b.at >= T.fadeStart ? startRun(T.end, false) : startRun(b.at + 0.3, true))}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.tip}>
              Changes appear in the preview instantly — drag the timeline to hold any moment, then adjust. Nothing reaches
              visitors until you press <strong>Save &amp; publish</strong>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

const between = (min: number, max: number, step = 0.05) => Math.round((min + Math.random() * (max - min)) / step) * step;

/** A fresh look within tasteful ranges. Keeps the background, the colours themselves and whether the intro plays. */
function randomLook(current: IntroSettings): IntroSettings {
  return sanitizeIntroSettings({
    ...current,
    glow: between(0.3, 0.9),
    glowingShare: between(6, 24, 1),
    starSize: between(0.8, 1.3),
    starDepth: between(0.7, 1.8),
    metallic: between(0.3, 0.85),
    spaceDepth: between(0.8, 1.3),
    formationCount: between(500, 950, 50),
    glassOpacity: between(0.22, 0.5, 0.01),
    glassFrost: between(1.5, 5, 0.5),
    colors: current.colors.map((c) => ({ ...c, share: between(15, 60, 1) })),
    field: {
      ...current.field,
      count: between(24, 48, 1),
      motion: between(0.3, 0.8),
      cursor: between(0.3, 0.8),
      depthBlur: between(0.2, 0.8),
      cornerStars: between(1, 2, 1),
    },
  });
}

/** A #rrggbb text box that only commits valid colour codes. */
function HexInput({ value, label, onChange }: { value: string; label: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : value;
  return (
    <input
      type="text"
      aria-label={label}
      className={styles.hex}
      value={shown}
      spellCheck={false}
      maxLength={7}
      onFocus={() => {
        setText(value);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const next = e.target.value.trim();
        setText(next);
        const hex = next.startsWith("#") ? next : `#${next}`;
        if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
      }}
    />
  );
}

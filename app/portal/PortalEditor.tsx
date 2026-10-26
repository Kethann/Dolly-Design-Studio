"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_INTRO_SETTINGS,
  ART_STYLES,
  LIMITS,
  colorFractions,
  sanitizeIntroSettings,
  type FieldSettings,
  type IntroSettings,
} from "@/lib/intro/settings";
import { PREVIEW_PARAM, type PortalToSite, type PreviewRun, type SiteToPortal } from "@/lib/intro/preview-protocol";
import { T } from "@/lib/intro/timeline";
import { Choice, Dial, Section, Slider, Toggle, percent } from "./controls";
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

type Tab = "background" | "stars" | "look" | "intro";
const TABS: { id: Tab; name: string; hint: string }[] = [
  { id: "background", name: "Background", hint: "colour · gradient · glass" },
  { id: "stars", name: "Stars", hint: "layers · motion" },
  { id: "look", name: "Look", hint: "glow · colours" },
  { id: "intro", name: "Intro", hint: "the opening" },
];

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The settings that change the intro's layout (and need it restarted); everything else updates it live. */
function introLayout(s: IntroSettings) {
  return [
    s.enabled,
    s.formationCount,
    s.revealStyle,
    s.introStarSize,
    s.starSize,
    s.spaceDepth,
    s.scatter,
    s.disperse,
    s.glowingShare,
    s.colors,
    s.field.count,
    s.field.size,
    s.front.count,
    s.front.size,
    s.stream.corners,
    s.introBlur > 0,
  ];
}

export function PortalEditor({ initial }: { initial: IntroSettings }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [tab, setTab] = useState<Tab>("background");
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
  const scrubRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    at: number;
  }>({ timer: null, at: 0 });
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
        send({
          source: "dds-portal",
          type: "settings",
          settings: draftRef.current,
        });
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
      const previous = sentRef.current;
      sentRef.current = draft;
      send({ source: "dds-portal", type: "settings", settings: draft });
      if (playheadRef.current >= T.fadeStart) return; // on the page: it and its stars already reflect the change
      if (previous && same(introLayout(previous), introLayout(draft))) return; // shown live, no restart needed
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
  function updateStream(patch: Partial<IntroSettings["stream"]>) {
    setDraft((d) => ({ ...d, stream: { ...d.stream, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateLogoGlow(patch: Partial<IntroSettings["logoGlow"]>) {
    setDraft((d) => ({ ...d, logoGlow: { ...d.logoGlow, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateDial(patch: Partial<IntroSettings["dial"]>) {
    setDraft((d) => ({ ...d, dial: { ...d.dial, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateArt(patch: Partial<IntroSettings["art"]>) {
    setDraft((d) => ({ ...d, art: { ...d.art, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateFront(patch: Partial<IntroSettings["front"]>) {
    setDraft((d) => ({ ...d, front: { ...d.front, ...patch } }));
    setSave({ kind: "idle" });
  }
  function updateColor(index: number, patch: Partial<{ hex: string; share: number }>) {
    update({
      colors: draft.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
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
        setSave({
          kind: "error",
          message: body.error ?? "Couldn’t save. Try again.",
        });
        return;
      }
      const next = sanitizeIntroSettings(body.settings);
      if (same(next, draft)) sentRef.current = next; // the preview already shows exactly this
      setSaved(next);
      setDraft(next);
      setSave({ kind: "saved" });
    } catch {
      setSave({
        kind: "error",
        message: "Couldn’t reach the server. Check the connection and try again.",
      });
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
          <span className={styles.version}>Intro V4</span>
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
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => update(sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS))}
          >
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
        <aside className={styles.panel} aria-label="Settings">
          <div className={styles.tabs} role="tablist" aria-label="Settings groups">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={styles.tab}
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                <span className={styles.tabName}>{t.name}</span>
                <span className={styles.tabHint}>{t.hint}</span>
              </button>
            ))}
          </div>

          {tab === "background" && (
            <>
              <Section
                id="layer-background"
                tag="Layer 5"
                title="Background"
                scope="Intro & page"
                hint="The colour behind everything — plain, or a premium gradient with sweeping curves and fine gold lines."
              >
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
                      <HexInput
                        value={draft.background}
                        label="Background colour code"
                        onChange={(hex) => update({ background: hex })}
                      />
                    </span>
                  </div>
                </div>
                <Toggle
                  label="Premium gradient"
                  hint="Off: the plain background colour."
                  checked={draft.art.enabled}
                  onChange={(enabled) => updateArt({ enabled })}
                />
                {draft.art.enabled && (
                  <>
                    <Choice
                      label="Style"
                      value={draft.art.style}
                      options={[
                        { value: "waves", label: "Waves" },
                        { value: "silk", label: "Silk" },
                        { value: "halo", label: "Halo" },
                        { value: "minimal", label: "Minimal" },
                      ]}
                      onChange={(style) => updateArt({ style })}
                    />
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => updateArt({ seed: Math.floor(Math.random() * 1e9) })}
                      >
                        ⟳ New arrangement
                      </button>
                    </div>
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Light colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Gradient second colour"
                            className={styles.swatch}
                            value={draft.art.tone}
                            onChange={(e) => updateArt({ tone: e.target.value })}
                          />
                          <HexInput
                            value={draft.art.tone}
                            label="Gradient second colour code"
                            onChange={(tone) => updateArt({ tone })}
                          />
                        </span>
                      </div>
                      <p className={styles.controlHint}>The light end of the gradient and the raised bands.</p>
                    </div>
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Shadow colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Gradient shadow colour"
                            className={styles.swatch}
                            value={draft.art.shadow}
                            onChange={(e) => updateArt({ shadow: e.target.value })}
                          />
                          <HexInput
                            value={draft.art.shadow}
                            label="Gradient shadow colour code"
                            onChange={(shadow) => updateArt({ shadow })}
                          />
                        </span>
                      </div>
                      <p className={styles.controlHint}>The dark end. The background colour sits between the two.</p>
                    </div>
                    <Dial
                      label="Rotation"
                      hint="Turn the whole design. Drag the dial, use the arrow keys, or pick a preset."
                      value={draft.art.rotation}
                      onChange={(rotation) => updateArt({ rotation })}
                    />
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Line colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Line colour"
                            className={styles.swatch}
                            value={draft.art.gold}
                            onChange={(e) => updateArt({ gold: e.target.value })}
                          />
                          <HexInput value={draft.art.gold} label="Line colour code" onChange={(gold) => updateArt({ gold })} />
                        </span>
                      </div>
                    </div>
                    <Slider
                      label="Gold lines"
                      value={draft.art.lines}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Off" : percent(v))}
                      onChange={(lines) => updateArt({ lines })}
                    />
                    <Slider
                      label="Shadow depth"
                      value={draft.art.depth}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      hint="How deep the shadows, folds and vignette go."
                      onChange={(depth) => updateArt({ depth })}
                    />
                    <Slider
                      label="Gradient movement"
                      value={draft.art.motion}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Still" : percent(v))}
                      onChange={(motion) => updateArt({ motion })}
                    />
                    <Slider
                      label="Gradient softness"
                      value={draft.art.softPage}
                      min={0}
                      max={1}
                      step={0.05}
                      format={(v) => (v === 0 ? "Crisp" : percent(v))}
                      hint="How soft the lines and edges are. (The glass adds its own blur on top.)"
                      onChange={(softPage) => updateArt({ softPage, softIntro: softPage })}
                    />
                  </>
                )}
              </Section>

              <Section
                id="layer-glass"
                tag="Layer 2"
                title="Tinted glass"
                scope="Intro & page"
                hint="Between the front and back stars, so the logo stands forward."
              >
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
                      <HexInput
                        value={draft.glassColor}
                        label="Glass tint code"
                        onChange={(hex) => update({ glassColor: hex })}
                      />
                    </span>
                  </div>
                </div>
                <Slider
                  label="Glass darkness"
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

              <Section
                id="layer-dial"
                title="Logo shield"
                scope="Intro & page"
                hint="A soft pool of dark glass behind the logo, so nothing behind it competes with the logo."
              >
                <Toggle
                  label="Dark glass behind the logo"
                  checked={draft.dial.enabled}
                  onChange={(enabled) => updateDial({ enabled })}
                />
                {draft.dial.enabled && (
                  <>
                    <Slider
                      label="Size"
                      value={draft.dial.size}
                      min={0.2}
                      max={0.7}
                      step={0.01}
                      format={percent}
                      onChange={(size) => updateDial({ size })}
                    />
                    <Slider
                      label="Darkness"
                      value={draft.dial.darkness}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      onChange={(darkness) => updateDial({ darkness })}
                    />
                  </>
                )}
              </Section>
            </>
          )}

          {tab === "stars" && (
            <>
              <nav className={styles.layerMap} aria-label="Layers, front to back">
                <p className={styles.layerMapTitle}>Layers · front to back</p>
                <ol>
                  <li className={styles.layerFixed}>
                    <span className={styles.layerNum}>★</span>
                    <span className={styles.layerName}>Logo &amp; page content</span>
                    <span className={styles.layerInfo}>always on top</span>
                  </li>
                  {[
                    {
                      id: "layer-front",
                      name: "Front stars",
                      info: draft.front.count
                        ? `${draft.front.count} · ${draft.front.blur ? `${draft.front.blur}px blur` : "sharp"}`
                        : "off",
                    },
                    {
                      id: "layer-glass",
                      name: "Tinted glass",
                      info: draft.glassOpacity ? `${Math.round(draft.glassOpacity * 100)}% · ${draft.glassFrost}px blur` : "off",
                    },
                    {
                      id: "layer-back",
                      name: "Back stars",
                      info: draft.field.count
                        ? `${draft.field.count} · depth blur ${Math.round(draft.field.depthBlur * 100)}%`
                        : "off",
                    },
                    {
                      id: "layer-corner",
                      name: "Big stars",
                      info: draft.field.cornerStars
                        ? `${draft.field.cornerStars} · ${Math.round(draft.field.cornerSize * 100)}%`
                        : "off",
                    },
                    {
                      id: "layer-background",
                      name: "Background",
                      info: draft.art.enabled ? `${draft.art.style} gradient` : draft.background,
                    },
                  ].map((l, i) => (
                    <li key={l.id}>
                      <a
                        href={`#${l.id}`}
                        className={styles.layerLink}
                        onClick={() => setTab(l.id === "layer-glass" || l.id === "layer-background" ? "background" : "stars")}
                      >
                        <span className={styles.layerNum}>{i + 1}</span>
                        <span className={styles.layerName}>{l.name}</span>
                        <span className={styles.layerInfo}>{l.info}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <Section
                id="layer-front"
                tag="Layer 1"
                title="Front stars"
                scope="Intro & page"
                hint="In front of the glass: nearer the screen, so bigger — and sharp unless you soften them."
              >
                <Slider
                  label="Front stars"
                  value={draft.front.count}
                  min={0}
                  max={40}
                  step={1}
                  format={(v) => (v === 0 ? "None" : String(Math.round(v)))}
                  onChange={(count) => updateFront({ count })}
                />
                <Slider
                  label="Front star blur"
                  value={draft.front.blur}
                  min={0}
                  max={6}
                  step={0.5}
                  format={(v) => (v === 0 ? "Sharp" : `${v.toFixed(1)} px`)}
                  hint="Soften the front stars for a shallower, more cinematic focus."
                  onChange={(blur) => updateFront({ blur })}
                />
                <Slider
                  label="Front star size"
                  value={draft.front.size}
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  format={percent}
                  onChange={(size) => updateFront({ size })}
                />
              </Section>

              <Section
                id="layer-back"
                tag="Layer 3"
                title="Back stars"
                scope="Intro & page"
                hint="Behind the glass, spread deep into the background."
              >
                <Slider
                  label="Back stars"
                  value={draft.field.count}
                  min={LIMITS.fieldCount[0]}
                  max={LIMITS.fieldCount[1]}
                  step={1}
                  format={(v) => (v === 0 ? "None" : String(Math.round(v)))}
                  onChange={(count) => updateField({ count })}
                />
                <Slider
                  label="Back star size"
                  value={draft.field.size}
                  min={0.4}
                  max={2.5}
                  step={0.05}
                  format={percent}
                  hint="Nearer back stars are still drawn bigger than farther ones."
                  onChange={(size) => updateField({ size })}
                />
                <Slider
                  label="Distance blur"
                  value={draft.field.depthBlur}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Near stars stay crisp; farther ones go soft."
                  onChange={(depthBlur) => updateField({ depthBlur })}
                />
              </Section>

              <Section
                id="layer-corner"
                tag="Layer 4"
                title="Big stars"
                scope="Intro & page"
                hint="One or two big stars peeking in from the corners, turning slowly behind the glass."
              >
                <Slider
                  label="Number of big stars"
                  value={draft.field.cornerStars}
                  min={0}
                  max={2}
                  step={1}
                  format={(v) => (v === 0 ? "None" : v === 1 ? "1 · bottom left" : "2 · both corners")}
                  onChange={(cornerStars) => updateField({ cornerStars })}
                />
                <Slider
                  label="Big star size"
                  value={draft.field.cornerSize}
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  format={percent}
                  onChange={(cornerSize) => updateField({ cornerSize })}
                />
                <Slider
                  label="Big star shine"
                  value={draft.bigShine}
                  min={0.2}
                  max={1.8}
                  step={0.05}
                  format={percent}
                  hint="How strongly their gold reflects light."
                  onChange={(bigShine) => update({ bigShine })}
                />
                <Slider
                  label="Big star glow"
                  value={draft.bigGlow}
                  min={0}
                  max={2}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Their glints, and the glow the hero star builds as it shivers on the logo."
                  onChange={(bigGlow) => update({ bigGlow })}
                />
              </Section>

              <Section
                title="Movement"
                scope="Intro & page"
                hint="At the top, stars stream out of the core behind the logo; as you scroll on, drifting stars take over."
              >
                <>
                  <Slider
                    label="Stream speed"
                    value={draft.stream.speed}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    onChange={(speed) => updateStream({ speed })}
                  />
                  <Slider
                    label="Tumble"
                    value={draft.stream.spin}
                    min={0}
                    max={1}
                    step={0.05}
                    format={percent}
                    hint="How fast each star tumbles on its way out."
                    onChange={(spin) => updateStream({ spin })}
                  />
                  <Slider
                    label="Flips"
                    value={draft.stream.flips}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(v) => (v === 0 ? "Never" : percent(v))}
                    hint="How often a star flips right over."
                    onChange={(flips) => updateStream({ flips })}
                  />
                  <Slider
                    label="Pull toward corners"
                    value={draft.stream.corners}
                    min={0}
                    max={1}
                    step={0.05}
                    format={(v) => (v === 0 ? "Evenly all round" : percent(v))}
                    hint="Pull the rays toward the screen's corners rather than straight out to the sides."
                    onChange={(corners) => updateStream({ corners })}
                  />
                </>
                <Slider
                  label="Drift when scrolling"
                  value={draft.field.motion}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  onChange={(motion) => updateField({ motion })}
                />
                <Slider
                  label="Cursor ripples"
                  value={draft.field.cursor}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  hint="Moving the cursor sends soft ripples through the stars."
                  onChange={(cursor) => updateField({ cursor })}
                />
              </Section>
            </>
          )}

          {tab === "look" && (
            <>
              <Section
                title="Star finish"
                scope="Intro & page"
                hint="How the stars on the page look. (The intro’s stars have their own size, texture and shine under Intro; big stars under Stars.)"
              >
                <Slider
                  label={draft.glowLinked ? "Glow · intro & page" : "Glow · intro"}
                  value={draft.glow}
                  min={LIMITS.glow[0]}
                  max={LIMITS.glow[1]}
                  step={0.05}
                  format={percent}
                  hint="100% is the original intro’s glow."
                  onChange={(glow) => update({ glow })}
                />
                <Toggle
                  label="Same glow on the page"
                  hint="Off: set the glow of the stars on the page (after the reveal) separately."
                  checked={draft.glowLinked}
                  onChange={(glowLinked) => update({ glowLinked, pageGlow: draft.glow })}
                />
                {!draft.glowLinked && (
                  <Slider
                    label="Glow · page"
                    value={draft.pageGlow}
                    min={LIMITS.glow[0]}
                    max={LIMITS.glow[1]}
                    step={0.05}
                    format={percent}
                    hint="The stars behind and in front of the glass, after the intro. They ease into it after the hand-off."
                    onChange={(pageGlow) => update({ pageGlow })}
                  />
                )}
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
                <Slider
                  label="Shine"
                  value={draft.shine}
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  format={percent}
                  hint="How strongly the metal reflects light. Lower it if the stars look too bright, without losing the glints."
                  onChange={(shine) => update({ shine })}
                />
              </Section>

              <Section
                title="Logo hover glow"
                scope="Page"
                hint="The part of the logo around the cursor lights up, with a soft halo."
              >
                <Toggle
                  label="Glow on hover"
                  checked={draft.logoGlow.enabled}
                  onChange={(enabled) => updateLogoGlow({ enabled })}
                />
                {draft.logoGlow.enabled && (
                  <>
                    <div className={styles.control}>
                      <div className={styles.controlRow}>
                        <span className={styles.controlLabel}>Glow colour</span>
                        <span className={styles.colorField}>
                          <input
                            type="color"
                            aria-label="Logo glow colour"
                            className={styles.swatch}
                            value={draft.logoGlow.color}
                            onChange={(e) => updateLogoGlow({ color: e.target.value })}
                          />
                          <HexInput
                            value={draft.logoGlow.color}
                            label="Logo glow colour code"
                            onChange={(color) => updateLogoGlow({ color })}
                          />
                        </span>
                      </div>
                    </div>
                    <Slider
                      label="Glow intensity"
                      value={draft.logoGlow.intensity}
                      min={0}
                      max={1}
                      step={0.05}
                      format={percent}
                      onChange={(intensity) => updateLogoGlow({ intensity })}
                    />
                    <Slider
                      label="Glow spread"
                      value={draft.logoGlow.spread}
                      min={60}
                      max={400}
                      step={10}
                      format={(v) => `${Math.round(v)} px`}
                      hint="How far around the cursor the logo lights up."
                      onChange={(spread) => updateLogoGlow({ spread })}
                    />
                  </>
                )}
              </Section>

              <Section
                title="Star colours"
                scope="Intro & page"
                hint="Set each colour’s share with its slider — the ratio below shows how the stars are split."
              >
                <p className={styles.ratio}>
                  Ratio{" "}
                  {draft.colors.map((c, i) => (
                    <span key={i}>
                      {i > 0 && " : "}
                      <span style={{ color: c.hex }}>{Math.round(fractions[i] * 100)}</span>
                    </span>
                  ))}
                </p>
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
                        onClick={() =>
                          update({
                            colors: draft.colors.filter((_, k) => k !== i),
                          })
                        }
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
                    onClick={() =>
                      update({
                        colors: draft.colors.map((c) => ({ ...c, share: 50 })),
                      })
                    }
                  >
                    Even split
                  </button>
                </div>
              </Section>
            </>
          )}

          {tab === "intro" && (
            <>
              <Section title="Intro" scope="Intro" hint="The stars that fly in and draw the logo.">
                <Choice
                  label="Logo reveal"
                  value={draft.revealStyle}
                  options={[
                    { value: "wave", label: "Wave" },
                    { value: "glow", label: "Glow" },
                  ]}
                  hint={
                    draft.revealStyle === "wave"
                      ? "Light ripples out from the star through the letters, revealing the logo."
                      : "The whole logo lights up from within in a warm glow, then settles into its gold."
                  }
                  onChange={(revealStyle) => update({ revealStyle })}
                />
                <Toggle
                  label="Play the intro on the home page"
                  hint="When off, the home page opens straight onto the logo."
                  checked={draft.enabled}
                  onChange={(enabled) => update({ enabled })}
                />
                <Slider
                  label="Logo stars"
                  value={draft.formationCount}
                  min={LIMITS.formationCount[0]}
                  max={LIMITS.formationCount[1]}
                  step={50}
                  format={(v) => String(Math.round(v))}
                  onChange={(formationCount) => update({ formationCount })}
                />
                <Slider
                  label="Logo star size"
                  value={draft.introStarSize}
                  min={0.3}
                  max={1.6}
                  step={0.05}
                  format={percent}
                  hint="Smaller stars and fewer of them make a lighter, less crowded logo."
                  onChange={(introStarSize) => update({ introStarSize })}
                />
                <Slider
                  label="Intro star texture"
                  value={draft.introMetallic}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Smooth" : percent(v))}
                  hint="Brushed-metal grain on the intro's stars."
                  onChange={(introMetallic) => update({ introMetallic })}
                />
                <Slider
                  label="Intro star shine"
                  value={draft.introShine}
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  format={percent}
                  hint="How strongly the intro's stars reflect light — lower for a calmer, less heavy intro."
                  onChange={(introShine) => update({ introShine })}
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
                <Slider
                  label="Distance blur"
                  value={draft.introBlur}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Off" : percent(v))}
                  hint="Far and very near stars soften while the logo, its stars and the big star stay in focus."
                  onChange={(introBlur) => update({ introBlur })}
                />
                <Slider
                  label="Scatter"
                  value={draft.scatter}
                  min={0}
                  max={1}
                  step={0.05}
                  format={percent}
                  hint="How widely the stars sweep in, and how staggered their arrivals are."
                  onChange={(scatter) => update({ scatter })}
                />
                <Slider
                  label="Disperse"
                  value={draft.disperse}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? "Tight" : percent(v))}
                  hint="How loosely they settle around the letters."
                  onChange={(disperse) => update({ disperse })}
                />
              </Section>
            </>
          )}
        </aside>

        <main className={styles.stageColumn}>
          <div className={styles.stageFrame}>
            <div ref={stageRef} className={styles.stage} style={{ aspectRatio: `${PREVIEW_W} / ${PREVIEW_H}` }}>
              <iframe
                ref={frameRef}
                title="Live preview of the home page"
                src={`/?${PREVIEW_PARAM}`}
                className={styles.frame}
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_H,
                  transform: `scale(${scale})`,
                }}
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
                onClick={() =>
                  startRun(Math.min(playheadRef.current, LAST_INTRO_FRAME), holding, Math.floor(Math.random() * 1e9))
                }
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
                style={
                  {
                    "--fill": `${(Math.min(playhead, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(e) => scrubTo(Number(e.target.value))}
              />
              <div className={styles.beats}>
                {BEATS.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className={styles.beat}
                    style={{
                      left: `${(Math.min(b.at, LAST_INTRO_FRAME) / LAST_INTRO_FRAME) * 100}%`,
                    }}
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
    scatter: between(0.3, 0.8),
    disperse: between(0, 0.3),
    shine: between(0.6, 1.1),
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
      cornerSize: between(0.8, 1.3),
      size: between(0.8, 1.4),
    },
    front: { count: between(4, 16, 1), blur: between(0, 2, 0.5), size: between(0.8, 1.4) },
    art: {
      ...current.art,
      style: ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)],
      seed: Math.floor(Math.random() * 1e9),
      depth: between(0.35, 0.85),
      lines: between(0.35, 0.85),
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

"use client";

import { useEffect, useRef, useState } from "react";
import { resizedSrc } from "@/lib/images";
import styles from "./VideoPlayer.module.css";

function playbackBus() {
  try { return window.top?.document ?? document; } catch { return document; }
}

/** No video connection or decoder until Play. Only one player remains loaded, and hidden players release it. */
export function VideoPlayer({ src, poster = "", title = "Video", width = 0, height = 0 }: { src: string; poster?: string; title?: string; width?: number; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState(width > 0 && height > 0 ? width / height : 16 / 9);

  useEffect(() => {
    if (!started) return;
    const el = video.current;
    const bus = playbackBus();
    const release = () => {
      if (el) {
        position.current = el.currentTime || 0;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      setStarted(false);
    };
    const hidden = () => { if (document.hidden) release(); };
    const other = (event: Event) => { if ((event as CustomEvent).detail !== el) release(); };
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) release(); });
    if (host.current) observer.observe(host.current);
    document.addEventListener("visibilitychange", hidden);
    bus.addEventListener("dds-video-play", other);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", hidden);
      bus.removeEventListener("dds-video-play", other);
      if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    };
  }, [started]);

  return (
    <div ref={host} className={styles.player} style={{ aspectRatio: ratio }} data-video-player>
      {started && !error ? (
        <video ref={video} src={src} controls autoPlay playsInline preload="metadata" aria-label={title || "Video"}
          poster={poster ? resizedSrc(poster, 960) : undefined}
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            if (el.videoWidth && el.videoHeight) setRatio(el.videoWidth / el.videoHeight);
            if (position.current > 0 && Number.isFinite(el.duration)) el.currentTime = Math.min(position.current, Math.max(0, el.duration - .1));
          }}
          onPlay={(event) => playbackBus().dispatchEvent(new CustomEvent("dds-video-play", { detail: event.currentTarget }))}
          onError={() => { setError(true); setStarted(false); }}
        />
      ) : error ? (
        <div className={styles.message} role="status">
          <strong>This video cannot play in this browser.</strong>
          <span>Try downloading it to watch in a video player.</span>
          <a href={src} download>Download video</a>
          <button type="button" onClick={() => { setError(false); setStarted(true); }}>Try again</button>
        </div>
      ) : (
        <button type="button" className={styles.play} onClick={() => setStarted(true)} aria-label={`Play ${title || "video"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- optional lazy poster, never a preloaded video */}
          {poster && <img src={resizedSrc(poster, 960)} alt="" loading="lazy" decoding="async" />}
          <span className={styles.playIcon} aria-hidden="true">▶</span>
          <span className={styles.playLabel}>Play video</span>
        </button>
      )}
    </div>
  );
}

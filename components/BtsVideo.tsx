/* eslint-disable @next/next/no-img-element -- uploaded BTS covers use the site's own resizing endpoint */
"use client";

import { useEffect, useRef, useState } from "react";
import { resizedSrc } from "@/lib/images";
import styles from "./BtsVideo.module.css";

/** A silent in-card preview; opening the dialog is the user gesture for sound playback. */
export function BtsVideo({ src, poster = "", title, width = 0, height = 0 }: { src: string; poster?: string; title: string; width?: number; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [opened, setOpened] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= .5 && !reduced.matches), { threshold: [0, .5] });
    if (host.current) observer.observe(host.current);
    const motion = () => {
      const rect = host.current?.getBoundingClientRect();
      setVisible(!reduced.matches && !!rect && rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2);
    };
    reduced.addEventListener("change", motion);
    return () => { observer.disconnect(); reduced.removeEventListener("change", motion); };
  }, []);

  useEffect(() => {
    const el = preview.current;
    if (!el) return;
    if (!visible || opened || document.hidden) el.pause();
    else void el.play().catch(() => { /* Keep the poster and open button if autoplay is blocked. */ });
  }, [visible, opened]);
  useEffect(() => {
    const changed = () => {
      const el = preview.current;
      if (document.hidden) el?.pause();
      else if (visible && !opened) void el?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, [visible, opened]);

  const open = () => {
    setFullFailed(false);
    preview.current?.pause();
    dialog.current?.showModal();
    setOpened(true);
  };
  const close = () => dialog.current?.close();

  return <>
    <div ref={host} className={styles.card} style={{ aspectRatio: ratio }} data-bts-video>
      {visible && !previewFailed ? <video ref={preview} src={src} muted autoPlay loop playsInline preload="none"
        poster={poster ? resizedSrc(poster, 640) : undefined} aria-hidden="true" onError={() => setPreviewFailed(true)} />
        : poster ? <img src={resizedSrc(poster, 640)} alt="" loading="lazy" decoding="async" /> : null}
      <button type="button" className={styles.open} onClick={open} aria-label={`Open ${title} video with sound`}>
        <span aria-hidden="true">▶</span><strong>Watch with sound</strong>
      </button>
    </div>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setOpened(false)} onClick={event => { if (event.target === dialog.current) close(); }} aria-label={`${title} video`}>
      <button type="button" className={styles.close} onClick={close} aria-label="Close video">×</button>
      {opened && !fullFailed ? <video src={src} controls autoPlay playsInline preload="metadata" aria-label={title}
        poster={poster ? resizedSrc(poster, 1280) : undefined} onError={() => setFullFailed(true)} /> : null}
      {fullFailed && <p role="status">This video cannot play here. <a href={src} download>Download it instead.</a></p>}
      <p>Sound plays when the video has audio. If your browser pauses it, press Play.</p>
    </dialog>
  </>;
}

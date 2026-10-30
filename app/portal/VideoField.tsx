"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_VIDEO_MB, MAX_VIDEO_BYTES } from "@/lib/video";
import { VideoPlayer } from "@/components/VideoPlayer";
import styles from "./content.module.css";

export interface VideoValue { video: string; videoWidth: number; videoHeight: number }

function dimensions(file: File, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve({ width: el.videoWidth || 0, height: el.videoHeight || 0 });
      el.removeAttribute("src"); el.load(); URL.revokeObjectURL(url);
    };
    const timer = setTimeout(finish, 8000);
    el.preload = "metadata";
    el.onloadedmetadata = el.onerror = finish;
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish(); else el.src = url;
  });
}

export function VideoField({ value, onChange }: { value: VideoValue; onChange: (value: VideoValue) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { pending.current?.abort(); request.current?.abort(); }, []);

  async function upload(file?: File) {
    if (!file || pending.current) return;
    setError("");
    if (!/\.(mp4|mkv)$/i.test(file.name)) { setError("Choose an MP4 or MKV video."); return; }
    if (!file.size || file.size > MAX_VIDEO_BYTES) { setError(`Choose a non-empty video up to ${MAX_VIDEO_MB} MB.`); return; }
    const controller = new AbortController();
    pending.current = controller;
    setProgress(-1);
    try {
      const size = await dimensions(file, controller.signal);
      if (controller.signal.aborted) return;
      setProgress(0);
      const src = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        request.current = xhr;
        xhr.open("POST", "/api/portal/videos");
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.timeout = 5 * 60_000;
        xhr.upload.onprogress = e => { if (e.lengthComputable && !controller.signal.aborted) setProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => {
          let data: { src?: string; error?: string } = {};
          try { data = JSON.parse(xhr.responseText); } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && data.src) resolve(data.src);
          else reject(new Error(data.error || "The video could not be uploaded. Try again."));
        };
        xhr.onerror = () => reject(new Error("The connection was interrupted. Try again."));
        xhr.ontimeout = () => reject(new Error("The upload timed out. Try a smaller clip or a faster connection."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
      if (!controller.signal.aborted) onChange({ video: src, videoWidth: size.width, videoHeight: size.height });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (pending.current === controller) { pending.current = null; request.current = null; if (!controller.signal.aborted) setProgress(null); }
    }
  }

  return <div className={styles.field} aria-busy={progress !== null}>
    <span className={styles.label}>Video</span>
    {value.video && <VideoPlayer key={value.video} src={value.video} width={value.videoWidth} height={value.videoHeight} title="Video preview" />}
    <div className={styles.mediaActions}>
      <button type="button" disabled={progress !== null} onClick={() => input.current?.click()}>{value.video ? "Replace video" : "Upload video"}</button>
      {value.video && <button type="button" disabled={progress !== null} onClick={() => onChange({ video: "", videoWidth: 0, videoHeight: 0 })}>Remove from card</button>}
      {progress !== null && <button type="button" onClick={() => { pending.current?.abort(); request.current?.abort(); setProgress(null); }}>Cancel upload</button>}
    </div>
    <input ref={input} hidden type="file" accept=".mp4,.mkv,video/mp4,video/x-matroska" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    {progress !== null && <p className={styles.hint} role="status">{progress < 0 ? "Checking video…" : progress === 100 ? "Finishing upload…" : `Uploading video… ${progress}%`}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.hint}>MP4 or MKV · up to {MAX_VIDEO_MB} MB. MP4 is recommended.</p>
    <details className={styles.imageDetails}><summary>Playback &amp; sizing</summary><p className={styles.hint}>Use MP4 with H.264 video and AAC audio for widest playback support. MKV may need downloading on some devices. Cards follow the video’s proportions, with text underneath. Removing a video from this card keeps the file in Storage.</p></details>
  </div>;
}

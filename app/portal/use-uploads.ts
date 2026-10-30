"use client";

import { useEffect, useRef, useState } from "react";
import { checkFile, type UploadKind } from "./upload";

export interface UploadState {
  busy: boolean;
  index: number;
  total: number;
  percent: number;
  errors: string[];
}
const IDLE: UploadState = { busy: false, index: 0, total: 0, percent: 0, errors: [] };

/** Sequential uploads with an immediate lock; closing the editor invalidates all pending draft updates. */
export function useUploads<T>(kind: UploadKind, send: (file: File, onProgress: (percent: number) => void) => Promise<T>) {
  const [state, setState] = useState<UploadState>(IDLE);
  const running = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; running.current = false; }, []);

  async function start(files: File[], onEach: (result: T, file: File) => void) {
    if (running.current) return;
    running.current = true;
    const run = ++generation.current;
    const current = () => generation.current === run && running.current;
    const errors: string[] = [];
    try {
      const ok = files.filter(file => {
        const problem = checkFile(file, kind);
        if (problem) errors.push(problem);
        return !problem;
      });
      setState({ ...IDLE, busy: ok.length > 0, total: ok.length, errors });
      for (let i = 0; i < ok.length && current(); i++) {
        setState(st => ({ ...st, index: i + 1, percent: 0 }));
        try {
          const result = await send(ok[i], percent => {
            if (current()) setState(st => ({ ...st, percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0 }));
          });
          if (current()) onEach(result, ok[i]);
        } catch (err) {
          if (current()) errors.push(`“${ok[i].name}”: ${err instanceof Error ? err.message : "Upload failed."}`);
        }
      }
    } finally {
      if (current()) { running.current = false; setState({ ...IDLE, errors }); }
    }
  }
  return { state, start, clearErrors: () => setState(st => ({ ...st, errors: [] })) };
}

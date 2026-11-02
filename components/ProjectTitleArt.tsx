"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Project } from "@/content/types";
import { adjustOf } from "@/lib/content/adjust";
import { discTitleInkBounds } from "@/lib/content/disc";
import { resizedSrc } from "@/lib/images";

/** Enough detail to find a title's edges, without reading every pixel of a large upload. */
const MEASURE = 256;

/** Where the visible title sits inside its file, as fractions, so empty space around it can be ignored. */
function measureInk(img: HTMLImageElement) {
  const scale = Math.min(1, MEASURE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(img, 0, 0, width, height);
  const ink = discTitleInkBounds(context.getImageData(0, 0, width, height).data, width, height);
  canvas.width = canvas.height = 0;
  return { x: ink.x / width, y: ink.y / height, w: ink.width / width, h: ink.height / height, aspect: (ink.width * img.naturalWidth / width) / (ink.height * img.naturalHeight / height) };
}

/**
 * A project's uploaded title picture, fitted automatically: transparent space around the lettering is trimmed, then the
 * lettering is sized to the card whatever its shape. The portal's zoom and position sliders fine-tune it from there.
 */
export function ProjectTitleArt({ project, className }: { project: Project; className?: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [ink, setInk] = useState<ReturnType<typeof measureInk>>(null);
  const measure = () => {
    const img = image.current;
    if (!img?.naturalWidth) return;
    try { setInk(measureInk(img)); } catch { setInk(null); /* an unreadable file is still shown, just untrimmed */ }
  };
  // A picture already in the browser's cache can finish before this component is ready to hear about it.
  useEffect(() => { if (image.current?.complete) measure(); }, [project.titleImage]);
  if (!project.titleImage) return null;
  const { zoom, x, y } = adjustOf(project, "titleImage");
  const placed: CSSProperties = ink
    ? { position: "absolute", maxWidth: "none", width: `${100 / ink.w}%`, height: `${100 / ink.h}%`, left: `${-ink.x / ink.w * 100}%`, top: `${-ink.y / ink.h * 100}%` }
    : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" };
  return <span className={className} data-project-title-art style={{ "--ink-aspect": ink?.aspect ?? 2.4 } as CSSProperties}>
    <span style={{ position: "absolute", inset: 0, transform: `translate(${x - 50}%, ${y - 50}%) scale(${zoom})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- it is measured on a canvas, and the card's label already names the title */}
      <img ref={image} src={resizedSrc(project.titleImage, 768)} alt="" draggable={false} decoding="async" onLoad={measure} style={placed} />
    </span>
  </span>;
}

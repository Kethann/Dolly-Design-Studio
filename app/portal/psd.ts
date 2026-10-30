// Reads a Photoshop file (PSD) in the browser and turns each of its pixel layers into a PNG the size of the whole canvas,
// so they stack exactly as they did in Photoshop. It runs here, not on the server: the file never has to fit in the
// server's memory, and it works the same on Cloudflare.
import type { Layer } from "ag-psd";
import { assertPsdBounds, MAX_PSD_MB } from "./psd-budget";

/** The longest side a layer picture is kept at (the same cap the image upload uses). */
const MAX_SIDE = 3200;

export interface PsdLayerInfo {
  name: string;
  /** Draws this layer, at its place on the full canvas, onto a fresh canvas. */
  draw: () => HTMLCanvasElement;
}

export interface PsdRead {
  width: number;
  height: number;
  /** Bottom first, like the breakdown's own list. */
  layers: PsdLayerInfo[];
  /** Layers left out because they are hidden or hold no pixels (groups, adjustments, empty layers). */
  skipped: number;
  /** Release raw layer buffers after success, cancellation or a failed upload. */
  dispose: () => void;
}

const blank = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Opens a .psd and lists its visible pixel layers, bottom to top (groups are opened up; hidden ones are skipped). */
export async function readPsdLayers(file: File): Promise<PsdRead> {
  if (file.size > MAX_PSD_MB * 1024 * 1024) throw new Error(`Photoshop imports are limited to ${MAX_PSD_MB} MB. Export a smaller file or upload the layers as PNG images.`);
  const { readPsd, getLayerCanvas } = await import("ag-psd");
  let psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { useRawData: true, skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  } catch {
    throw new Error("This Photoshop file couldn’t be read. Save it again from Photoshop (File → Save As → Photoshop, with “Maximize compatibility” on) and try once more.");
  }
  assertPsdBounds(psd.width, psd.height, psd.bitsPerChannel);
  const scale = Math.min(1, MAX_SIDE / Math.max(psd.width, psd.height));
  const w = Math.max(1, Math.round(psd.width * scale));
  const h = Math.max(1, Math.round(psd.height * scale));

  const layers: PsdLayerInfo[] = [];
  let skipped = 0;
  const sources: Layer[] = [];
  let count = 0;
  const walk = (list: Layer[] | undefined, parentHidden: boolean) => {
    for (const layer of list ?? []) {
      if (++count > 512) throw new Error("This Photoshop file has too many layers to import safely. Export a copy with fewer than 512 layers.");
      const hidden = parentHidden || !!layer.hidden;
      if (layer.children) {
        walk(layer.children, hidden);
        continue;
      }
      const width = (layer.right ?? 0) - (layer.left ?? 0);
      const height = (layer.bottom ?? 0) - (layer.top ?? 0);
      if (hidden || !layer.rawData || width <= 0 || height <= 0) {
        delete layer.rawData;
        skipped++;
        continue;
      }
      assertPsdBounds(width, height, layer.rawData.bitsPerChannel);
      sources.push(layer);
      layers.push({
        name: (layer.name ?? "").trim(),
        draw: () => {
          // Decode only the layer being uploaded, never all layer canvases together.
          const pixels = getLayerCanvas(layer);
          if (!pixels) throw new Error("This Photoshop layer has no readable pixels.");
          const out = blank(w, h);
          try {
            const g = out.getContext("2d");
            if (!g) throw new Error("This browser could not create the layer picture.");
            g.imageSmoothingQuality = "high";
            g.globalAlpha = typeof layer.opacity === "number" ? Math.min(1, Math.max(0, layer.opacity)) : 1;
            g.drawImage(pixels, (layer.left ?? 0) * scale, (layer.top ?? 0) * scale, pixels.width * scale, pixels.height * scale);
            return out;
          } catch (error) {
            out.width = out.height = 0;
            throw error;
          } finally {
            pixels.width = pixels.height = 0;
            delete layer.rawData;
          }
        },
      });
    }
  };
  walk(psd.children, false);
  return { width: w, height: h, layers, skipped, dispose: () => { for (const layer of sources) delete layer.rawData; } };
}

/** A canvas as a PNG file. */
export async function canvasToPng(canvas: HTMLCanvasElement, name: string): Promise<File> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("This browser couldn’t make a picture from a layer.");
    return new File([blob], name, { type: "image/png" });
  } finally {
    canvas.width = canvas.height = 0;
  }
}

// Reads a Photoshop file (PSD) in the browser and turns each of its pixel layers into a PNG the size of the whole canvas,
// so they stack exactly as they did in Photoshop. It runs here, not on the server: the file never has to fit in the
// server's memory, and it works the same on Cloudflare.
import type { Layer } from "ag-psd";

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
}

const blank = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** Opens a .psd and lists its visible pixel layers, bottom to top (groups are opened up; hidden ones are skipped). */
export async function readPsdLayers(file: File): Promise<PsdRead> {
  const { readPsd } = await import("ag-psd");
  let psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  } catch {
    throw new Error("This Photoshop file couldn’t be read. Save it again from Photoshop (File → Save As → Photoshop, with “Maximize compatibility” on) and try once more.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(psd.width, psd.height));
  const w = Math.max(1, Math.round(psd.width * scale));
  const h = Math.max(1, Math.round(psd.height * scale));

  const layers: PsdLayerInfo[] = [];
  let skipped = 0;
  const walk = (list: Layer[] | undefined, parentHidden: boolean) => {
    for (const layer of list ?? []) {
      const hidden = parentHidden || !!layer.hidden;
      if (layer.children) {
        walk(layer.children, hidden);
        continue;
      }
      const pixels = layer.canvas;
      if (hidden || !pixels || !pixels.width || !pixels.height) {
        skipped++;
        continue;
      }
      layers.push({
        name: (layer.name ?? "").trim(),
        draw: () => {
          const out = blank(w, h);
          const g = out.getContext("2d");
          if (g) {
            g.imageSmoothingQuality = "high";
            g.globalAlpha = typeof layer.opacity === "number" ? Math.min(1, Math.max(0, layer.opacity)) : 1;
            g.drawImage(pixels, (layer.left ?? 0) * scale, (layer.top ?? 0) * scale, pixels.width * scale, pixels.height * scale);
          }
          return out;
        },
      });
    }
  };
  walk(psd.children, false);
  return { width: w, height: h, layers, skipped };
}

/** A canvas as a PNG file. */
export async function canvasToPng(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = canvas.height = 0; // let go of the memory right away; a big file has many layers
  if (!blob) throw new Error("This browser couldn’t make a picture from a layer.");
  return new File([blob], name, { type: "image/png" });
}

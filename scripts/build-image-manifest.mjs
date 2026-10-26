// Scans /public/images for photos and writes content/generated/image-manifest.json
// with each file's width, height, a tiny blurred placeholder, and a short hash
// of its contents. Run after adding or replacing images:  npm run images
//
// Runs automatically before every `npm run build` (see package.json's
// "prebuild" script) — it's optional in dev, since dev serves images straight
// from disk, but still useful there for the blur-up placeholder.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = path.join(root, "public", "images");
const outFile = path.join(root, "content", "generated", "image-manifest.json");
const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]); // raster only — the SVG logo needs no blur-up

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  );
  return files.flat();
}

const files = (await walk(imagesDir)).filter((f) => exts.has(path.extname(f).toLowerCase())).sort();
const manifest = {};

for (const file of files) {
  const bytes = await readFile(file);
  const img = sharp(bytes);
  const { width, height } = await img.metadata();
  const blur = await img
    .clone()
    .resize(16, 16, { fit: "inside" })
    .blur(1)
    .jpeg({ quality: 50 })
    .toBuffer();
  const src = "/" + path.relative(path.join(root, "public"), file).split(path.sep).join("/");
  // A short hash of the file's own bytes: it changes only when you replace the
  // image, so the site can cache images for a long time without ever showing
  // a stale one — see lib/images.ts (versionedSrc).
  const version = createHash("sha1").update(bytes).digest("hex").slice(0, 10);
  manifest[src] = { width, height, blur: `data:image/jpeg;base64,${blur.toString("base64")}`, version };
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`image manifest: ${files.length} images -> content/generated/image-manifest.json`);

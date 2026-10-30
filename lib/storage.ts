// Server-only: where the portal keeps what it saves — the site's content and design settings, accounts, codes, the
// activity log, and uploaded pictures and fonts.
//
// Two places, chosen automatically:
//   • On your own computer (and any server with a normal disk): plain files, in the same folders as always
//     (content/, .data/, public/…), so nothing changes while you develop.
//   • On Cloudflare: an R2 bucket (the binding named PORTAL_BUCKET in wrangler.jsonc), because a Cloudflare Worker has
//     no disk to write to.
//
// Everything is addressed by a "key" like "data/portal-users.json" or "uploads/images/logo-3fa2c1.webp".
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { uploadImageQuality } from "./image-quality";

export interface Store {
  readonly kind: "fs" | "r2";
  getText(key: string): Promise<string | null>;
  putText(key: string, text: string, contentType?: string): Promise<void>;
  getBytes(key: string): Promise<{ bytes: Uint8Array; contentType?: string } | null>;
  /** The same file as a stream, without copying it into the Worker's memory first (R2 only; costs the Worker almost no work). */
  getStream?(key: string, range?: { offset: number; length: number }): Promise<{ body: ReadableStream<Uint8Array>; contentType?: string } | null>;
  size(key: string): Promise<number | null>;
  putBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  /** Copy into a recovery archive without buffering the whole file in the Worker. */
  copy(key: string, destination: string): Promise<void>;
  /** Every key that starts with the prefix, in alphabetical order. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** Total bytes of everything the portal has saved (content, accounts, enquiries, uploaded pictures and fonts). */
  usedBytes(): Promise<number>;
  /** Every saved file and its size in bytes (content, accounts, enquiries, uploaded pictures and fonts). */
  sizes(): Promise<{ key: string; size: number }[]>;
}

// ── plain files ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Where each kind of key lives on disk (relative to the project folder). */
const DISK_FOLDERS: [string, string[]][] = [
  ["data/", [".data"]],
  ["content/", ["content"]],
  ["uploads/images/", ["public", "images", "uploads"]],
  ["uploads/fonts/", ["public", "fonts", "uploads"]],
  ["uploads/videos/", [".media", "videos"]],
  ["uploads/proof/", ["public", "images", "proof-table"]],
  ["uploads/textures/", ["public", "images", "textures"]],
];

function diskPath(key: string): string {
  for (const [prefix, dir] of DISK_FOLDERS) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.split("/").some((part) => part === ".." || part === "." || part.includes("\\"))) break;
    return path.join(/*turbopackIgnore: true*/ process.cwd(), ...dir, rest);
  }
  throw new Error(`Unknown storage key: ${key}`);
}

const files: Store = {
  kind: "fs",
  async size(key) {
    // Mutable storage is read at runtime, not copied into the server bundle.
    try { const info = await stat(/*turbopackIgnore: true*/ diskPath(key)); return info.isFile() ? info.size : null; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return null; }
  },
  async getStream(key, range) {
    if (await files.size(key) === null) return null;
    const stream = createReadStream(/*turbopackIgnore: true*/ diskPath(key), range ? { start: range.offset, end: range.offset + range.length - 1 } : undefined);
    return { body: Readable.toWeb(stream) as ReadableStream<Uint8Array> };
  },
  async getText(key) {
    try {
      return await readFile(/*turbopackIgnore: true*/ diskPath(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  },
  async putText(key, text) {
    await files.putBytes(key, new TextEncoder().encode(text));
  },
  async getBytes(key) {
    try {
      return { bytes: new Uint8Array(await readFile(/*turbopackIgnore: true*/ diskPath(key))) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  },
  async putBytes(key, bytes) {
    const file = diskPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Written to a temporary file first, then renamed, so a crash never leaves a half-written file.
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, file);
  },
  async copy(key, destination) {
    const target = diskPath(destination);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(diskPath(key), target);
  },
  async list(prefix) {
    try {
      const names = await readdir(path.dirname(diskPath(`${prefix}x`)), { withFileTypes: true });
      const base = prefix.slice(0, prefix.lastIndexOf("/") + 1);
      const stem = prefix.slice(base.length);
      return names
        .filter((e) => e.isFile() && !e.name.endsWith(".tmp") && e.name.startsWith(stem))
        .map((e) => base + e.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return [];
    }
  },
  async remove(key) {
    await unlink(diskPath(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
  async usedBytes() {
    return (await files.sizes()).reduce((n, f) => n + f.size, 0);
  },
  async sizes() {
    const out: { key: string; size: number }[] = [];
    const walk = async (dir: string, rel: string, topOnly: boolean) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.isDirectory()) {
          if (!topOnly) await walk(path.join(dir, e.name), `${rel}${e.name}/`, false);
        } else if (e.isFile() && !e.name.endsWith(".tmp") && (!topOnly || e.name.endsWith(".json"))) {
          out.push({ key: rel + e.name, size: (await stat(path.join(dir, e.name)).catch(() => null))?.size ?? 0 });
        }
      }
    };
    // The "content" folder also holds the site's own source files; only the saved settings in it count.
    for (const [prefix, dir] of DISK_FOLDERS) await walk(path.join(/*turbopackIgnore: true*/ process.cwd(), ...dir), prefix, prefix === "content/");
    return out;
  },
};

// ── Cloudflare R2 ───────────────────────────────────────────────────────────────────────────────────────────────

/** The parts of an R2 bucket this file uses. */
interface R2Bucket {
  get(key: string, options?: { range: { offset: number; length: number } }): Promise<{ etag: string; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string } } | null>;
  head(key: string): Promise<{ size: number } | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string | ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string }; onlyIf?: Headers }): Promise<unknown | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size?: number }[]; truncated: boolean; cursor?: string }>;
}

function r2(bucket: R2Bucket): Store {
  return {
    kind: "r2",
    async size(key) { return (await bucket.head(key))?.size ?? null; },
    async getText(key) {
      return (await bucket.get(key))?.text() ?? null;
    },
    async putText(key, text, contentType = "application/json") {
      await bucket.put(key, text, { httpMetadata: { contentType } });
    },
    async getBytes(key) {
      const obj = await bucket.get(key);
      return obj ? { bytes: new Uint8Array(await obj.arrayBuffer()), contentType: obj.httpMetadata?.contentType } : null;
    },
    async getStream(key, range) {
      const obj = await bucket.get(key, range ? { range } : undefined);
      return obj ? { body: obj.body, contentType: obj.httpMetadata?.contentType } : null;
    },
    async putBytes(key, bytes, contentType) {
      await bucket.put(key, bytes, contentType ? { httpMetadata: { contentType } } : undefined);
    },
    async copy(key, destination) {
      const obj = await bucket.get(key);
      if (!obj) throw new Error(`Cannot archive missing file: ${key}`);
      await bucket.put(destination, obj.body, { httpMetadata: obj.httpMetadata });
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor, limit: 1000 });
        keys.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor && keys.length < 20000);
      return keys.sort();
    },
    async remove(key) {
      await bucket.delete(key);
    },
    async usedBytes() {
      return (await this.sizes()).reduce((n, f) => n + f.size, 0);
    },
    async sizes() {
      const out: { key: string; size: number }[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ cursor, limit: 1000 });
        for (const o of page.objects) out.push({ key: o.key, size: o.size ?? 0 });
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor && out.length < 50000);
      return out;
    },
  };
}

/** The R2 bucket, when running on Cloudflare (the OpenNext adapter keeps the Worker's bindings under this global). */
function cloudflareBucket(): R2Bucket | null {
  const context = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as { env?: Record<string, unknown> } | undefined;
  return (context?.env?.PORTAL_BUCKET as R2Bucket | undefined) ?? null;
}

/** The Worker's Images binding (resizes pictures), when running on Cloudflare. */
interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; fit: string }): { output(options: { format: string; quality: number }): Promise<{ image(): ReadableStream<Uint8Array>; contentType(): string }> };
  };
}
function cloudflareImages(): ImagesBinding | null {
  const context = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as { env?: Record<string, unknown> } | undefined;
  return (context?.env?.IMAGES as ImagesBinding | undefined) ?? null;
}

/** Where things are saved right now. */
export async function store(): Promise<Store> {
  const bucket = cloudflareBucket();
  return bucket ? r2(bucket) : files;
}

/** True when the site runs on Cloudflare (pages must be built from fresh data on every visit there). */
export const onCloudflare = () => process.env.DEPLOY_TARGET === "cloudflare";

// ── small helpers ───────────────────────────────────────────────────────────────────────────────────────────────

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const text = await (await store()).getText(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown, pretty = false): Promise<void> {
  await (await store()).putText(key, JSON.stringify(value, null, pretty ? 2 : undefined) + "\n", "application/json");
}

type JsonChange<T, R> = { value?: T; result: R };
const atomicRuntime = globalThis as typeof globalThis & { __ddsJsonWrites?: Map<string, Promise<void>> };
const jsonWrites = atomicRuntime.__ddsJsonWrites ??= new Map<string, Promise<void>>();

/** Conditional R2 writes serialize changes across Workers; the local server queues changes per document. */
export async function updateJsonAtomically<T, R>(key: string, initial: T, change: (current: T) => JsonChange<T, R>): Promise<R> {
  const bucket = cloudflareBucket();
  if (bucket) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const obj = await bucket.get(key);
      const next = change(obj ? JSON.parse(await obj.text()) as T : structuredClone(initial));
      if (next.value === undefined) return next.result;
      const onlyIf = new Headers(obj ? { "If-Match": JSON.stringify(obj.etag) } : { "If-None-Match": "*" });
      const written = await bucket.put(key, JSON.stringify(next.value) + "\n", { onlyIf, httpMetadata: { contentType: "application/json" } });
      if (written !== null) return next.result;
      // Another Worker won. Re-read before checking or changing the code again.
      await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 30));
    }
    throw new Error("Verification storage is busy. Please try again.");
  }
  const previous = jsonWrites.get(key) ?? Promise.resolve();
  let unlock!: () => void;
  const turn = new Promise<void>(resolve => { unlock = resolve; });
  const tail = previous.then(() => turn);
  jsonWrites.set(key, tail);
  await previous;
  try {
    const text = await files.getText(key);
    const next = change(text === null ? structuredClone(initial) : JSON.parse(text) as T);
    if (next.value !== undefined) await files.putText(key, JSON.stringify(next.value) + "\n");
    return next.result;
  } finally {
    unlock();
    if (jsonWrites.get(key) === tail) jsonWrites.delete(key);
  }
}

/** How many earlier versions of each saved document are kept. */
const BACKUPS_KEPT = 20;

/**
 * Saves a document, first keeping the version it replaces (data/backups/<name>/<time>.json, the newest 20), so a wrong
 * save, a bad edit or a damaged file can always be undone by copying an earlier version back. A backup that cannot be
 * made never stops the save itself.
 */
export async function writeJsonSafely(key: string, value: unknown, backupName: string): Promise<void> {
  const s = await store();
  const next = JSON.stringify(value, null, 2) + "\n";
  try {
    const current = await s.getText(key);
    if (current && current !== next) {
      const folder = `data/backups/${backupName}/`;
      await s.putText(`${folder}${new Date().toISOString().replace(/[:.]/g, "-")}.json`, current, "application/json");
      const all = await s.list(folder);
      for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) await s.remove(old);
    }
  } catch (err) {
    console.error("[storage] could not keep a backup of", key, err);
  }
  await s.putText(key, next, "application/json");
}

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

export const contentTypeOf = (name: string) => CONTENT_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Serves one stored upload with long-lived caching (every upload's name carries a fingerprint of its bytes). */
export async function serveUpload(prefix: string, name: string, width?: number, quality?: number): Promise<Response> {
  if (!/^[\w.-]{1,120}\.(webp|png|jpe?g|avif|gif|svg|ttf|otf|woff2?)$/i.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  const kept = { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
  const s = await store();
  // A smaller copy was asked for (?w=): on Cloudflare it is made there, so the visitor's device never has to load and hold the
  // full-size picture. Each size is made once and kept (the Worker's own cache), so a busy page costs the Worker next to nothing.
  const images = width && /\.(webp|png|jpe?g|avif)$/i.test(name) ? cloudflareImages() : null;
  if (images && width && s.getStream) {
    const w = Math.min(3840, Math.max(16, Math.round(width)));
    const q = uploadImageQuality(quality);
    const cache = (globalThis as { caches?: { default?: { match(r: Request): Promise<Response | undefined>; put(r: Request, v: Response): Promise<void> } } }).caches?.default;
    const cacheKey = new Request(`https://resized.invalid/${prefix}${name}?w=${w}&q=${q}`);
    try {
      const hit = await cache?.match(cacheKey);
      if (hit) return hit;
    } catch {}
    try {
      const src = await s.getStream(prefix + name);
      if (!src) return new Response("Not found", { status: 404 });
      const out = await images.input(src.body).transform({ width: w, fit: "scale-down" }).output({ format: "image/webp", quality: q });
      const res = new Response(out.image(), { headers: { "Content-Type": out.contentType(), ...kept } });
      if (cache) {
        const copy = res.clone();
        const keep = cache.put(cacheKey, copy).catch(() => {});
        const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] as { ctx?: { waitUntil(p: Promise<unknown>): void } } | undefined;
        if (ctx?.ctx) ctx.ctx.waitUntil(keep);
      }
      return res;
    } catch (err) {
      console.error("[images] could not resize", name, err);
    }
  }
  // The original, as it is: streamed straight from R2 when there (no copy made in the Worker).
  const lowerSvg = name.toLowerCase().endsWith(".svg");
  const extra: Record<string, string> = lowerSvg ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {};
  if (s.getStream) {
    const src = await s.getStream(prefix + name);
    if (!src) return new Response("Not found", { status: 404 });
    return new Response(src.body, { headers: { "Content-Type": src.contentType ?? contentTypeOf(name), ...kept, ...extra } });
  }
  const found = await s.getBytes(prefix + name);
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(found.bytes as BodyInit, {
    headers: {
      "Content-Type": found.contentType ?? contentTypeOf(name),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // An SVG opened by itself may not run anything, whatever it contains.
      ...(name.toLowerCase().endsWith(".svg") ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}

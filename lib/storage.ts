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
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Store {
  readonly kind: "fs" | "r2";
  getText(key: string): Promise<string | null>;
  putText(key: string, text: string, contentType?: string): Promise<void>;
  getBytes(key: string): Promise<{ bytes: Uint8Array; contentType?: string } | null>;
  putBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<void>;
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
  async getText(key) {
    try {
      return await readFile(diskPath(key), "utf8");
    } catch {
      return null;
    }
  },
  async putText(key, text) {
    await files.putBytes(key, new TextEncoder().encode(text));
  },
  async getBytes(key) {
    try {
      return { bytes: new Uint8Array(await readFile(diskPath(key))) };
    } catch {
      return null;
    }
  },
  async putBytes(key, bytes) {
    const file = diskPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Written to a temporary file first, then renamed, so a crash never leaves a half-written file.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, file);
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
    } catch {
      return [];
    }
  },
  async remove(key) {
    await unlink(diskPath(key)).catch(() => {});
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
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size?: number }[]; truncated: boolean; cursor?: string }>;
}

function r2(bucket: R2Bucket): Store {
  return {
    kind: "r2",
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
    async putBytes(key, bytes, contentType) {
      await bucket.put(key, bytes, contentType ? { httpMetadata: { contentType } } : undefined);
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
export async function serveUpload(prefix: string, name: string): Promise<Response> {
  if (!/^[\w.-]{1,120}\.(webp|png|jpe?g|avif|gif|svg|ttf|otf|woff2?)$/i.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  const found = await (await store()).getBytes(prefix + name);
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

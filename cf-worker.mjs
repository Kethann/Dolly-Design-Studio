// The Worker's front door. It serves prerendered public/portal HTML from Static Assets,
// streams published JSON and uploaded media directly from R2, and sends remaining
// API/dynamic requests to OpenNext. That keeps common visits below the Free-tier CPU
// budget. Pictures are never resized here: smaller copies are made ahead of time and kept
// in R2 (lib/image-sizes.ts). The legacy HTML cache below covers routes not yet available as static shells.
// A cached copy is only ever reused while nothing it was built from has changed:
//   • the saved content and the saved design settings (their R2 "etag" changes with every publish)
//   • the deployed version of the site (so an old page never points at files from an older build)
// The portal, APIs and uploads are never kept in this HTML cache.
import worker from "./.open-next/worker.js";
import { imageSizeKey, imageSizeWidth } from "./lib/image-sizes.ts";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const CONTENT_KEYS = ["content/site-content.json", "content/intro-settings.json"];
const SKIP = /^\/(portal|api|_next|images|fonts|media|cdn-cgi)(\/|$)|\.[a-z0-9]{2,5}$/i;
/** Copies are kept this long at most (a changed version makes a new copy anyway; this only clears out old ones). */
const KEEP_SECONDS = 600;
const PUBLIC_DOCUMENTS = {
  "/api/public/content": "content/site-content.json",
  "/api/public/settings": "content/intro-settings.json",
};

async function publicDocument(request, bucket, key) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  if (!bucket) return new Response("Not found", { status: 404 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
    ETag: `"${object.etag}"`,
  };
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function staticPage(request, env, url) {
  if (!env.ASSETS || (request.method !== "GET" && request.method !== "HEAD")) return null;
  if (!wantsPage(request)) return null;
  const path = url.pathname;
  if (!(path === "/" || path === "/work" || path === "/breakdowns" || path === "/portal" || /^\/(?:work|process)\/[a-z0-9-]+$/.test(path))) return null;
  const assetUrl = new URL(url);
  assetUrl.pathname = `/__static-pages/${path === "/" ? "index" : path.slice(1)}.html`;
  assetUrl.search = "";
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  if (!asset.ok) return null; // A newly added project may not exist in this build.
  return shellResponse(request, asset, path === "/portal" ? "no-store" : "no-cache", 200, path === "/portal");
}

/** A browser page load, or anything else asking for the page itself (link previews and tools send a wildcard Accept). */
function wantsPage(request) {
  if (request.headers.get("rsc") || request.headers.get("next-action")) return false;
  const accept = request.headers.get("accept") || "*/*";
  return accept.includes("text/html") || accept.includes("*/*");
}

function shellResponse(request, asset, cacheControl, status, isPortal = false) {
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", cacheControl);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
  headers.set("x-page-cache", "static");
  if (isPortal) headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(request.method === "HEAD" ? null : asset.body, { status, headers });
}

/** Addresses Next still answers without a saved page: the redirects in next.config.ts and generated files. */
// (Not /icon, /apple-icon, /opengraph-image, /twitter-image or /manifest: this site has none of those, and Next spent 50-580 ms of
// CPU, far over the Free plan's 10 ms, to say so to the bots that ask. Nor /process/<page>: see below.)
const NEXT_ANSWERS = /^\/(home|index|projects|gallery|works|portfolio|breakdown|about|agency|founder|clients|process|services|contact|contact-us)$/;

/** The saved "not found" page for an address no page can answer, so a mistyped link never has to start Next. */
async function missingPage(request, env, url) {
  if (!env.ASSETS || (request.method !== "GET" && request.method !== "HEAD") || !wantsPage(request)) return null;
  const path = url.pathname;
  if (SKIP.test(path) || path.endsWith("/") || NEXT_ANSWERS.test(path)) return null;
  const page = /^\/(?:work|process)\/([a-z0-9-]+)$/.exec(path);
  if (page) {
    // A project (or process page) added since this build has no saved page yet, so it is still real: Next draws it. Anything
    // else gets the saved "not found" at once (asked of Next, an unknown process page crashed it, after 100-200 ms of CPU).
    // The saved content is written spaced ("slug": "name"), so the match allows for either spacing.
    const content = await env.PORTAL_BUCKET?.get("content/site-content.json");
    if (!content || new RegExp('"slug"\\s*:\\s*"' + page[1] + '"').test(await content.text())) return null;
  }
  const assetUrl = new URL(url);
  assetUrl.pathname = "/__static-pages/404.html";
  assetUrl.search = "";
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  return asset.ok ? shellResponse(request, asset, "no-cache", 404) : null;
}

const UPLOAD_ROUTES = [
  ["/images/uploads/", "uploads/images/"],
  ["/images/proof-table/", "uploads/proof/"],
  ["/images/textures/", "uploads/textures/"],
  ["/fonts/uploads/", "uploads/fonts/"],
];
const MEDIA_TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml", ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };

async function uploadedAsset(request, env, url) {
  const route = UPLOAD_ROUTES.find(([pathname]) => url.pathname.startsWith(pathname));
  if (!route) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const name = url.pathname.slice(route[0].length);
  if (!/^[\w.-]{1,120}\.(webp|png|jpe?g|avif|gif|svg|ttf|otf|woff2?)$/i.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  if (!env.PORTAL_BUCKET) return new Response("Not found", { status: 404 });
  const extension = name.split(".").pop().toLowerCase();
  const headers = { "Content-Type": MEDIA_TYPES[extension], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
  if (extension === "svg") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  const key = `${route[1]}${name}`;
  const requested = Number(url.searchParams.get("w"));
  const width = request.method === "GET" && requested > 0 && /^(webp|png|jpe?g|avif)$/.test(extension) ? imageSizeWidth(requested) : null;
  if (width) {
    // The kept copy when there is one; otherwise the original, which is heavier but never fails.
    const copy = await env.PORTAL_BUCKET.get(imageSizeKey(key, width));
    if (copy) return new Response(copy.body, { headers: { ...headers, "Content-Type": "image/webp" } });
  }
  const original = await env.PORTAL_BUCKET.get(key);
  if (!original) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : original.body, { headers });
}

/** The etags of what the pages are built from, remembered for a moment inside this Worker so a burst of visits reads R2 once. */
let seen = { at: 0, tag: "" };

async function contentTag(env) {
  if (Date.now() - seen.at < 1500) return seen.tag;
  const bucket = env.PORTAL_BUCKET;
  if (!bucket) return "";
  const heads = await Promise.all(CONTENT_KEYS.map((k) => bucket.head(k)));
  const tag = heads.map((h) => (h ? h.etag : "none")).join("|");
  seen = { at: Date.now(), tag };
  return tag;
}

/** Search engines' files: built by Next (40-120 ms of CPU each time), so kept like the pages until the content changes. */
const KEPT_FILES = /^\/(sitemap\.xml|robots\.txt)$/;

function cacheable(request, url) {
  if (request.method !== "GET") return false;
  if (!url.search && KEPT_FILES.test(url.pathname)) return !/dds_portal/.test(request.headers.get("cookie") || "");
  if (url.search || SKIP.test(url.pathname)) return false;
  if (request.headers.get("rsc") || request.headers.get("next-router-prefetch") || request.headers.get("next-action")) return false;
  if (!(request.headers.get("accept") || "").includes("text/html")) return false;
  // Someone signed in to the portal sees the page as it is for them: never from a shared copy.
  if (/dds_portal/.test(request.headers.get("cookie") || "")) return false;
  return true;
}

/**
 * Once per deploy on every device: the first page a browser loads after a new version goes live also tells it to drop
 * whatever it has stored for this site ("Clear-Site-Data: cache"), so nothing from an older build can linger anywhere. A
 * small cookie remembers which version the browser has had that for, so it happens once, not on every visit. Stored
 * pictures are fetched again once after a deploy; logins, saved settings and the portal are never touched.
 */
const VERSION_COOKIE = "dds_v";

function markVersion(request, env, response) {
  const version = env.CF_VERSION?.id;
  const path = new URL(request.url).pathname;
  if (!version || request.method !== "GET" || /^\/(portal|api)(\/|$)/.test(path)) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  const seen = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${VERSION_COOKIE}=`))?.slice(VERSION_COOKIE.length + 1);
  if (seen === version) return response;
  const out = new Response(response.body, response);
  out.headers.set("Clear-Site-Data", '"cache"');
  out.headers.append("Set-Cookie", `${VERSION_COOKIE}=${version}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
  out.headers.set("Cache-Control", "no-store"); // this answer is for this browser alone (it carries its cookie)
  return out;
}

const cachedWorker = {
  async scheduled(_event, env, ctx) {
    if (!env.VISITORS_DB) return;
    // Daily expiry, including opt-out tombstones. No scan or loading visitor records into Worker memory.
    ctx.waitUntil(env.VISITORS_DB.prepare("DELETE FROM visitor_sessions WHERE first_seen < ?").bind(Date.now() - 30 * 86400000).run());
    ctx.waitUntil(env.VISITORS_DB.prepare("DELETE FROM visitor_geo_usage WHERE month < ?").bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 7)).run());
  },
  async fetch(request, env, ctx) {
    return markVersion(request, env, await serve(request, env, ctx));
  },
};

async function serve(request, env, ctx) {
  {
    // Next prefetches every link in view, and each one would start its whole server. Declining is safe: a click still loads the page.
    if (request.headers.get("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    const incomingUrl = new URL(request.url);
    const publicKey = PUBLIC_DOCUMENTS[incomingUrl.pathname];
    if (publicKey) return publicDocument(request, env.PORTAL_BUCKET, publicKey);
    // Visitor counting is off until its database is set up (see VISITORS.md). Every page asks whether it is on; Next took ~9 ms
    // of CPU to say no, so the answer is given here. Once the database is set up, Next answers (and counts) as before.
    if (incomingUrl.pathname === "/api/visits" && request.method === "GET" && !env.VISITORS_DB) {
      return new Response(JSON.stringify({ enabled: false }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    const upload = await uploadedAsset(request, env, incomingUrl);
    if (upload) return upload;
    const shell = await staticPage(request, env, incomingUrl);
    if (shell) return shell;
    const missing = await missingPage(request, env, incomingUrl);
    if (missing) return missing;
    let key = null;
    let cache = null;
    try {
      const url = new URL(request.url);
      cache = typeof caches !== "undefined" ? caches.default : null;
      if (cache && cacheable(request, url)) {
        const tag = await contentTag(env);
        const version = env.CF_VERSION?.id ?? "";
        if (tag && version) {
          const host = request.headers.get("x-forwarded-host") || url.host;
          key = new Request(`https://pages.invalid/${encodeURIComponent(version)}/${encodeURIComponent(tag)}/${host}${url.pathname}`);
          const hit = await cache.match(key);
          if (hit) {
            const headers = new Headers(hit.headers);
            headers.set("Cache-Control", "no-cache"); // the browser checks back each time (cheap now), so a publish is never missed
            headers.set("x-page-cache", "hit");
            return new Response(hit.body, { status: hit.status, headers });
          }
        }
      }
    } catch {
      key = null;
    }

    const response = await worker.fetch(request, env, ctx);

    try {
      if (key && cache && response.status === 200 && !response.headers.get("set-cookie") && ((response.headers.get("content-type") || "").includes("text/html") || KEPT_FILES.test(incomingUrl.pathname))) {
        const copy = new Response(response.clone().body, response);
        copy.headers.set("Cache-Control", `public, max-age=${KEEP_SECONDS}`);
        ctx.waitUntil(cache.put(key, copy).catch(() => {}));
        const out = new Response(response.body, response);
        out.headers.set("x-page-cache", "miss");
        return out;
      }
    } catch {}
    return response;
  }
}

export default cachedWorker;

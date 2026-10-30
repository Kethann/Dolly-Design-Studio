// The Worker's front door. It wraps the site (built by OpenNext into .open-next/worker.js) with one job: keep a finished copy
// of each public page, so a visit does not have to build the whole page again (that building is what used up the Worker's
// processing allowance and its memory). A copy is only ever reused while nothing it was built from has changed:
//   • the saved content and the saved design settings (their R2 "etag" changes with every publish)
//   • the deployed version of the site (so an old page never points at files from an older build)
// so a publish shows on the very next visit, exactly as before. The portal, the API, pictures and anything with a
// session cookie are never kept. If anything here fails, the request simply goes to the site as if this file did not exist.
import worker from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const CONTENT_KEYS = ["content/site-content.json", "content/intro-settings.json"];
const SKIP = /^\/(portal|api|_next|images|fonts|cdn-cgi)(\/|$)|\.[a-z0-9]{2,5}$/i;
/** Copies are kept this long at most (a changed version makes a new copy anyway; this only clears out old ones). */
const KEEP_SECONDS = 600;

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

function cacheable(request, url) {
  if (request.method !== "GET") return false;
  if (url.search || SKIP.test(url.pathname)) return false;
  if (request.headers.get("rsc") || request.headers.get("next-router-prefetch") || request.headers.get("next-action")) return false;
  if (!(request.headers.get("accept") || "").includes("text/html")) return false;
  // Someone signed in to the portal sees the page as it is for them: never from a shared copy.
  if (/dds_portal/.test(request.headers.get("cookie") || "")) return false;
  return true;
}

export default {
  async fetch(request, env, ctx) {
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
      if (key && cache && response.status === 200 && !response.headers.get("set-cookie") && (response.headers.get("content-type") || "").includes("text/html")) {
        const copy = new Response(response.clone().body, response);
        copy.headers.set("Cache-Control", `public, max-age=${KEEP_SECONDS}`);
        ctx.waitUntil(cache.put(key, copy).catch(() => {}));
        const out = new Response(response.body, response);
        out.headers.set("x-page-cache", "miss");
        return out;
      }
    } catch {}
    return response;
  },
};

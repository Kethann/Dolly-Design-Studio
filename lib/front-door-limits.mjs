// Rate limits at the Worker's front door (cf-worker.mjs), checked before Next is started, so a flood of requests is turned
// away for well under 1 ms of CPU each instead of every one costing Next 10-500 ms (over the Free plan's 10 ms, which is
// what makes requests fail). The counts are kept by Cloudflare's rate-limit bindings ("ratelimits" in wrangler.jsonc),
// per visitor address and shared by every copy of the Worker in a Cloudflare location, unlike the in-memory limits inside
// Next (lib/rate-limit.ts), which stay as a second line.
// Only what would reach Next is counted: plain files, saved pages, published content and uploaded pictures never are.

/** Signing in, codes, password resets and the contact form: each try costs real CPU (password hashing) or sends an email. */
const SIGN_IN = /^\/api\/(contact|portal\/(session(\/verify|\/email(\/verify)?)?|reset\/(request|confirm)|account))$/;

/** The bindings in wrangler.jsonc, with what a visitor is told when they go over. */
export const LIMITS = {
  // 10 a minute: plenty for typos, far too few for guessing passwords.
  SIGN_IN_LIMIT: "Too many attempts in a minute. Wait a minute and try again.",
  // 300 a minute: room for a big upload (each picture also sends up to six smaller copies of itself).
  PORTAL_LIMIT: "Too many requests in a minute. Wait a moment and try again.",
  // 120 a minute: pages Next draws (in-site clicks, new projects), far more than anyone reading the site asks for.
  PAGE_LIMIT: "This site is getting too many requests from your connection. Wait a minute and reload.",
};

export function limitFor(method, pathname) {
  if (method !== "GET" && method !== "HEAD" && SIGN_IN.test(pathname)) return "SIGN_IN_LIMIT";
  if (pathname.startsWith("/api/portal/")) return "PORTAL_LIMIT";
  return "PAGE_LIMIT";
}

/** The "slow down" answer when this visitor is over their limit; null to carry on. Never blocks anyone if the count can't be had. */
export async function overLimit(request, env, pathname) {
  const ip = request.headers.get("cf-connecting-ip");
  const name = limitFor(request.method, pathname);
  const limiter = env[name];
  if (!ip || !limiter) return null; // no address (local runs) or no binding: unlimited, never one bucket shared by everyone
  try {
    if ((await limiter.limit({ key: ip })).success) return null;
  } catch {
    return null;
  }
  const headers = { "Retry-After": "60", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: LIMITS[name] }), { status: 429, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  }
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slow down</title><p style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 16px">${LIMITS[name]}</p>`, {
    status: 429,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

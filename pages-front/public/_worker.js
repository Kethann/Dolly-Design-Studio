// A thin front for the site: the address dollydstudio.pages.dev passes every request straight to the real site
// (the "dolly-design-studio" Worker), through a service binding. See DEPLOY.md.
const ORIGIN = "https://dolly-design-studio.dollydesignstudios.workers.dev";
// The site's first address. Page visits there move to the new one for good (links and bookmarks keep working); anything
// else (an API call, a portal tab saving its work) is still answered there, so nothing open at the old address breaks.
const OLD_HOST = "dollydesignstudio.pages.dev";
const NEW_ORIGIN = "https://dollydstudio.pages.dev";

const frontWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.host === OLD_HOST && (request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 301, headers: { location: NEW_ORIGIN + url.pathname + url.search, "cache-control": "public, max-age=3600" } });
    }
    const target = new URL(url.pathname + url.search, ORIGIN);

    // The real site is told it is being visited at this address, so its own checks (the portal's sign-in and saves compare
    // the page's address with the request's) and the addresses it writes into pages all agree with what the visitor sees.
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await env.WEB.fetch(
      new Request(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: "manual", duplex: "half", cf: request.cf }),
    );

    // Keep visitors on this address when the site redirects. Everything else is handed back untouched (no copy of the body is made
    // here, so pictures of any size pass through at almost no cost to this front, which has only a few milliseconds of work to use).
    const location = upstream.headers.get("location");
    if (!location) return upstream;
    const out = new Headers(upstream.headers);
    out.set("location", location.split(ORIGIN).join(url.origin));
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
};

export default frontWorker;

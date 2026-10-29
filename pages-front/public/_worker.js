// A thin front for the site: the address dollydesignstudio.pages.dev passes every request straight to the real site
// (the "dolly-design-studio" Worker), through a service binding. See DEPLOY.md.
const ORIGIN = "https://dolly-design-studio.dollydesignstudios.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, ORIGIN);

    // The real site is told it is being visited at this address, so its own checks (the portal's sign-in and saves compare
    // the page's address with the request's) and the addresses it writes into pages all agree with what the visitor sees.
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await env.WEB.fetch(
      new Request(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: "manual", duplex: "half" }),
    );

    // Keep visitors on this address when the site redirects.
    const out = new Headers(upstream.headers);
    const location = out.get("location");
    if (location) out.set("location", location.split(ORIGIN).join(url.origin));
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
};

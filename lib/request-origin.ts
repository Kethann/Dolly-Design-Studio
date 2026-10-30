/** Match the browser's origin without confusing Next's development-only loopback normalization. */
export function requestOriginMatches(req: { headers: Headers; nextUrl: { origin: string } }): boolean {
  const origin = req.headers.get("origin");
  if (origin === req.nextUrl.origin) return true;
  if (!origin || process.env.NODE_ENV !== "development") return false;
  try {
    const browser = new URL(origin);
    const expected = new URL(req.nextUrl.origin);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return browser.origin === origin
      && !browser.username && !browser.password
      && loopback.has(browser.hostname) && loopback.has(expected.hostname)
      && browser.protocol === expected.protocol && browser.port === expected.port
      && browser.host === req.headers.get("host");
  } catch {
    return false;
  }
}

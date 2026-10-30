import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSessionToken, isPortalConfigured, sessionCookie } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { GOOGLE_COOKIE, googleConfigured, redirectUriFor } from "@/lib/portal/google";
import { findUserByEmail } from "@/lib/portal/users";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";

/**
 * Step two of "Continue with Google": Google sends the person back here with a one-time code. The code is exchanged (server to
 * server, with the site's secret and the PKCE verifier) for the person's confirmed email address; if it belongs to a portal
 * account, they are signed in.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const clear = (res: NextResponse) => {
    res.cookies.set({ name: GOOGLE_COOKIE, value: "", path: "/api/portal/google", maxAge: 0 });
    return res;
  };
  const back = (code: string) => clear(NextResponse.redirect(new URL(`/portal?google=${code}`, origin)));

  if (!googleConfigured() || !(await isPortalConfigured())) return back("off");
  const ip = clientIp(req.headers);
  if (tooManyFailures(`google:${ip}`)) return back("busy");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("cancelled");

  const [state = "", verifier = ""] = (req.cookies.get(GOOGLE_COOKIE)?.value ?? "").split(".");
  const given = Buffer.from(p.get("state") ?? "");
  const expected = Buffer.from(state);
  const code = p.get("code");
  if (!code || !state || !verifier || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    noteFailure(`google:${ip}`);
    return back("expired");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUriFor(origin),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    if (!tokenRes.ok || !token.access_token) throw new Error("token refused");
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const info = (await infoRes.json().catch(() => ({}))) as { email?: string; email_verified?: boolean };
    if (!infoRes.ok || !info.email || info.email_verified !== true) throw new Error("no confirmed email");

    const found = await findUserByEmail(info.email);
    if (!found) {
      noteFailure(`google:${ip}`);
      await logActivity({ headers: req.headers, actor: { id: "unknown", username: info.email, name: info.email }, action: "sign-in-failed", detail: "Google account not linked to a portal account", ok: false });
      return back("nouser");
    }

    await logActivity({ headers: req.headers, actor: found.user, action: "sign-in", detail: "With Google" });
    // The session cookie is SameSite=Strict, and this request arrived from google.com. A plain redirect would still count as
    // coming from there and drop the cookie, so the browser is sent on by a page of ours instead (a same-site step).
    const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/portal"><title>Signing in…</title><p style="font-family:sans-serif">Signing you in… <a href="/portal">Continue</a></p>`;
    const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    res.cookies.set(sessionCookie(createSessionToken(found.user.id, found.version)));
    return clear(res);
  } catch {
    noteFailure(`google:${ip}`);
    return back("failed");
  }
}

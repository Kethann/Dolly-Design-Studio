import { NextRequest, NextResponse } from "next/server";
import { isPortalConfigured } from "@/lib/portal/auth";
import { GOOGLE_COOKIE, challengeFor, googleConfigured, randomToken, redirectUriFor } from "@/lib/portal/google";
import { isRateLimited } from "@/lib/rate-limit";
import { clientIp } from "@/lib/portal/activity";

/** Step one of "Continue with Google": remember a one-time secret, then send the browser to Google's sign-in page. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (code: string) => NextResponse.redirect(new URL(`/portal?google=${code}`, origin));
  if (!googleConfigured() || !(await isPortalConfigured())) return back("off");
  if (isRateLimited(`google-start:${clientIp(req.headers)}`)) return back("busy");

  const state = randomToken(16);
  const verifier = randomToken(48);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUriFor(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  // Lax (not Strict): the browser comes back from google.com, and this cookie has to travel with it.
  res.cookies.set({ name: GOOGLE_COOKIE, value: `${state}.${verifier}`, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/portal/google", maxAge: 600 });
  return res;
}

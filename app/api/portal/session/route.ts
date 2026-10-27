import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { SESSION_COOKIE, createSessionToken, isPortalConfigured, sessionCookie } from "@/lib/portal/auth";
import { normalizeUsername, verifyLogin } from "@/lib/portal/users";

/** Sign in to the creator portal. */
export async function POST(req: NextRequest) {
  if (!(await isPortalConfigured())) {
    return NextResponse.json(
      { error: "The portal isn’t set up yet: add PORTAL_PASSWORD to the server’s environment." },
      { status: 503 },
    );
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username.slice(0, 64) : "";
    password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Limit attempts per address and per account, so neither guessing one password nor spraying many works.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keys = [`portal:${ip}`, `portal-user:${normalizeUsername(username)}`];
  if (keys.some(tooManyFailures)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const result = await verifyLogin(username, password);
  if (!result) {
    keys.forEach(noteFailure);
    return NextResponse.json({ error: "That username or password isn’t right." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, setup: !!result.user.setup });
  res.cookies.set(sessionCookie(createSessionToken(result.user.id, result.version)));
  return res;
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

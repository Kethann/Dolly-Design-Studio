import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  createChallengeToken,
  createSessionToken,
  getPortalUser,
  isPortalConfigured,
  sessionCookie,
} from "@/lib/portal/auth";
import { logActivity } from "@/lib/portal/activity";
import { clientIp } from "@/lib/portal/activity";
import { CODE_MINUTES, discardCode, issueCode } from "@/lib/portal/otp";
import { codeEmail, isMailConfigured, maskEmail, sendMail } from "@/lib/portal/mail";
import { normalizeUsername, verifyLogin } from "@/lib/portal/users";

/** Sign in to the creator portal: the password, and (for people who turned it on) an emailed code as a second step. */
export async function POST(req: NextRequest) {
  if (!(await isPortalConfigured())) {
    return NextResponse.json(
      { error: "The portal isn’t set up yet: add PORTAL_PASSWORD to the server’s environment." },
      { status: 503 },
    );
  }
  const origin = req.headers.get("origin");
  if (origin && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    // Account emails may be up to 120 characters, even though usernames are shorter.
    username = typeof body?.username === "string" ? body.username.trim().slice(0, 120) : "";
    password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Limit attempts per address and per account, so neither guessing one password nor spraying many works.
  const ip = clientIp(req.headers);
  const keys = [`portal:${ip}`, `portal-user:${normalizeUsername(username)}`];
  if (keys.some(tooManyFailures)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const result = await verifyLogin(username, password);
  if (!result) {
    keys.forEach(noteFailure);
    const tried = normalizeUsername(username) || "(blank)";
    await logActivity({
      headers: req.headers,
      actor: { id: "unknown", username: tried, name: tried },
      action: "sign-in-failed",
      detail: "Wrong username or password",
      ok: false,
    });
    return NextResponse.json({ error: "That username or password isn’t right." }, { status: 401 });
  }

  const user = result.user;

  // Two-step sign-in: the password was right, now an emailed code. (If the server has no email set up, the step is
  // skipped rather than locking everyone out; a failed send never lets anyone through.)
  if (user.twoFactor && user.email && !user.setup && isMailConfigured()) {
    const issued = await issueCode("login", user.id);
    let resentIn = 0;
    if ("code" in issued) {
      const sent = await sendMail({ to: user.email, ...codeEmail({ name: user.name, code: issued.code, purpose: "login", minutes: CODE_MINUTES }) });
      await logActivity({ headers: req.headers, actor: user, action: "code-sent", detail: "Sign-in code", ok: sent.ok });
      if (!sent.ok) {
        await discardCode("login", user.id, issued.code);
        return NextResponse.json({ error: "Couldn’t send your sign-in code. Try again in a moment." }, { status: 502 });
      }
    } else {
      resentIn = issued.wait; // a code was sent a moment ago: it is still good
    }
    return NextResponse.json({ needsCode: true, challenge: createChallengeToken(user.id), email: maskEmail(user.email), resentIn });
  }

  await logActivity({ headers: req.headers, actor: user, action: "sign-in", detail: user.setup ? "With the setup password" : "" });
  const res = NextResponse.json({ ok: true, setup: !!user.setup });
  res.cookies.set(sessionCookie(createSessionToken(user.id, result.version)));
  return res;
}

/** Sign out. */
export async function DELETE(req: NextRequest) {
  const me = await getPortalUser();
  if (me) await logActivity({ headers: req.headers, actor: me, action: "sign-out" });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

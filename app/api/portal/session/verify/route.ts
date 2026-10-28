import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { createSessionToken, readChallengeToken, sessionCookie } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { checkCode } from "@/lib/portal/otp";
import { getUserWithVersion } from "@/lib/portal/users";

/** The second step of signing in: the code that was emailed after the password was right. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let challenge = "";
  let code = "";
  try {
    const body = await req.json();
    challenge = typeof body?.challenge === "string" ? body.challenge.slice(0, 300) : "";
    code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const id = readChallengeToken(challenge);
  if (!id) return NextResponse.json({ error: "That sign-in took too long. Please start again.", restart: true }, { status: 401 });

  const keys = [`otp:${clientIp(req.headers)}`, `otp-user:${id}`];
  if (keys.some(tooManyFailures)) return NextResponse.json({ error: "Too many wrong codes. Try again in a few minutes." }, { status: 429 });

  const entry = await getUserWithVersion(id);
  if (!entry) return NextResponse.json({ error: "That sign-in took too long. Please start again.", restart: true }, { status: 401 });

  const result = await checkCode("login", id, code);
  if (!result.ok) {
    keys.forEach(noteFailure);
    await logActivity({ headers: req.headers, actor: entry.user, action: "code-failed", detail: "Sign-in code", ok: false });
    const message =
      result.reason === "locked"
        ? "Too many wrong tries for that code. Go back and sign in again for a new one."
        : result.reason === "expired"
          ? "That code has expired. Go back and sign in again for a new one."
          : "That code isn’t right. Check the email and try again.";
    return NextResponse.json({ error: message, restart: result.reason !== "wrong" }, { status: 401 });
  }

  await logActivity({ headers: req.headers, actor: entry.user, action: "sign-in", detail: "With an emailed code" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(createSessionToken(entry.user.id, entry.version)));
  return res;
}

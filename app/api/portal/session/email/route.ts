import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { isPortalConfigured } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { CODE_MINUTES, issueCode } from "@/lib/portal/otp";
import { codeEmail, isMailConfigured, sendMail, studioMailboxes } from "@/lib/portal/mail";
import { findUserByEmail, normalizeEmail, validateEmail } from "@/lib/portal/users";

/**
 * "Email me a sign-in code": for a person whose email is on a portal account, and for the studio's own mailbox (the Gmail
 * account this server sends from), which works even when no account exists. The answer is the same whoever asks, so it
 * can't be used to find out which addresses are known.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!(await isPortalConfigured())) return NextResponse.json({ error: "The portal isn’t set up yet." }, { status: 503 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Email isn’t set up on this server yet, so codes can’t be sent." }, { status: 503 });

  let email = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? normalizeEmail(body.email.slice(0, 120)) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!email || validateEmail(email)) return NextResponse.json({ error: "Enter the email address of your account." }, { status: 400 });

  if (isRateLimited(`mail-login:${clientIp(req.headers)}`) || isRateLimited(`mail-login-for:${email}`)) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const user = (await findUserByEmail(email))?.user;
  if (user || studioMailboxes().includes(email)) {
    const issued = await issueCode("login", `mail:${email}`);
    if ("code" in issued) {
      const name = user?.name ?? email.split("@")[0];
      const sent = await sendMail({ to: email, ...codeEmail({ name, code: issued.code, purpose: "login", minutes: CODE_MINUTES }) });
      await logActivity({ headers: req.headers, actor: user ?? { id: "unknown", username: email, name }, action: "code-sent", detail: "Sign-in code by email", ok: sent.ok });
      if (!sent.ok) return NextResponse.json({ error: "Couldn’t send the code. Try again in a moment." }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { createSessionToken, isPortalConfigured, sessionCookie } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { checkCode } from "@/lib/portal/otp";
import { studioMailboxes } from "@/lib/portal/mail";
import { ensureOwnerForMailbox, findUserByEmail, normalizeEmail } from "@/lib/portal/users";

/**
 * The second half of "Email me a sign-in code": the code that was sent. A right code signs the person in; for the studio's
 * own mailbox with no account (everyone was deleted) it makes the owner account again first. Having the mailbox is the proof.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!(await isPortalConfigured())) return NextResponse.json({ error: "The portal isn’t set up yet." }, { status: 503 });

  let email = "";
  let code = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? normalizeEmail(body.email.slice(0, 120)) : "";
    code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const keys = [`mail-code-ip:${clientIp(req.headers)}`, `mail-code:${email}`];
  if (keys.some(tooManyFailures)) return NextResponse.json({ error: "Too many wrong codes. Try again in a few minutes." }, { status: 429 });

  const result = await checkCode("login", `mail:${email}`, code);
  if (!result.ok) {
    keys.forEach(noteFailure);
    await logActivity({ headers: req.headers, actor: { id: "unknown", username: email || "(blank)", name: email || "(blank)" }, action: "code-failed", detail: "Sign-in code by email", ok: false });
    return NextResponse.json(
      { error: result.reason === "wrong" ? "That code isn’t right. Check the email and try again." : "That code has expired or been used up. Ask for a new one.", restart: result.reason !== "wrong" },
      { status: 401 },
    );
  }

  const found = (await findUserByEmail(email)) ?? (studioMailboxes().includes(email) ? await ensureOwnerForMailbox(email) : null);
  if (!found) return NextResponse.json({ error: "That code has expired or been used up. Ask for a new one.", restart: true }, { status: 401 });

  await logActivity({ headers: req.headers, actor: found.user, action: "sign-in", detail: "With an email code" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(createSessionToken(found.user.id, found.version)));
  return res;
}

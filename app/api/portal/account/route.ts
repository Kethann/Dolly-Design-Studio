import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { createSessionToken, getPortalUser, sessionCookie } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { CODE_MINUTES, checkCode, clearCodes, issueCode } from "@/lib/portal/otp";
import { codeEmail, isMailConfigured, maskEmail, sendMail } from "@/lib/portal/mail";
import {
  UserError,
  bumpVersion,
  changeUsername,
  checkOwnPassword,
  findUserByLogin,
  getUserWithVersion,
  normalizeEmail,
  setEmail,
  setTwoFactor,
  validateEmail,
} from "@/lib/portal/users";

/**
 * Everything a person can change about their own sign-in: username, email address (confirmed with a code), two-step
 * sign-in, and signing out of every device. Anything sensitive asks for the current password first.
 */
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return fail("Your session has ended. Sign in again.", 401);
  if (me.setup) return fail("Create your owner account first.", 403);
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return fail("Forbidden.", 403);

  let b: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") b = parsed;
  } catch {
    return fail("Bad request.");
  }
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const action = text(b.action, 40);

  // Sensitive changes ask for the current password; wrong guesses are limited.
  const guardKey = `own-pw:${me.id}`;
  async function passwordOk(): Promise<NextResponse | null> {
    if (tooManyFailures(guardKey) || tooManyFailures(`own-pw-ip:${clientIp(req.headers)}`)) return fail("Too many wrong passwords. Try again in a few minutes.", 429);
    if (!(await checkOwnPassword(me!.id, text(b.currentPassword, 200)))) {
      noteFailure(guardKey);
      noteFailure(`own-pw-ip:${clientIp(req.headers)}`);
      return fail("Your current password isn’t right.");
    }
    return null;
  }

  try {
    switch (action) {
      case "username": {
        const bad = await passwordOk();
        if (bad) return bad;
        const before = me.username;
        const user = await changeUsername(me.id, text(b.username, 64));
        await logActivity({ headers: req.headers, actor: user, action: "username-changed", detail: `${before} → ${user.username}` });
        return NextResponse.json({ user });
      }

      case "email-code": {
        const bad = await passwordOk();
        if (bad) return bad;
        const email = normalizeEmail(text(b.email, 120));
        const problem = validateEmail(email);
        if (problem) return fail(problem);
        const owner = await findUserByLogin(email);
        if (owner && owner.id !== me.id) return fail("Someone already uses that email address.");
        if (!isMailConfigured()) return fail("Email isn’t set up on this server yet. Add the email settings first (see “Email & codes”).", 503);
        const issued = await issueCode("email", me.id, email);
        if ("wait" in issued) return fail(`A code was just sent. You can ask for another in ${issued.wait} seconds.`, 429);
        const sent = await sendMail({ to: email, ...codeEmail({ name: me.name, code: issued.code, purpose: "email", minutes: CODE_MINUTES }) });
        await logActivity({ headers: req.headers, actor: me, action: "code-sent", detail: "Email confirmation code", ok: sent.ok });
        if (!sent.ok) return fail(sent.message, 502);
        return NextResponse.json({ ok: true, sentTo: maskEmail(email) });
      }

      case "email-verify": {
        const keys = [`otp-user:${me.id}`, `otp:${clientIp(req.headers)}`];
        if (keys.some(tooManyFailures)) return fail("Too many wrong codes. Try again in a few minutes.", 429);
        const result = await checkCode("email", me.id, text(b.code, 20));
        if (!result.ok) {
          keys.forEach(noteFailure);
          await logActivity({ headers: req.headers, actor: me, action: "code-failed", detail: "Email confirmation code", ok: false });
          return fail(
            result.reason === "wrong" ? "That code isn’t right. Check the email and try again." : "That code has expired or been used up. Ask for a new one.",
          );
        }
        const user = await setEmail(me.id, result.data ?? "");
        await logActivity({ headers: req.headers, actor: user, action: "email-changed", detail: `Now ${user.email}` });
        return NextResponse.json({ user });
      }

      case "email-remove": {
        const bad = await passwordOk();
        if (bad) return bad;
        const user = await setEmail(me.id, "");
        await clearCodes(me.id);
        await logActivity({ headers: req.headers, actor: user, action: "email-changed", detail: "Email address removed (two-step sign-in is off)" });
        return NextResponse.json({ user });
      }

      case "two-factor": {
        const bad = await passwordOk();
        if (bad) return bad;
        const enabled = b.enabled === true;
        if (enabled && !isMailConfigured()) return fail("Email isn’t set up on this server yet, so codes can’t be sent.", 503);
        const user = await setTwoFactor(me.id, enabled);
        await logActivity({ headers: req.headers, actor: user, action: "two-step", detail: enabled ? "Turned on" : "Turned off" });
        return NextResponse.json({ user });
      }

      case "sign-out-everywhere": {
        const bad = await passwordOk();
        if (bad) return bad;
        const version = await bumpVersion(me.id);
        const entry = await getUserWithVersion(me.id);
        await logActivity({ headers: req.headers, actor: me, action: "signed-out-everywhere", detail: "All other devices were signed out" });
        const res = NextResponse.json({ ok: true, user: entry?.user });
        res.cookies.set(sessionCookie(createSessionToken(me.id, version))); // this device stays signed in
        return res;
      }

      default:
        return fail("Unknown request.");
    }
  } catch (err) {
    if (err instanceof UserError) return fail(err.message);
    console.error("[portal] account change failed", err);
    return fail("Couldn’t save on this server (its files are read-only). Accounts need a writable server.", 500);
  }
}

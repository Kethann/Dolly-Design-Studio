import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { CODE_MINUTES, discardCode, issueCode } from "@/lib/portal/otp";
import { codeEmail, isMailConfigured, sendMail, studioMailboxes } from "@/lib/portal/mail";
import { findUserByLogin } from "@/lib/portal/users";

/**
 * "Forgot password": email a reset code to the address on the account. The answer is always the same whether or not
 * the username or email exists, so this can't be used to find out who has an account.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let identifier = "";
  try {
    const body = await req.json();
    identifier = typeof body?.identifier === "string" ? body.identifier.trim().slice(0, 120) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!identifier) return NextResponse.json({ error: "Enter your username or email address." }, { status: 400 });

  if (isRateLimited(`reset:${clientIp(req.headers)}`) || isRateLimited(`reset-for:${identifier.toLowerCase()}`)) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const emailEnabled = isMailConfigured();
  const user = await findUserByLogin(identifier);
  if (user && emailEnabled) {
    if (!user.email) {
      await logActivity({ headers: req.headers, actor: user, action: "code-failed", detail: "Password reset asked for, but no email address is on the account", ok: false });
    } else {
      const issued = await issueCode("reset", user.id);
      if ("code" in issued) {
        const sent = await sendMail({ to: user.email, ...codeEmail({ name: user.name, code: issued.code, purpose: "reset", minutes: CODE_MINUTES }) });
        if (!sent.ok) await discardCode("reset", user.id, issued.code);
        await logActivity({ headers: req.headers, actor: user, action: "code-sent", detail: "Password reset code", ok: sent.ok });
      }
    }
  }
  // The studio's own address works too, even if every account was deleted: the code goes to that mailbox, and choosing a
  // new password with it makes the owner account again.
  const mailbox = identifier.toLowerCase();
  if (!user && emailEnabled && studioMailboxes().includes(mailbox)) {
    const issued = await issueCode("reset", `mail:${mailbox}`);
    if ("code" in issued) {
      const name = mailbox.split("@")[0];
      const sent = await sendMail({ to: mailbox, ...codeEmail({ name, code: issued.code, purpose: "reset", minutes: CODE_MINUTES }) });
      if (!sent.ok) await discardCode("reset", `mail:${mailbox}`, issued.code);
      await logActivity({ headers: req.headers, actor: { id: "unknown", username: mailbox, name }, action: "code-sent", detail: "Password reset code (studio mailbox)", ok: sent.ok });
    }
  }
  return NextResponse.json({ ok: true, emailEnabled });
}

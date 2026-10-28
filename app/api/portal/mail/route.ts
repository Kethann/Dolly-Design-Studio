import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { logActivity } from "@/lib/portal/activity";
import { isMailConfigured, mailConfig, maskEmail, sendMail, testEmail } from "@/lib/portal/mail";

/** Email status for owners (never the password), and a button that sends a test message to your own address. */
export async function GET() {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Only owners can see the email settings." }, { status: 403 });
  const c = mailConfig();
  return NextResponse.json({
    configured: !!c,
    label: c?.label ?? null,
    from: c?.from ?? null,
    account: c?.user ? maskEmail(c.user) : null,
    port: c?.port ?? null,
  });
}

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (me.role !== "owner" || me.setup) return NextResponse.json({ error: "Only owners can send a test email." }, { status: 403 });
  if (!me.email) return NextResponse.json({ error: "Add your email address first; the test is sent there." }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Email isn’t set up on this server yet." }, { status: 503 });

  const sent = await sendMail({ to: me.email, ...testEmail(me.name) });
  await logActivity({ headers: req.headers, actor: me, action: "email-test", detail: sent.ok ? `Sent to ${maskEmail(me.email)}` : "Failed", ok: sent.ok });
  if (!sent.ok) return NextResponse.json({ error: sent.message }, { status: 502 });
  return NextResponse.json({ ok: true, sentTo: maskEmail(me.email) });
}

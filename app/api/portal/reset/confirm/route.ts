import { NextRequest, NextResponse } from "next/server";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { checkCode, clearCodes } from "@/lib/portal/otp";
import { UserError, findUserByLogin, updateUser, validatePassword } from "@/lib/portal/users";

/** "Forgot password", step two: the emailed code plus a new password. Every device is signed out afterwards. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let identifier = "";
  let code = "";
  let password = "";
  try {
    const body = await req.json();
    identifier = typeof body?.identifier === "string" ? body.identifier.trim().slice(0, 120) : "";
    code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
    password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const keys = [`otp:${clientIp(req.headers)}`, `otp-for:${identifier.toLowerCase()}`];
  if (keys.some(tooManyFailures)) return NextResponse.json({ error: "Too many wrong codes. Try again in a few minutes." }, { status: 429 });

  const generic = NextResponse.json({ error: "That code isn’t right, or it has expired. Ask for a new one." }, { status: 400 });
  const user = await findUserByLogin(identifier);
  if (!user) {
    keys.forEach(noteFailure);
    return generic;
  }

  // Check the new password first, so a too-weak one doesn't use up the code.
  const weak = validatePassword(password);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const result = await checkCode("reset", user.id, code);
  if (!result.ok) {
    keys.forEach(noteFailure);
    await logActivity({ headers: req.headers, actor: user, action: "code-failed", detail: "Password reset code", ok: false });
    if (result.reason === "locked") return NextResponse.json({ error: "Too many wrong tries for that code. Ask for a new one." }, { status: 400 });
    return generic;
  }

  try {
    await updateUser(user.id, { password }); // ends this person's sessions everywhere
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[portal] password reset failed", err);
    return NextResponse.json({ error: "Couldn’t save the new password on this server." }, { status: 500 });
  }
  await clearCodes(user.id);
  await logActivity({ headers: req.headers, actor: user, action: "password-reset", detail: "With an emailed code; signed out everywhere" });
  return NextResponse.json({ ok: true });
}

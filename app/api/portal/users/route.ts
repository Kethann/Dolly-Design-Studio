import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getPortalUser, sessionCookie } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { noteFailure, tooManyFailures } from "@/lib/rate-limit";
import { canRecoverByMail } from "@/lib/portal/mail";
import { clearCodes } from "@/lib/portal/otp";
import {
  UserError,
  checkOwnPassword,
  createUser,
  listUsers,
  removeUser,
  updateUser,
  type PortalUser,
  type Role,
} from "@/lib/portal/users";

/** Portal accounts: owners manage everyone; editors can only change their own name and password. */

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const role = (v: unknown): Role | undefined => (v === "owner" || v === "editor" ? v : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

async function guard(req: NextRequest, mutating: boolean): Promise<PortalUser | NextResponse> {
  const me = await getPortalUser();
  if (!me) return fail("Your session has ended. Sign in again.", 401);
  const origin = req.headers.get("origin");
  if (mutating && origin && !requestOriginMatches(req)) return fail("Forbidden.", 403);
  return me;
}

async function body(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

function handle(err: unknown) {
  if (err instanceof UserError) return fail(err.message);
  console.error("[portal] account change failed", err);
  return fail("Couldn’t save on this server (its files are read-only). Accounts need a writable server.", 500);
}

export async function GET(req: NextRequest) {
  const me = await guard(req, false);
  if (me instanceof NextResponse) return me;
  const users = me.setup ? [] : await listUsers();
  return NextResponse.json({ me, users: me.role === "owner" ? users : users.filter((u) => u.id === me.id), emailRecovery: canRecoverByMail() });
}

/** Add an account (owners only; the setup login may create the first owner). */
export async function POST(req: NextRequest) {
  const me = await guard(req, true);
  if (me instanceof NextResponse) return me;
  if (me.role !== "owner") return fail("Only owners can add accounts.", 403);
  const b = await body(req);
  try {
    const user = await createUser({
      username: text(b.username, 64) ?? "",
      name: text(b.name, 60) ?? "",
      password: text(b.password, 200) ?? "",
      role: role(b.role) ?? "editor",
      email: text(b.email, 120) || undefined,
    });
    await logActivity({ headers: req.headers, actor: me, action: "person-added", detail: `${user.name} (${user.username}) as ${user.role}` });
    return NextResponse.json({ user });
  } catch (err) {
    return handle(err);
  }
}

/** Change a name, role or password. Changing your own password needs your current one. */
export async function PATCH(req: NextRequest) {
  const me = await guard(req, true);
  if (me instanceof NextResponse) return me;
  if (me.setup) return fail("Create your owner account first.", 403);
  const b = await body(req);
  const id = text(b.id, 64) ?? "";
  const self = id === me.id;
  if (!self && me.role !== "owner") return fail("Only owners can change other accounts.", 403);
  const password = text(b.password, 200);
  if (self && password !== undefined) {
    const keys = [`own-pw:${me.id}`, `own-pw-ip:${clientIp(req.headers)}`];
    if (keys.some(tooManyFailures)) return fail("Too many wrong passwords. Try again in a few minutes.", 429);
    if (!(await checkOwnPassword(me.id, text(b.currentPassword, 200) ?? ""))) {
      keys.forEach(noteFailure);
      return fail("Your current password isn’t right.");
    }
  }
  if (self && role(b.role) && role(b.role) !== me.role) return fail("Ask another owner to change your role.");
  try {
    const before = (await listUsers()).find((u) => u.id === id);
    const { user, version } = await updateUser(id, { name: text(b.name, 60), role: self ? undefined : role(b.role), password });
    const res = NextResponse.json({ user });
    // Your own password change signs out your other devices, but keeps this one signed in.
    if (self && password !== undefined) res.cookies.set(sessionCookie(createSessionToken(user.id, version)));
    if (password !== undefined) {
      await clearCodes(user.id, `mail:${user.email ?? ""}`);
      await logActivity(
        self
          ? { headers: req.headers, actor: me, action: "password-changed", detail: "Other devices were signed out" }
          : { headers: req.headers, actor: me, action: "password-set-for", detail: `${user.name} (${user.username}) was signed out everywhere` },
      );
    }
    if (b.name !== undefined && before && before.name !== user.name) {
      await logActivity({ headers: req.headers, actor: me, action: "name-changed", detail: self ? `${before.name} → ${user.name}` : `${before.username}: ${before.name} → ${user.name}` });
    }
    if (!self && role(b.role) && before && before.role !== user.role) {
      await logActivity({ headers: req.headers, actor: me, action: "role-changed", detail: `${user.name} (${user.username}) is now ${user.role === "owner" ? "an owner" : "an editor"}` });
    }
    return res;
  } catch (err) {
    return handle(err);
  }
}

export async function DELETE(req: NextRequest) {
  const me = await guard(req, true);
  if (me instanceof NextResponse) return me;
  if (me.role !== "owner" || me.setup) return fail("Only owners can remove accounts.", 403);
  const id = text((await body(req)).id, 64) ?? "";
  // Everyone, even the last owner or yourself, can be removed when the studio's mailbox can bring the owner back in.
  const recovery = canRecoverByMail();
  try {
    const gone = (await listUsers()).find((u) => u.id === id);
    await removeUser(id, { allowLastOwner: recovery });
    if (gone) await logActivity({ headers: req.headers, actor: me, action: "person-removed", detail: `${gone.name} (${gone.username})` });
    const res = NextResponse.json({ ok: true, signedOut: id === me.id });
    if (id === me.id) res.cookies.delete("dds_portal");
    return res;
  } catch (err) {
    return handle(err);
  }
}

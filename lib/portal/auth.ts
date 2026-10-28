// Server-only: the creator portal's signed session cookie.
// A session names a user and their password version (see users.ts), so a password change or a removed account
// ends that user's sessions at once.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hasAccounts, userForSession, type PortalUser } from "./users";

export const SESSION_COOKIE = "dds_portal";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

/** The key that signs sessions: PORTAL_SECRET if set (recommended), else derived from PORTAL_PASSWORD. */
function signingKey(): string | null {
  if (process.env.PORTAL_SECRET) return process.env.PORTAL_SECRET;
  const password = process.env.PORTAL_PASSWORD;
  return password ? createHash("sha256").update(`dds-portal:${password}`).digest("hex") : null;
}

/** The portal works once the server can sign sessions; accounts can exist without the setup password. */
export async function isPortalConfigured() {
  return !!signingKey() && (!!process.env.PORTAL_PASSWORD || (await hasAccounts()));
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("hex");

export function createSessionToken(userId: string, version: number): string {
  const key = signingKey();
  if (!key) throw new Error("Set PORTAL_SECRET (or PORTAL_PASSWORD) on the server");
  const payload = `${userId}.${version}.${Date.now() + SESSION_MAX_AGE * 1000}`;
  return `${payload}.${sign(payload, key)}`;
}

const CHALLENGE_MAX_AGE = 10 * 60 * 1000;

/** After the right password, for people with two-step sign-in: proof of that, good for 10 minutes, until the code is typed. */
export function createChallengeToken(userId: string): string {
  const key = signingKey();
  if (!key) throw new Error("Set PORTAL_SECRET (or PORTAL_PASSWORD) on the server");
  const payload = `${userId}.${Date.now() + CHALLENGE_MAX_AGE}`;
  return `c.${payload}.${sign(`challenge:${payload}`, key)}`;
}

/** The person a challenge token was made for, or null if it is forged or has expired. */
export function readChallengeToken(token: string): string | null {
  const key = signingKey();
  const parts = token.split(".");
  if (!key || parts.length !== 4 || parts[0] !== "c") return null;
  const [, id, expires, signature] = parts;
  if (!(Number(expires) > Date.now())) return null;
  const expected = Buffer.from(sign(`challenge:${id}.${expires}`, key), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

async function sessionUser(token: string | undefined): Promise<PortalUser | null> {
  const key = signingKey();
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, version, expires, signature] = parts;
  if (!(Number(expires) > Date.now())) return null;
  const expected = Buffer.from(sign(`${id}.${version}.${expires}`, key), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userForSession(id, Number(version));
}

/** The signed-in user, or null. */
export async function getPortalUser(): Promise<PortalUser | null> {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function hasPortalSession(): Promise<boolean> {
  return !!(await getPortalUser());
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
});

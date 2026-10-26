// Server-only: the creator portal's password check and signed session cookie.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "dds_portal";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // a week

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const isPortalConfigured = () => !!process.env.PORTAL_PASSWORD;

/** Derived from the password, so changing the password signs everyone out. */
function signingKey(): string | null {
  const password = process.env.PORTAL_PASSWORD;
  if (!password) return null;
  return process.env.PORTAL_SECRET || createHash("sha256").update(`dds-portal:${password}`).digest("hex");
}

export function checkPassword(input: string): boolean {
  const password = process.env.PORTAL_PASSWORD;
  if (!password) return false;
  return timingSafeEqual(sha256(input), sha256(password)); // equal-length digests: no timing leak
}

function sign(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const key = signingKey();
  if (!key) throw new Error("PORTAL_PASSWORD is not set");
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expires}.${sign(expires, key)}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !(Number(expires) > Date.now())) return false;
  const expected = Buffer.from(sign(expires, key), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function hasPortalSession(): Promise<boolean> {
  return isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

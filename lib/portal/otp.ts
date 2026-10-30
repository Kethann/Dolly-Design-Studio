// Server-only: one-time codes (sent by email) for sign-in, password reset and confirming an email address.
//
// Only a salted hash of each code is stored (in .data/portal-otps.json, git-ignored). A code works once, expires after
// 10 minutes, and locks after 5 wrong guesses. Asking for a new code replaces the old one, at most once every 45 seconds.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { updateJsonAtomically } from "@/lib/storage";
import type { CodePurpose } from "./mail";

const KEY = "data/portal-otps.json";
export const CODE_MINUTES = 10;
const COOLDOWN_MS = 45_000;
const MAX_ATTEMPTS = 5;

interface Stored {
  purpose: CodePurpose;
  /** Whose code: a user id. */
  key: string;
  salt: string;
  hash: string;
  expires: number;
  sentAt: number;
  attempts: number;
  /** Anything to carry through (the new email address, for "email"). */
  data?: string;
}

function update<R>(change: (list: Stored[]) => { value?: Stored[]; result: R }): Promise<R> {
  return updateJsonAtomically<Stored[], R>(KEY, [], (list) => {
    if (!Array.isArray(list)) throw new Error("Verification-code storage could not be read.");
    return change(list.filter(s => s.expires > Date.now()));
  });
}

const digest = (salt: string, code: string) => createHash("sha256").update(`${salt}:${code}`).digest("hex");

/** Makes a new code. Returns it (to be emailed), or says how long to wait. */
export async function issueCode(purpose: CodePurpose, key: string, data?: string): Promise<{ code: string } | { wait: number }> {
  return update<{ code: string } | { wait: number }>((list) => {
    const now = Date.now();
    const existing = list.find((s) => s.purpose === purpose && s.key === key);
    if (existing && now - existing.sentAt < COOLDOWN_MS) return { result: { wait: Math.ceil((COOLDOWN_MS - (now - existing.sentAt)) / 1000) } };
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = randomBytes(12).toString("hex");
    const next = list.filter((s) => !(s.purpose === purpose && s.key === key));
    next.push({ purpose, key, salt, hash: digest(salt, code), expires: now + CODE_MINUTES * 60_000, sentAt: now, attempts: 0, data });
    return { value: next, result: { code } };
  });
}

export type CheckResult = { ok: true; data?: string } | { ok: false; reason: "wrong" | "expired" | "locked" };

/** Checks a code the person typed. A right code is used up. */
export async function checkCode(purpose: CodePurpose, key: string, typed: string): Promise<CheckResult> {
  return update<CheckResult>((list) => {
    const entry = list.find((s) => s.purpose === purpose && s.key === key);
    if (!entry) return { result: { ok: false, reason: "expired" } };
    if (entry.attempts >= MAX_ATTEMPTS) return { result: { ok: false, reason: "locked" } };
    const given = Buffer.from(digest(entry.salt, typed.replace(/\s+/g, "")), "hex");
    const real = Buffer.from(entry.hash, "hex");
    if (given.length === real.length && timingSafeEqual(given, real)) {
      return { value: list.filter((s) => s !== entry), result: { ok: true, data: entry.data } };
    }
    entry.attempts += 1;
    return { value: list, result: { ok: false, reason: entry.attempts >= MAX_ATTEMPTS ? "locked" : "wrong" } };
  });
}

/** Throws away a person's pending codes (after a password change or removal). */
export async function clearCodes(key: string, ...otherKeys: string[]) {
  const keys = new Set([key, ...otherKeys]);
  await update<void>((list) => ({ value: list.filter(s => !keys.has(s.key)), result: undefined }));
}

/** A delivery failure must not leave an unusable code or impose its resend cooldown. */
export async function discardCode(purpose: CodePurpose, key: string, code: string) {
  await update<void>((list) => ({
    value: list.filter((s) => !(s.purpose === purpose && s.key === key && s.hash === digest(s.salt, code))),
    result: undefined,
  }));
}

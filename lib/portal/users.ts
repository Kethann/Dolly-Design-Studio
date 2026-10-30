// Server-only: the creator portal's user accounts.
//
// Stored in .data/portal-users.json on your computer (git-ignored: never pushed), or in the R2 bucket on Cloudflare. Passwords are hashed with scrypt and a per-user
// salt; nothing reversible is kept. Each user has a `version` that changes with every password change or removal,
// which instantly ends that user's sessions everywhere.
//
// First run: while no account exists, sign in as "admin" with PORTAL_PASSWORD (from the server's environment) and
// create your own owner account. From then on PORTAL_PASSWORD no longer signs anyone in.
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { readJson, writeJson } from "@/lib/storage";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY = "data/portal-users.json";
export const SETUP_USERNAME = "admin";
const SETUP_ID = "setup";
export const PASSWORD_MIN = 10;

export type Role = "owner" | "editor";

interface StoredUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
  version: number;
  createdAt: string;
  lastSignIn?: string;
  /** Where codes are sent (sign-in, password reset). Always lower case, and unique among people. */
  email?: string;
  /** Ask for an emailed code after the password, every time. Needs an email address. */
  twoFactor?: boolean;
}

/** What the portal (and the browser) may see about a user. */
export interface PortalUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  createdAt: string;
  lastSignIn?: string;
  email?: string;
  twoFactor?: boolean;
  /** The temporary first-run login (PORTAL_PASSWORD), until a real owner account exists. */
  setup?: boolean;
}

export const publicUser = (u: StoredUser): PortalUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt,
  lastSignIn: u.lastSignIn,
  email: u.email,
  twoFactor: !!u.twoFactor && !!u.email,
});

const SETUP_USER: PortalUser = {
  id: SETUP_ID,
  username: SETUP_USERNAME,
  name: "Setup",
  role: "owner",
  createdAt: "",
  setup: true,
};

async function load(): Promise<StoredUser[]> {
  const data = await readJson<{ users?: StoredUser[] }>(KEY);
  return Array.isArray(data?.users) ? data.users : [];
}

/** Saved as a whole file at a time (to disk, or to the R2 bucket on Cloudflare). */
async function save(users: StoredUser[]) {
  await writeJson(KEY, { users }, true);
}

async function hashPassword(password: string, salt = randomBytes(16)) {
  const hash = await scrypt(password.normalize("NFKC"), salt, 64);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

async function passwordMatches(user: StoredUser, password: string) {
  const { hash } = await hashPassword(password, Buffer.from(user.salt, "hex"));
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest();

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

export function validateUsername(u: string): string | null {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)
    ? null
    : "Usernames are 3–32 characters: letters, numbers, dots, dashes or underscores.";
}

export function validateEmail(e: string): string | null {
  return e.length <= 120 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) ? null : "That doesn’t look like an email address.";
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function validatePassword(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (p.length > 200) return "That password is too long.";
  if (/^(.)\1+$/.test(p) || /^(password|1234567890|qwertyuiop)/i.test(p)) return "Choose a less guessable password.";
  return null;
}

export async function hasAccounts() {
  return (await load()).length > 0;
}

/** Checks a sign-in. Always does the same amount of work, so timing doesn't reveal which usernames exist. */
export async function verifyLogin(username: string, password: string): Promise<{ user: PortalUser; version: number } | null> {
  const users = await load();
  const name = normalizeUsername(username);
  if (users.length === 0) {
    const setup = process.env.PORTAL_PASSWORD;
    if (!setup || name !== SETUP_USERNAME) return null;
    return timingSafeEqual(sha256(password), sha256(setup)) ? { user: SETUP_USER, version: setupVersion() } : null;
  }
  const user = users.find((u) => u.username === name);
  if (!user) {
    await hashPassword(password); // same cost as a real check
    return null;
  }
  if (!(await passwordMatches(user, password))) return null;
  user.lastSignIn = new Date().toISOString();
  await save(users).catch(() => {}); // a read-only server can still sign people in
  return { user: publicUser(user), version: user.version };
}

/** The setup login's sessions end when PORTAL_PASSWORD changes. */
const setupVersion = () => sha256(`setup:${process.env.PORTAL_PASSWORD ?? ""}`).readUInt32BE(0);

/** The user a session belongs to, if that session is still valid (same password version, account still there). */
export async function userForSession(id: string, version: number): Promise<PortalUser | null> {
  const users = await load();
  if (id === SETUP_ID) return users.length === 0 && process.env.PORTAL_PASSWORD && version === setupVersion() ? SETUP_USER : null;
  const user = users.find((u) => u.id === id);
  return user && user.version === version ? publicUser(user) : null;
}

export async function listUsers(): Promise<PortalUser[]> {
  return (await load()).map(publicUser);
}

export async function createUser(input: { username: string; name: string; password: string; role: Role; email?: string }): Promise<PortalUser> {
  const users = await load();
  const username = normalizeUsername(input.username);
  const email = input.email ? normalizeEmail(input.email) : "";
  const bad = validateUsername(username) ?? validatePassword(input.password) ?? (email ? validateEmail(email) : null);
  if (bad) throw new UserError(bad);
  if (users.some((u) => u.username === username)) throw new UserError("That username is taken.");
  if (email && users.some((u) => u.email === email)) throw new UserError("Someone already uses that email address.");
  // The very first account is always an owner (it replaces the setup login).
  const role: Role = users.length === 0 ? "owner" : input.role;
  const user: StoredUser = {
    id: randomUUID(),
    username,
    name: input.name.trim().slice(0, 60) || username,
    role,
    ...(await hashPassword(input.password)),
    version: 1,
    createdAt: new Date().toISOString(),
    ...(email ? { email } : {}),
  };
  await save([...users, user]);
  return publicUser(user);
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; password?: string },
): Promise<{ user: PortalUser; version: number }> {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new UserError("That account no longer exists.");
  if (patch.role && patch.role !== user.role && user.role === "owner" && users.filter((u) => u.role === "owner").length === 1) {
    throw new UserError("There must always be at least one owner.");
  }
  if (patch.name !== undefined) user.name = patch.name.trim().slice(0, 60) || user.username;
  if (patch.role) user.role = patch.role;
  if (patch.password !== undefined) {
    const bad = validatePassword(patch.password);
    if (bad) throw new UserError(bad);
    Object.assign(user, await hashPassword(patch.password));
    user.version += 1; // signs this user out everywhere
  }
  await save(users);
  return { user: publicUser(user), version: user.version };
}

/** The confirmed email addresses of every owner: they are told about each new enquiry. */
export async function ownerEmails(): Promise<string[]> {
  return (await load()).filter((u) => u.role === "owner" && u.email).map((u) => u.email as string);
}

/** Finds someone by their email address only (Google sign-in: the address Google has confirmed). */
export async function findUserByEmail(email: string): Promise<{ user: PortalUser; version: number } | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  const u = (await load()).find((x) => x.email === key);
  return u ? { user: publicUser(u), version: u.version } : null;
}

/** Finds someone by username or by email address (for "forgot password"). */
export async function findUserByLogin(identifier: string): Promise<PortalUser | null> {
  const key = identifier.trim().toLowerCase();
  if (!key) return null;
  const u = (await load()).find((x) => x.username === key || x.email === key);
  return u ? publicUser(u) : null;
}

/** A person and their current password version (the version a fresh session must carry). */
export async function getUserWithVersion(id: string): Promise<{ user: PortalUser; version: number } | null> {
  const u = (await load()).find((x) => x.id === id);
  return u ? { user: publicUser(u), version: u.version } : null;
}

export async function changeUsername(id: string, next: string): Promise<PortalUser> {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new UserError("That account no longer exists.");
  const username = normalizeUsername(next);
  const bad = validateUsername(username);
  if (bad) throw new UserError(bad);
  if (users.some((u) => u.id !== id && u.username === username)) throw new UserError("That username is taken.");
  user.username = username;
  await save(users);
  return publicUser(user);
}

/** Sets (or, with an empty string, removes) a person's email address. Removing it also ends two-step sign-in. */
export async function setEmail(id: string, next: string): Promise<PortalUser> {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new UserError("That account no longer exists.");
  const email = normalizeEmail(next);
  if (email) {
    const bad = validateEmail(email);
    if (bad) throw new UserError(bad);
    if (users.some((u) => u.id !== id && u.email === email)) throw new UserError("Someone already uses that email address.");
    user.email = email;
  } else {
    delete user.email;
    user.twoFactor = false;
  }
  await save(users);
  return publicUser(user);
}

export async function setTwoFactor(id: string, enabled: boolean): Promise<PortalUser> {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new UserError("That account no longer exists.");
  if (enabled && !user.email) throw new UserError("Add and confirm an email address first: the codes are sent there.");
  user.twoFactor = enabled;
  await save(users);
  return publicUser(user);
}

/** Ends this person's sessions everywhere (the version in every session cookie stops matching). */
export async function bumpVersion(id: string): Promise<number> {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) throw new UserError("That account no longer exists.");
  user.version += 1;
  await save(users);
  return user.version;
}

export async function removeUser(id: string) {
  const users = await load();
  const user = users.find((u) => u.id === id);
  if (!user) return;
  if (user.role === "owner" && users.filter((u) => u.role === "owner").length === 1) {
    throw new UserError("You can’t remove the last owner.");
  }
  await save(users.filter((u) => u.id !== id));
}

export async function checkOwnPassword(id: string, password: string) {
  const user = (await load()).find((u) => u.id === id);
  return !!user && (await passwordMatches(user, password));
}

/** A problem the person can fix (shown to them as is). */
export class UserError extends Error {}

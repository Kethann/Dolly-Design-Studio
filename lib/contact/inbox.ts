// Server-only: the enquiry database. Every message sent through the contact form is saved here first, before any
// email is attempted, so nothing is ever lost if the email is down.
//
// One small JSON record per enquiry (data/inbox/<time>-<id>.json): on your computer in .data/inbox/, in R2 on
// Cloudflare. One file each means two people sending at once can never overwrite one another.
import { randomUUID } from "node:crypto";
import { store } from "@/lib/storage";
import type { ContactInput } from "./validate";

const DIR = "data/inbox/";

export type EnquiryStatus = "new" | "read" | "archived";

/** One answer sent from the portal to the person who used the contact form. */
export interface Reply {
  /** ISO time it was sent. */
  at: string;
  /** Who at the studio wrote it (their name in the portal). */
  by: string;
  subject: string;
  body: string;
  /** Whether the email went out. A failed one is kept, so the words are never lost, and can be sent again. */
  sent: boolean;
  note?: string;
}

export interface Enquiry extends ContactInput {
  id: string;
  /** ISO time it arrived. */
  at: string;
  status: EnquiryStatus;
  /** Whether the notification email reached the studio's inbox. */
  emailed: boolean;
  /** Why the email did not go, when it didn't. */
  emailNote?: string;
  device: string;
  /** The answers sent from the portal, oldest first. */
  replies?: Reply[];
}

const keyOf = (e: Pick<Enquiry, "id" | "at">) => `${DIR}${e.at.replace(/[:.]/g, "-")}_${e.id}.json`;
const idOf = (key: string) => key.slice(key.lastIndexOf("_") + 1, -".json".length);
const STATUSES: EnquiryStatus[] = ["new", "read", "archived"];

export async function saveEnquiry(input: ContactInput, extra: { device: string }): Promise<Enquiry> {
  const entry: Enquiry = { ...input, id: randomUUID().slice(0, 12), at: new Date().toISOString(), status: "new", emailed: false, device: extra.device };
  await (await store()).putText(keyOf(entry), JSON.stringify(entry));
  return entry;
}

async function find(id: string): Promise<{ key: string; entry: Enquiry } | null> {
  if (!/^[0-9a-f-]{6,36}$/.test(id)) return null;
  const s = await store();
  const key = (await s.list(DIR)).find((k) => idOf(k) === id);
  if (!key) return null;
  try {
    return { key, entry: JSON.parse((await s.getText(key)) ?? "") as Enquiry };
  } catch {
    return null;
  }
}

/** Records how the notification email went. */
export async function noteEmail(entry: Enquiry, emailed: boolean, note?: string): Promise<void> {
  try {
    await (await store()).putText(keyOf(entry), JSON.stringify({ ...entry, emailed, emailNote: emailed ? undefined : note }));
  } catch (err) {
    console.error("[contact] could not record the email result", err);
  }
}

/** Adds an answer to an enquiry (and marks the enquiry as read). Returns the updated enquiry, or null if it is gone. */
export async function addReply(id: string, reply: Reply): Promise<Enquiry | null> {
  const hit = await find(id);
  if (!hit) return null;
  const entry: Enquiry = { ...hit.entry, status: hit.entry.status === "new" ? "read" : hit.entry.status, replies: [...(hit.entry.replies ?? []), reply].slice(-50) };
  await (await store()).putText(hit.key, JSON.stringify(entry));
  return entry;
}

export async function getEnquiry(id: string): Promise<Enquiry | null> {
  return (await find(id))?.entry ?? null;
}

/** Newest first. */
export async function listEnquiries(): Promise<Enquiry[]> {
  const s = await store();
  const keys = (await s.list(DIR)).reverse().slice(0, 1000);
  const out: Enquiry[] = [];
  await Promise.all(
    keys.map(async (k, i) => {
      try {
        const e = JSON.parse((await s.getText(k)) ?? "") as Enquiry;
        if (e && typeof e.id === "string" && typeof e.name === "string") out[i] = e;
      } catch {}
    }),
  );
  return out.filter(Boolean);
}

export async function setEnquiryStatus(id: string, status: EnquiryStatus): Promise<boolean> {
  if (!STATUSES.includes(status)) return false;
  const hit = await find(id);
  if (!hit) return false;
  await (await store()).putText(hit.key, JSON.stringify({ ...hit.entry, status }));
  return true;
}

export async function deleteEnquiry(id: string): Promise<boolean> {
  const hit = await find(id);
  if (!hit) return false;
  await (await store()).remove(hit.key);
  return true;
}

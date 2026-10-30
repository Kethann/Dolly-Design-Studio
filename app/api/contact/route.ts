import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { home } from "@/content/home";
import { site } from "@/content/site";
import { validateContact } from "@/lib/contact/validate";
import { findRecentDuplicate, noteEmail, saveEnquiry } from "@/lib/contact/inbox";
import { clientIp, describeDevice } from "@/lib/portal/activity";
import { enquiryEmail, enquiryRecipient, enquiryRecipients, sendMail } from "@/lib/portal/mail";
import { ownerEmails } from "@/lib/portal/users";

const errors = home.contact.form.errors;
// A message is never bigger than this many bytes of JSON.
const MAX_BODY = 20_000;

/**
 * The contact form. The enquiry is checked, saved to the enquiry database (shown in the portal's Enquiries window) and
 * then emailed to the studio. Saving comes first, so a message is never lost even if the email can't be sent.
 */
export async function POST(req: NextRequest) {
  // Only from this site's own contact form (a browser always says where a post comes from).
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: errors.badRequest }, { status: 403 });
  // Refused from the declared size, before any of it is read.
  if (Number(req.headers.get("content-length")) > MAX_BODY) return NextResponse.json({ error: errors.badRequest }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: errors.badRequest }, { status: 413 });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: errors.badRequest }, { status: 400 });
  }

  // Honeypot: bots fill every field, including this hidden one. They are told it worked, and nothing is kept.
  if (typeof body.website === "string" && body.website) return NextResponse.json({ ok: true });

  const { errors: fieldErrors, value } = validateContact(body);
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: errors.missingFields, fields: fieldErrors }, { status: 422 });
  }

  // Only real attempts count towards the limit, so fixing a typo never locks anyone out.
  const ip = clientIp(req.headers);
  if (isRateLimited(ip)) return NextResponse.json({ error: errors.tooManyRequests }, { status: 429 });

  // The same message sent twice in a row (a double click, a retry) is kept once.
  if (await findRecentDuplicate(value).catch(() => null)) return NextResponse.json({ ok: true, saved: true, duplicate: true });

  let entry;
  try {
    entry = await saveEnquiry(value, { device: describeDevice(req.headers.get("user-agent")) });
  } catch (err) {
    // The database could not take it. The message must still not be lost: it is emailed to the studio straight away.
    console.error("[contact] could not save the enquiry", err);
    const owners = await ownerEmails().catch(() => [] as string[]);
    const sent = await sendMail({ to: enquiryRecipients(enquiryRecipient(site.contact.email), owners), replyTo: value.email, ...enquiryEmail(value) });
    if (sent.ok) return NextResponse.json({ ok: true, saved: false, emailed: true });
    return NextResponse.json({ error: errors.sendFailed }, { status: 500 });
  }

  // The email goes off in the background; the visitor is answered as soon as the enquiry is saved (or after a moment, if
  // the mail service is slow), so the form never sits on "Sending…" waiting for it.
  const owners = await ownerEmails().catch(() => [] as string[]);
  const mailing = sendMail({ to: enquiryRecipients(enquiryRecipient(site.contact.email), owners), replyTo: value.email, ...enquiryEmail(value) }).then(async (sent) => {
    await noteEmail(entry, sent.ok, sent.ok ? undefined : sent.message);
    return sent;
  });
  try {
    // On Cloudflare the work is allowed to finish after the answer has been sent.
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    getCloudflareContext().ctx.waitUntil(mailing);
  } catch {
    // a normal Node server keeps running anyway
  }
  const sent = await Promise.race([mailing, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
  // The enquiry is safely saved either way: the visitor is thanked, and the portal shows whether the email went.
  return NextResponse.json({ ok: true, saved: true, emailed: sent ? sent.ok : "pending" });
}

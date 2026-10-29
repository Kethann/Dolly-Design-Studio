import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { home } from "@/content/home";
import { site } from "@/content/site";
import { validateContact } from "@/lib/contact/validate";
import { noteEmail, saveEnquiry } from "@/lib/contact/inbox";
import { describeDevice } from "@/lib/portal/activity";
import { enquiryEmail, enquiryRecipient, sendMail } from "@/lib/portal/mail";

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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) return NextResponse.json({ error: errors.tooManyRequests }, { status: 429 });

  let entry;
  try {
    entry = await saveEnquiry(value, { device: describeDevice(req.headers.get("user-agent")) });
  } catch (err) {
    console.error("[contact] could not save the enquiry", err);
    return NextResponse.json({ error: errors.sendFailed }, { status: 500 });
  }

  const sent = await sendMail({ to: enquiryRecipient(site.contact.email), replyTo: value.email, ...enquiryEmail(value) });
  await noteEmail(entry, sent.ok, sent.ok ? undefined : sent.message);
  // The enquiry is safely saved either way: the visitor is thanked, and the portal shows whether the email went.
  return NextResponse.json({ ok: true, saved: true, emailed: sent.ok });
}

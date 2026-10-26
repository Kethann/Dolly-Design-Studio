import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { home } from "@/content/home";
import { site } from "@/content/site";

const errors = home.contact.form.errors;

export interface ContactPayload {
  name: string;
  email: string;
  company?: string;
  projectType: string;
  budget: string;
  timeline: string;
  message: string;
  /** Honeypot field — real users never fill this in. */
  website?: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  let body: Partial<ContactPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: errors.badRequest }, { status: 400 });
  }

  // Honeypot: bots fill every field, including this hidden one.
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: errors.tooManyRequests }, { status: 429 });
  }

  const { name, email, company, projectType, budget, timeline, message } = body;
  if (!name?.trim() || !email?.trim() || !message?.trim() || !projectType || !isValidEmail(email)) {
    return NextResponse.json({ error: errors.missingFields }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || site.contact.email;
  const from = process.env.CONTACT_FROM_EMAIL || "Dolly Design Studio <onboarding@resend.dev>";

  const text = [
    `New enquiry from the website`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Company: ${company}` : null,
    `Project type: ${projectType}`,
    `Budget: ${budget || "Not specified"}`,
    `Timeline: ${timeline || "Not specified"}`,
    ``,
    message,
  ]
    .filter(Boolean)
    .join("\n");

  if (!apiKey) {
    // Local/dev fallback: no Resend key configured yet, so just log it.
    console.info("[contact] RESEND_API_KEY not set — logging submission instead of emailing:\n" + text);
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: email, subject: `New enquiry — ${name}`, text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[contact] Resend error:", detail);
      return NextResponse.json({ error: errors.sendFailed }, { status: 502 });
    }
  } catch (err) {
    console.error("[contact] Network error sending email:", err);
    return NextResponse.json({ error: errors.sendFailed }, { status: 502 });
  }

  return NextResponse.json({ ok: true, delivered: true });
}

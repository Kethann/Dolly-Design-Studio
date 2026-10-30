// Server-only: sending email from the portal (sign-in codes, password-reset codes, email checks) over SMTP.
//
// Configure it with environment variables (in .env.local while developing, in the host's settings when live).
// The simplest route is a Gmail account with an "app password":
//
//     GMAIL_USER=you@gmail.com
//     GMAIL_APP_PASSWORD=abcd efgh ijkl mnop        (Google account → Security → 2-Step Verification → App passwords)
//
// Any other SMTP service works too:
//
//     SMTP_HOST=smtp.example.com
//     SMTP_PORT=587                  (465 for SSL)
//     SMTP_SECURE=false              ("true" for port 465)
//     SMTP_USER=…                    (leave out for a server that needs no sign-in)
//     SMTP_PASS=…
//     SMTP_FROM="Dolly Design Studio <no-reply@example.com>"
//
// On Cloudflare the site opens its own connection to Gmail / SMTP (see smtp-socket.ts), so the Gmail settings above work there
// too: add them as secrets (npx wrangler secret put GMAIL_USER / GMAIL_APP_PASSWORD). Resend's HTTPS service is the alternative:
//
//     RESEND_API_KEY=re_…
//     MAIL_FROM="Dolly Design Studio <portal@yourdomain.com>"      (a domain you verified in Resend)
import type { Transporter } from "nodemailer";
import { inWorker, sendViaSocket } from "./smtp-socket";

export interface MailConfig {
  /** "resend" sends over HTTPS (works everywhere, including Cloudflare); "smtp" needs a server that can open mail connections. */
  provider: "resend" | "smtp";
  /** Resend's API key. */
  apiKey?: string;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  /** "Gmail" or the SMTP host, for showing in the portal. */
  label: string;
}

/** Reads the settings from the environment on every call, so they can be changed without rebuilding. */
export function mailConfig(): MailConfig | null {
  const env = process.env;
  if (env.RESEND_API_KEY) {
    return {
      provider: "resend",
      apiKey: env.RESEND_API_KEY,
      host: "api.resend.com",
      port: 443,
      secure: true,
      from: env.MAIL_FROM || env.SMTP_FROM || "Dolly Design Studio <onboarding@resend.dev>",
      label: "Resend",
    };
  }
  if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT) || 587;
    const user = env.SMTP_USER || undefined;
    return {
      provider: "smtp",
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
      user,
      pass: env.SMTP_PASS || undefined,
      from: env.SMTP_FROM || (user ? `Dolly Design Studio <${user}>` : "Dolly Design Studio <no-reply@localhost>"),
      label: env.SMTP_HOST,
    };
  }
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return {
      provider: "smtp",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""), // Google shows app passwords in groups of four
      from: env.SMTP_FROM || `Dolly Design Studio <${env.GMAIL_USER}>`,
      label: "Gmail",
    };
  }
  return null;
}

export const isMailConfigured = () => mailConfig() !== null;

/** "k•••••@gmail.com": enough to recognise the address, not enough to hand it to anyone. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "•••";
  return `${name.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

let cached: { key: string; transport: Transporter } | null = null;

async function transportFor(c: MailConfig): Promise<Transporter> {
  const key = JSON.stringify([c.host, c.port, c.secure, c.user, c.pass]);
  if (cached?.key === key) return cached.transport;
  const nodemailer = (await import("nodemailer")).default; // only when SMTP is used
  const transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // A local test server has no certificate; a real one always does.
    tls: { rejectUnauthorized: !/^(localhost|127\.0\.0\.1)$/.test(c.host) },
  });
  cached = { key, transport };
  return transport;
}

export type SendResult = { ok: true } | { ok: false; reason: "not-configured" | "failed"; message: string };

export async function sendMail(input: { to: string | string[]; subject: string; text: string; html: string; replyTo?: string }): Promise<SendResult> {
  const config = mailConfig();
  // One or several addresses, each once, without blanks.
  const recipients = [...new Set((Array.isArray(input.to) ? input.to : [input.to]).map((t) => t.trim()).filter(Boolean))];
  if (!recipients.length) return { ok: false, reason: "failed", message: "There is no address to send to." };
  if (!config) {
    // While developing without email set up, the message is printed so a code can still be used.
    if (process.env.NODE_ENV !== "production") console.log(`\n[portal email — not configured, so not sent]\nTo: ${recipients.join(", ")}\n${input.subject}\n${input.text}\n`);
    return { ok: false, reason: "not-configured", message: "Email isn’t set up on this server yet." };
  }
  try {
    if (config.provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, to: recipients, subject: input.subject, text: input.text, html: input.html, ...(input.replyTo ? { reply_to: input.replyTo } : {}) }),
      });
      if (!res.ok) {
        console.error("[portal] Resend refused the email:", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return { ok: false, reason: "failed", message: "The email couldn’t be sent. Check the email settings on the server." };
      }
      return { ok: true };
    }
    if (inWorker()) {
      // A Cloudflare Worker has no Node mail library: it opens its own connection to the mail server.
      await sendViaSocket({ host: config.host, port: config.port, secure: config.secure, user: config.user, pass: config.pass, from: config.from, to: recipients, replyTo: input.replyTo, subject: input.subject, text: input.text, html: input.html });
      return { ok: true };
    }
    await (await transportFor(config)).sendMail({ from: config.from, to: recipients, subject: input.subject, text: input.text, html: input.html, replyTo: input.replyTo });
    return { ok: true };
  } catch (err) {
    console.error("[portal] could not send email", err instanceof Error ? err.message : err);
    return { ok: false, reason: "failed", message: "The email couldn’t be sent. Check the email settings on the server." };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type CodePurpose = "login" | "reset" | "email";

const PURPOSE_TEXT: Record<CodePurpose, { subject: string; lead: string }> = {
  login: { subject: "Your sign-in code", lead: "Use this code to finish signing in to the Dolly Design Studio portal." },
  reset: { subject: "Reset your portal password", lead: "Use this code to choose a new password for the Dolly Design Studio portal." },
  email: { subject: "Confirm your email address", lead: "Use this code to confirm this email address for the Dolly Design Studio portal." },
};

/** The email carrying a one-time code. */
export function codeEmail(opts: { name: string; code: string; purpose: CodePurpose; minutes: number }) {
  const t = PURPOSE_TEXT[opts.purpose];
  const text = `Hello ${opts.name},\n\n${t.lead}\n\n    ${opts.code}\n\nIt works once and expires in ${opts.minutes} minutes. If you didn’t ask for it, you can ignore this email — nobody can sign in without it.\n\nDolly Design Studio`;
  const html = `<!doctype html><html><body style="margin:0;background:#1a0a10;font-family:Arial,Helvetica,sans-serif;color:#f4ede1">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1a0a10;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="440" cellspacing="0" cellpadding="0" style="max-width:440px;background:#261219;border:1px solid #4a2c35;border-radius:16px;padding:32px">
<tr><td style="color:#e8b04b;font-size:12px;letter-spacing:3px;text-transform:uppercase">Dolly Design Studio</td></tr>
<tr><td style="padding-top:14px;font-size:20px;font-weight:bold">${esc(t.subject)}</td></tr>
<tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#d9cfc0">Hello ${esc(opts.name)},<br>${esc(t.lead)}</td></tr>
<tr><td align="center" style="padding:24px 0"><div style="display:inline-block;background:#12060a;border:1px solid #e8b04b;border-radius:12px;padding:14px 26px;font-size:34px;letter-spacing:10px;font-weight:bold;color:#fff195">${esc(opts.code)}</div></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#a89d8e">It works once and expires in ${opts.minutes} minutes. If you didn’t ask for it, you can ignore this email — nobody can sign in without it.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: t.subject, text, html };
}

export function testEmail(name: string) {
  const text = `Hello ${name},\n\nThis is a test message from the Dolly Design Studio portal. Your email settings work, so sign-in codes and password-reset codes will reach you.\n\nDolly Design Studio`;
  const html = `<p style="font-family:Arial,sans-serif">Hello ${esc(name)},</p><p style="font-family:Arial,sans-serif">This is a test message from the Dolly Design Studio portal. Your email settings work, so sign-in codes and password-reset codes will reach you.</p>`;
  return { subject: "Test email from the portal", text, html };
}

/** Where website enquiries are sent: CONTACT_TO_EMAIL if set, otherwise the connected mail account itself. */
export function enquiryRecipient(fallback: string): string {
  const env = process.env;
  const own = env.GMAIL_USER || env.SMTP_USER;
  return (env.CONTACT_TO_EMAIL || own || fallback).trim();
}

/** The email telling the studio about a new enquiry. */
export function enquiryEmail(e: { name: string; email: string; phone: string; company: string; projectType: string; budget: string; timeline: string; message: string }) {
  const rows: [string, string][] = [
    ["Name", e.name],
    ["Email", e.email],
    ["Phone", e.phone],
    ["Company / production", e.company || "\u2014"],
    ["Project type", e.projectType],
    ["Budget", e.budget || "Not specified"],
    ["Timeline", e.timeline || "Not specified"],
  ];
  const text = `New enquiry from the website\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nDescription:\n${e.message}\n\nReply to this email to answer ${e.name} directly.`;
  const cells = rows
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#a89d8e;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#f4ede1">${esc(v)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1a0a10;font-family:Arial,Helvetica,sans-serif;color:#f4ede1">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1a0a10;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#261219;border:1px solid #4a2c35;border-radius:16px;padding:28px">
<tr><td style="color:#e8b04b;font-size:12px;letter-spacing:3px;text-transform:uppercase">Dolly Design Studio</td></tr>
<tr><td style="padding:12px 0 16px;font-size:20px;font-weight:bold">New enquiry from ${esc(e.name)}</td></tr>
<tr><td><table role="presentation" cellspacing="0" cellpadding="0">${cells}</table></td></tr>
<tr><td style="padding-top:18px;color:#a89d8e;font-size:13px">Description</td></tr>
<tr><td style="padding-top:6px;font-size:14px;line-height:1.7;color:#f4ede1;white-space:pre-wrap">${esc(e.message)}</td></tr>
<tr><td style="padding-top:20px;font-size:12px;color:#a89d8e">Reply to this email to answer ${esc(e.name)} directly.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `New enquiry \u2014 ${e.name} (${e.projectType})`, text, html };
}

/** Everyone who should be told about a new enquiry: the studio's inbox, plus every owner who has an email on their account. */
export function enquiryRecipients(studio: string, ownerEmails: string[]): string[] {
  return [...new Set([studio, ...ownerEmails].map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/.test(e)))];
}

/** The email a person at the studio writes back to someone who used the contact form, with their own words quoted below it. */
export function replyEmail(opts: { to: string; visitor: string; body: string; sender: string; original: { at: string; message: string; projectType: string } }) {
  const when = new Date(opts.original.at).toUTCString();
  const quoted = opts.original.message.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
  const text = `Hello ${opts.visitor},\n\n${opts.body}\n\n${opts.sender}\nDolly Design Studio\n\n—\nOn ${when} you wrote (${opts.original.projectType}):\n${quoted}`;
  const html = `<!doctype html><html><body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fff">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:15px;line-height:1.7;margin:0 0 14px">Hello ${esc(opts.visitor)},</p>
<p style="font-size:15px;line-height:1.7;margin:0 0 18px;white-space:pre-wrap">${esc(opts.body)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${esc(opts.sender)}<br><span style="color:#8a6a1e">Dolly Design Studio</span></p>
<div style="border-left:3px solid #e8b04b;padding:4px 0 4px 14px;color:#666;font-size:13px;line-height:1.6">
<div style="margin-bottom:6px">On ${esc(when)} you wrote (${esc(opts.original.projectType)}):</div>
<div style="white-space:pre-wrap">${esc(opts.original.message)}</div></div>
</div></body></html>`;
  return { text, html };
}

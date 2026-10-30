import { requestOriginMatches } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { clientIp, logActivity } from "@/lib/portal/activity";
import { addReply, getEnquiry } from "@/lib/contact/inbox";
import { enquiryRecipient, isMailConfigured, replyEmail, sendMail } from "@/lib/portal/mail";
import { isRateLimited } from "@/lib/rate-limit";
import { tooLarge } from "@/lib/portal/body-limit";
import { site } from "@/content/site";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Answer an enquiry from the portal: the words are emailed to the person who sent the contact form, from the studio's own
 * mail account. Their reply to it comes back to the studio's inbox. The answer is kept on the enquiry, sent or not.
 */
export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return fail("Your session has ended. Sign in again.", 401);
  if (me.setup) return fail("Create your own account first (Account), then you can reply from here.", 403);
  const origin = req.headers.get("origin");
  if (!origin || !requestOriginMatches(req)) return fail("Forbidden.", 403);
  const big = tooLarge(req, 64 * 1024);
  if (big) return big;
  if (isRateLimited(`reply:${me.id}`) || isRateLimited(`reply-ip:${clientIp(req.headers)}`)) return fail("You are sending a lot of replies. Try again in a few minutes.", 429);

  let body: { id?: unknown; subject?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Bad request.");
  }
  const id = typeof body.id === "string" ? body.id : "";
  const message = typeof body.message === "string" ? body.message.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim() : "";
  const enquiry = await getEnquiry(id);
  if (!enquiry) return fail("That enquiry no longer exists.", 404);
  if (message.length < 2) return fail("Write your reply first.");
  if (message.length > 5000) return fail("Please keep the reply under 5,000 characters.");
  const subject = (typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim() : "").slice(0, 150) || `Re: your enquiry (${enquiry.projectType})`;
  if (!isMailConfigured()) return fail("Email isn’t set up on this server yet, so the reply can’t be sent.", 503);

  // Sent from the studio's account; "Reply" in the visitor's mail app goes back to the studio's inbox.
  const studio = enquiryRecipient(site.contact.email);
  const mail = replyEmail({ to: enquiry.email, visitor: enquiry.name, body: message, sender: me.name || me.username, original: { at: enquiry.at, message: enquiry.message, projectType: enquiry.projectType } });
  const sent = await sendMail({ to: enquiry.email, replyTo: studio, subject, text: mail.text, html: mail.html });
  const saved = await addReply(id, { at: new Date().toISOString(), by: me.name || me.username, subject, body: message, sent: sent.ok, ...(sent.ok ? {} : { note: sent.message }) });
  await logActivity({ headers: req.headers, actor: me, action: "replied-enquiry", detail: `To ${enquiry.name}`, ok: sent.ok });
  if (!sent.ok) return NextResponse.json({ error: `${sent.message} Your words are saved below; you can send them again.`, enquiry: saved }, { status: 502 });
  return NextResponse.json({ ok: true, enquiry: saved });
}

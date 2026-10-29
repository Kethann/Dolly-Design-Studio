import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { deleteEnquiry, listEnquiries, setEnquiryStatus, type EnquiryStatus } from "@/lib/contact/inbox";
import { isMailConfigured } from "@/lib/portal/mail";

/** The enquiries sent through the contact form (portal only). */
export async function GET() {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  try {
    return NextResponse.json({ enquiries: await listEnquiries(), mailConfigured: isMailConfigured() });
  } catch (err) {
    console.error("[portal] could not read the enquiries", err);
    return NextResponse.json({ error: "Couldn\u2019t load the enquiries. Try again in a moment." }, { status: 500 });
  }
}

async function guard(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return null;
}

/** Mark an enquiry new, read or archived. */
export async function PATCH(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id, status } = (await req.json().catch(() => ({}))) as { id?: string; status?: EnquiryStatus };
  if (typeof id !== "string" || !status) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!(await setEnquiryStatus(id, status))) return NextResponse.json({ error: "That enquiry no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (typeof id !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!(await deleteEnquiry(id))) return NextResponse.json({ error: "That enquiry no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

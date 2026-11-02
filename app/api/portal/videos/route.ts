import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { requestOriginMatches } from "@/lib/request-origin";
import { logActivity } from "@/lib/portal/activity";
import { runImageWork, isImageBusyError } from "@/lib/portal/image-work";
import { store } from "@/lib/storage";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, readVideoBody, validatedVideoStream } from "@/lib/video";

export async function POST(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (req.headers.get("origin") && !requestOriginMatches(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const size = Number(req.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size <= 0 || !req.body) return NextResponse.json({ error: "Choose a video file and try again." }, { status: 411 });
  if (size > MAX_VIDEO_BYTES) return NextResponse.json({ error: `Videos can be up to ${MAX_VIDEO_MB} MB. Export a smaller MP4 clip.` }, { status: 413 });
  try {
    return await runImageWork(async () => {
      const { type, stream } = await validatedVideoStream(req.body!, size);
      const name = `${randomUUID()}.${type}`;
      const storage = await store();
      const contentType = type === "mp4" ? "video/mp4" : "video/x-matroska";
      if (storage.putStream) await storage.putStream(`uploads/videos/${name}`, stream, contentType);
      else await storage.putBytes(`uploads/videos/${name}`, await readVideoBody(stream, size), contentType);
      await logActivity({ headers: req.headers, actor: me, action: "uploaded-video", detail: name });
      return NextResponse.json({ src: `/media/videos/${name}` });
    });
  } catch (error) {
    if (isImageBusyError(error)) return NextResponse.json({ error: error.message }, { status: 503, headers: { "Retry-After": "2" } });
    if (error instanceof Error && /size changed|incomplete|valid MP4 or MKV/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[portal] video upload failed", error);
    return NextResponse.json({ error: "The video could not be saved. Try again." }, { status: 500 });
  }
}

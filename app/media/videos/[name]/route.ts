import { store } from "@/lib/storage";
import { videoRange } from "@/lib/video";

async function serve(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!/^[a-z0-9-]+\.(mp4|mkv)$/i.test(name)) return new Response("Not found", { status: 404 });
  const storage = await store();
  const key = `uploads/videos/${name}`;
  const size = await storage.size(key);
  if (size === null) return new Response("Not found", { status: 404 });
  const range = videoRange(req.method === "HEAD" ? null : req.headers.get("range"), size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const headers = new Headers({
    "Content-Type": name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/x-matroska",
    "Accept-Ranges": "bytes",
    "Content-Length": String(range ? range.end - range.start + 1 : size),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  if (req.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  const file = await storage.getStream?.(key, range ? { offset: range.start, length: range.end - range.start + 1 } : undefined);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body, { status: range ? 206 : 200, headers });
}
export const GET = serve;
export const HEAD = serve;

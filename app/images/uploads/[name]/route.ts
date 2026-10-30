import { serveUpload } from "@/lib/storage";

/** Pictures and fonts uploaded from the portal, served from storage (on Cloudflare they live in R2, not in a folder). */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const w = Number(params.get("w"));
  const q = params.get("q");
  return serveUpload("uploads/images/", name, Number.isFinite(w) && w > 0 ? w : undefined, q === null ? undefined : Number(q));
}

import { serveUpload } from "@/lib/storage";

/** Pictures and fonts uploaded from the portal, served from storage (on Cloudflare they live in R2, not in a folder). */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  return serveUpload("uploads/proof/", name);
}

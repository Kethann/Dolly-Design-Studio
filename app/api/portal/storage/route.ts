import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/content/store";
import { logActivity } from "@/lib/portal/activity";
import { getPortalUser } from "@/lib/portal/auth";
import { readIntroSettings } from "@/lib/portal/settings-store";
import { store } from "@/lib/storage";

/** What the site's storage holds, against its allowance, and a way to remove files nobody needs (portal only). */
const GB = 1024 * 1024 * 1024;
/** Cloudflare R2's free allowance is 10 GB; set STORAGE_LIMIT_MB to match your own plan or disk. */
function limitBytes(): number {
  const mb = Number(process.env.STORAGE_LIMIT_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 10 * GB;
}

interface GroupDef {
  id: string;
  label: string;
  /** Storage keys that belong to this group. */
  prefix: string;
  /** Where a file from this group is served on the site (so it can be shown and found in the content). */
  url?: string;
  /** Files in it can be removed here. */
  deletable: boolean;
  note?: string;
}

const GROUPS: GroupDef[] = [
  { id: "pictures", label: "Pictures", prefix: "uploads/images/", url: "/images/uploads/", deletable: true },
  { id: "fonts", label: "Fonts", prefix: "uploads/fonts/", url: "/fonts/uploads/", deletable: true },
  { id: "proof", label: "Slate pictures", prefix: "uploads/proof/", url: "/images/proof-table/", deletable: true },
  { id: "textures", label: "Star textures", prefix: "uploads/textures/", url: "/images/textures/", deletable: true },
  { id: "enquiries", label: "Enquiries", prefix: "data/inbox/", deletable: false, note: "Delete these from the Enquiries inbox." },
  { id: "activity", label: "Activity log", prefix: "data/activity/", deletable: false, note: "The record of who did what." },
  { id: "system", label: "Content & accounts", prefix: "", deletable: false, note: "The site's text, settings and the people who can sign in." },
];

const groupOf = (key: string) => GROUPS.find((g) => g.prefix && key.startsWith(g.prefix)) ?? GROUPS[GROUPS.length - 1];

/** Where in the site's content each picture or font is used, in plain words. */
function usesOf(content: unknown, urls: Set<string>): Map<string, string[]> {
  const found = new Map<string, Set<string>>();
  const label = (path: (string | number)[], root: Record<string, unknown>): string => {
    const [a, b] = path;
    const list = root[a as string];
    const item = typeof b === "number" && Array.isArray(list) ? (list[b] as Record<string, unknown>) : null;
    const name = item && typeof (item.title ?? item.name) === "string" ? String(item.title ?? item.name) : "";
    if (a === "projects") return name ? `Project “${name}”` : "A project";
    if (a === "breakdowns") return name ? `Breakdown “${name}”` : "A breakdown";
    if (a === "clients") return name ? `Client ${name}` : "A client";
    if (a === "collaborators") return name ? `Collaborator ${name}` : "A collaborator";
    if (a === "customFonts") return "The site's fonts";
    return `The ${String(a).replace(/([A-Z])/g, " $1").toLowerCase()} section`;
  };
  const walk = (v: unknown, path: (string | number)[], root: Record<string, unknown>) => {
    if (typeof v === "string") {
      if (urls.has(v)) (found.get(v) ?? found.set(v, new Set()).get(v)!).add(label(path, root));
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i], root));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, [...path, k], root);
  };
  if (content && typeof content === "object") walk(content, [], content as Record<string, unknown>);
  return new Map([...found].map(([k, set]) => [k, [...set]]));
}

export async function GET(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  try {
    const s = await store();
    const files = await s.sizes();
    const used = files.reduce((n, f) => n + f.size, 0);
    const limit = limitBytes();
    const base = { used, limit, percent: Math.min(100, (used / limit) * 100), where: s.kind === "r2" ? "Cloudflare storage" : "this computer" };
    if (req.nextUrl.searchParams.get("detail") !== "1") return NextResponse.json(base);

    const urls = new Set<string>();
    for (const f of files) {
      const g = groupOf(f.key);
      if (g.url) urls.add(g.url + f.key.slice(g.prefix.length));
    }
    // Where each file is used: the site's content, and the design settings (star textures and slate pictures live there).
    const uses = usesOf(await getContent(), urls);
    const settingsText = JSON.stringify(await readIntroSettings().catch(() => ({})));
    const groups = GROUPS.map((g) => {
      const mine = files.filter((f) => groupOf(f.key) === g);
      return {
        id: g.id,
        label: g.label,
        deletable: g.deletable,
        note: g.note ?? null,
        bytes: mine.reduce((n, f) => n + f.size, 0),
        count: mine.length,
        items: g.deletable
          ? mine
              .map((f) => {
                const name = f.key.slice(g.prefix.length);
                const url = g.url! + name;
                const usedBy = [...(uses.get(url) ?? [])];
                if (settingsText.includes(url)) usedBy.push("The design settings");
                return { key: f.key, name, url, bytes: f.size, usedBy };
              })
              .sort((a, b) => b.bytes - a.bytes)
          : [],
      };
    });
    return NextResponse.json({ ...base, groups });
  } catch (err) {
    console.error("[portal] could not measure the storage", err);
    return NextResponse.json({ error: "Couldn’t measure the storage right now." }, { status: 500 });
  }
}

/** Removes one uploaded file. The portal asks "are you sure?" first, and the request must say it was confirmed. */
export async function DELETE(req: NextRequest) {
  const me = await getPortalUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { key?: unknown; confirmed?: unknown };
  const key = typeof body.key === "string" ? body.key : "";
  if (body.confirmed !== true) return NextResponse.json({ error: "Confirm the deletion first." }, { status: 400 });
  // Only uploaded pictures, fonts and textures can be removed here: never content, accounts, enquiries or the log.
  if (!/^uploads\/(images|fonts|proof|textures)\/[\w.-]+$/.test(key) || key.includes("..")) {
    return NextResponse.json({ error: "That file can’t be deleted here." }, { status: 400 });
  }
  try {
    await (await store()).remove(key);
    await logActivity({ headers: req.headers, actor: me, action: "deleted-file", detail: key.slice(key.lastIndexOf("/") + 1) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[portal] could not delete a file", err);
    return NextResponse.json({ error: "Couldn’t delete that file. Try again." }, { status: 500 });
  }
}

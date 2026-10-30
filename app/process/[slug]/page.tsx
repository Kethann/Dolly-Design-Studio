import type { Metadata } from "next";
import { plainFx } from "@/lib/content/text-effects";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/store";
import { extraOf } from "@/lib/content/process";
import { ProcessView } from "@/components/ProcessView";
import { PREVIEW_PARAM } from "@/lib/intro/preview-protocol";
import { getPortalUser } from "@/lib/portal/auth";

/** The inside of a "How we work" card (its address is the card's own page name). Always read fresh: the portal adds and changes these. */
export const dynamic = "force-dynamic";

async function find(slug: string) {
  const { home } = await getContent();
  const i = home.process.cards.findIndex((c) => extraOf(c).slug === slug);
  return i < 0 ? null : { card: home.process.cards[i], page: extraOf(home.process.cards[i]) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const hit = await find((await params).slug);
  if (!hit) return {};
  return { title: `${plainFx(hit.card.title)} — How we work`, description: plainFx(hit.page.pageIntro.trim() || hit.card.body) };
}

export default async function ProcessPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const slug = (await params).slug;
  if (!(await find(slug)) && !(Object.hasOwn(await searchParams, PREVIEW_PARAM) && await getPortalUser())) notFound();
  return <ProcessView slug={slug} />;
}

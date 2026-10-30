import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/store";
import { extraOf } from "@/lib/content/process";
import { ProcessView } from "@/components/ProcessView";

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
  return { title: `${hit.card.title} — How we work`, description: hit.page.pageIntro.trim() || hit.card.body };
}

export default async function ProcessPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!(await find(slug))) notFound();
  return <ProcessView slug={slug} />;
}

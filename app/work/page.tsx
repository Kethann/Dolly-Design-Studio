import type { Metadata } from "next";
import { WorkPageBody } from "@/components/WorkPageBody";
import { getContent } from "@/lib/content/store";

export async function generateMetadata(): Promise<Metadata> {
  const { work } = await getContent();
  return { title: work.metaTitle, description: work.metaDescription, alternates: { canonical: "/work" } };
}

export default function WorkPage() {
  return <WorkPageBody />;
}

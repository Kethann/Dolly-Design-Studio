import type { Metadata } from "next";
import { BreakdownsPage } from "@/components/BreakdownsPage";
import { getContent } from "@/lib/content/store";

export async function generateMetadata(): Promise<Metadata> {
  const { breakdownsPage } = await getContent();
  return { title: breakdownsPage.metaTitle, description: breakdownsPage.metaDescription, alternates: { canonical: "/breakdowns" } };
}

export default function Page() {
  return <BreakdownsPage />;
}

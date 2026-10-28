import type { Metadata } from "next";
import { WorkGrid } from "@/components/WorkGrid";
import { getContent } from "@/lib/content/store";
import { tx } from "@/lib/content/tx";

export async function generateMetadata(): Promise<Metadata> {
  const { work } = await getContent();
  return { title: work.metaTitle, description: work.metaDescription };
}

export default async function WorkPage() {
  const { projects, work: workPage } = await getContent();
  const sorted = [...projects].sort((a, b) => a.order - b.order);

  return (
    <section style={{ paddingTop: "calc(var(--nav-h) + 56px)", paddingBottom: 120 }}>
      <div className="container">
        <span className="label gold-text" style={{ fontSize: 11, display: "block", marginBottom: 14 }} {...tx("work.label")}>
          {workPage.label}
        </span>
        <h1
          {...tx("work.title")}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(32px, 5vw, 56px)",
            margin: "0 0 48px",
          }}
        >
          {workPage.title}
        </h1>
        <WorkGrid projects={sorted} />
      </div>
    </section>
  );
}

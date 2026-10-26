import type { Metadata } from "next";
import { projects } from "@/content/projects";
import { WorkGrid } from "@/components/WorkGrid";
import { workPage } from "@/content/pages";

export const metadata: Metadata = {
  title: workPage.metaTitle,
  description: workPage.metaDescription,
};

export default function WorkPage() {
  const sorted = [...projects].sort((a, b) => a.order - b.order);

  return (
    <section style={{ paddingTop: "calc(var(--nav-h) + 56px)", paddingBottom: 120 }}>
      <div className="container">
        <span className="label gold-text" style={{ fontSize: 11, display: "block", marginBottom: 14 }}>
          {workPage.label}
        </span>
        <h1
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

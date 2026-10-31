"use client";

import { WorkGrid } from "@/components/WorkGrid";
import { useContent, tx } from "@/lib/content/context";
import { edSection } from "@/lib/content/tx";
import { renderFx } from "@/components/fx/render-fx";
import { NavigationTrail } from "./NavigationTrail";

/** The full gallery page. Reads the live content (so edits made in the portal's preview show as they are typed). */
export function WorkPageBody() {
  const { projects, work: workPage } = useContent();
  const sorted = [...projects].sort((a, b) => a.order - b.order);
  return (
    <section style={{ paddingTop: "calc(var(--nav-h) + var(--section-pad))", paddingBottom: "var(--section-pad)" }} {...edSection("work", "work-page", "All work")}>
      <div className="container">
        <NavigationTrail />
        <span className="label gold-text" style={{ fontSize: 11, display: "block", marginBottom: 14 }} {...tx("work.label")}>
          {renderFx(workPage.label)}
        </span>
        <h1
          {...tx("work.title")}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(32px, 5vw, 56px)",
            margin: "0 0 var(--section-head-gap)",
            overflowWrap: "anywhere",
          }}
        >
          {renderFx(workPage.title)}
        </h1>
        <WorkGrid projects={sorted} />
      </div>
    </section>
  );
}

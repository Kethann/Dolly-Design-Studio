import type { Metadata } from "next";
import { projects } from "@/content/projects";
import { FallingTitles, type TitleCard } from "@/components/FallingTitles";

// A design preview: not linked from the site, and kept out of search engines.
export const metadata: Metadata = {
  title: "Falling titles — preview",
  robots: { index: false, follow: false },
};

export default function FallingTitlesPreview() {
  const cards: TitleCard[] = [...projects]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ title: p.film, sub: p.category, image: p.images[0]?.src }));

  return (
    <section style={{ paddingTop: "calc(var(--nav-h) + 56px)", paddingBottom: 96 }}>
      <div className="container">
        <span className="label gold-text" style={{ fontSize: 11, display: "block", marginBottom: 14 }}>
          Collaborations
        </span>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(32px, 5vw, 56px)", margin: "0 0 12px" }}>
          Titles we have given a face
        </h1>
        <p style={{ margin: "0 0 32px", maxWidth: 560, color: "var(--muted, #b9ae96)" }}>
          Scroll here and the titles fall into place. Grab a card and throw it.
        </p>
      </div>
      <FallingTitles cards={cards} />
    </section>
  );
}

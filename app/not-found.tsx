import Link from "next/link";
import { getContent } from "@/lib/content/store";

export default async function NotFound() {
  const { notFound: notFoundPage } = await getContent();
  return (
    <section
      style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 20,
        padding: "0 20px",
      }}
    >
      <span className="label gold-text" style={{ fontSize: 11 }}>
        {notFoundPage.code}
      </span>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(28px, 5vw, 44px)", margin: 0 }}>
        {notFoundPage.title}
      </h1>
      <p style={{ opacity: 0.65, maxWidth: 420 }}>{notFoundPage.body}</p>
      <Link
        href="/"
        data-cursor="link"
        style={{
          marginTop: 12,
          fontFamily: "var(--font-label)",
          fontSize: 12,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--gold-bright)",
          borderBottom: "1px solid var(--gold)",
          paddingBottom: 4,
        }}
      >
        {notFoundPage.homeLink}
      </Link>
    </section>
  );
}

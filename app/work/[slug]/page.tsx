import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/store";
import { versionedSrc } from "@/lib/images";
import { ProjectView } from "@/components/ProjectView";
import { jsonLdText } from "@/lib/json-ld";
import { PREVIEW_PARAM } from "@/lib/intro/preview-protocol";
import { getPortalUser } from "@/lib/portal/auth";

export async function generateStaticParams() {
  const { projects } = await getContent();
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = (await getContent()).projects.find((p) => p.slug === slug);
  if (!project) return {};
  return {
    title: project.title,
    description: project.brief,
    openGraph: { title: project.title, description: project.brief, images: [{ url: versionedSrc(project.images[0]?.src || "/images/brand/og-image.jpg") }] },
  };
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { projects, site } = await getContent();
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    // Only an authenticated preview can open a newly added, unpublished card.
    if (Object.hasOwn(await searchParams, PREVIEW_PARAM) && await getPortalUser()) return <ProjectView slug={slug} />;
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    about: project.film,
    creator: { "@type": "Organization", name: site.name },
    datePublished: String(project.year),
    image: project.images.filter((i) => i.src).map((i) => versionedSrc(i.src)),
    description: project.brief,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }} />
      <ProjectView slug={slug} />
    </>
  );
}

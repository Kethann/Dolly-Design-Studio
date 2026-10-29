import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/store";
import { versionedSrc } from "@/lib/images";
import { ProjectView } from "@/components/ProjectView";

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
    openGraph: { title: project.title, description: project.brief, images: [{ url: versionedSrc(project.images[0].src) }] },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projects, site } = await getContent();
  const project = projects.find((p) => p.slug === slug);
  if (!project) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    about: project.film,
    creator: { "@type": "Organization", name: site.name },
    datePublished: String(project.year),
    image: project.images.map((i) => versionedSrc(i.src)),
    description: project.brief,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProjectView slug={slug} />
    </>
  );
}

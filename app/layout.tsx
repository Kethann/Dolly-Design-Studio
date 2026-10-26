import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Syne, Inter } from "next/font/google";
import { site } from "@/content/site";
import { SiteChrome } from "@/components/SiteChrome";
import { Footer } from "@/components/Footer";
import { versionedSrc } from "@/lib/images";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${site.name} — ${site.seo.titleSuffix}`, template: `%s — ${site.name}` },
  description: site.description,
  keywords: [...site.seo.keywords],
  authors: [{ name: site.founder.name }],
  openGraph: {
    title: `${site.name} — ${site.seo.titleSuffix}`,
    description: site.description,
    url: siteUrl,
    siteName: site.name,
    images: [{ url: versionedSrc("/images/brand/og-image.jpg"), width: 1200, height: 630 }],
    locale: site.seo.locale,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.seo.titleSuffix}`,
    description: site.description,
    images: [versionedSrc("/images/brand/og-image.jpg")],
  },
  alternates: { canonical: siteUrl },
};

export const viewport: Viewport = {
  themeColor: "#07060a",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: siteUrl,
  logo: `${siteUrl}${versionedSrc("/images/brand/logo.png")}`, // search engines need a raster (PNG/JPG) logo
  description: site.description,
  founder: { "@type": "Person", name: site.founder.name },
  email: site.contact.email,
  telephone: site.contact.phone,
  address: { "@type": "PostalAddress", addressLocality: site.contact.city, addressCountry: site.contact.countryCode },
  sameAs: site.social.map((s) => s.href),
};

// The intro only plays on the home page; on any other page, drop the black curtain before first paint.
const INTRO_SKIP_SCRIPT = `if(location.pathname!=="/")document.documentElement.classList.add("intro-skip")`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the pre-paint script below may add "intro-skip" to <html> before React hydrates.
    <html lang="en" className={`${bodoni.variable} ${syne.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SKIP_SCRIPT }} />
        <noscript>
          <style>{".intro-curtain{display:none}.site-main{opacity:1}"}</style>
        </noscript>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <SiteChrome>
          {children}
          <Footer />
        </SiteChrome>
      </body>
    </html>
  );
}

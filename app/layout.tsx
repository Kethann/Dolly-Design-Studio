import type { Metadata, Viewport } from "next";
import {
  Bodoni_Moda,
  Syne,
  Inter,
  Playfair_Display,
  Cormorant_Garamond,
  Space_Grotesk,
  Oswald,
  DM_Sans,
} from "next/font/google";
import localFont from "next/font/local";
import { jsonLdText } from "@/lib/json-ld";
import { GlassLight } from "@/components/GlassLight";
import { getContent } from "@/lib/content/store";
import { SiteChrome } from "@/components/SiteChrome";
import { Footer } from "@/components/Footer";
import { versionedSrc } from "@/lib/images";
import type { SiteContent } from "@/lib/content/types";
import { readIntroSettings } from "@/lib/portal/settings-store";
import "./globals.css";

// The studio's typeface: Lemon Milk. Bold for headings, Light for text, Regular Italic for subheadings.
const lemonBold = localFont({
  src: [{ path: "./fonts/LEMONMILK-Bold.otf", weight: "700", style: "normal" }],
  variable: "--font-lemon-bold",
  display: "swap",
});
const lemonLight = localFont({
  src: [{ path: "./fonts/LEMONMILK-Light.otf", weight: "300", style: "normal" }],
  variable: "--font-lemon-light",
  display: "swap",
});
const lemonItalic = localFont({
  src: [{ path: "./fonts/LEMONMILK-RegularItalic.otf", weight: "400", style: "italic" }],
  variable: "--font-lemon-italic",
  display: "swap",
});

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

// Extra typefaces the creator can pick in the portal. They only download when something actually uses them.
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-cormorant", display: "swap", preload: false });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald", display: "swap", preload: false });
const dmsans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap", preload: false });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getContent();
  const title = `${site.name} — ${site.seo.titleSuffix}`;
  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s — ${site.name}` },
    description: site.description,
    keywords: [...site.seo.keywords],
    authors: [{ name: site.founder.name }],
    openGraph: {
      title,
      description: site.description,
      url: siteUrl,
      siteName: site.name,
      images: [{ url: versionedSrc("/images/brand/og-image.jpg"), width: 1200, height: 630 }],
      locale: site.seo.locale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description: site.description, images: [versionedSrc("/images/brand/og-image.jpg")] },
    alternates: { canonical: siteUrl },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { background } = await readIntroSettings();
  return { themeColor: background, width: "device-width", initialScale: 1 };
}

const jsonLd = (site: SiteContent["site"]) => ({
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
});

// Runs before first paint: whenever the intro won't play, drop its curtain at once so the page shows instantly —
// on any page but home, when the intro is switched off, and when coming back to home within the same visit
// (a reload still plays it). Must agree with the checks in components/Intro.tsx. The portal preview decides itself.
const introSkipScript = (enabled: boolean) =>
  `(function(){if(location.search.indexOf("portal-preview")>=0){document.documentElement.classList.add("portal-preview");return}var seen=false;try{var n=performance.getEntriesByType("navigation")[0];seen=sessionStorage.getItem("dolly-intro-seen")==="1"&&!(n&&n.type==="reload")}catch(e){}if(location.pathname!=="/"||${!enabled}||seen)document.documentElement.classList.add("intro-skip")})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const introSettings = await readIntroSettings();
  const content = await getContent();
  return (
    // suppressHydrationWarning: the pre-paint script below may add "intro-skip" to <html> before React hydrates.
    <html
      lang="en"
      className={`${lemonBold.variable} ${lemonLight.variable} ${lemonItalic.variable} ${bodoni.variable} ${syne.variable} ${inter.variable} ${playfair.variable} ${cormorant.variable} ${space.variable} ${oswald.variable} ${dmsans.variable}`}
      style={{ "--stage": introSettings.background } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: introSkipScript(introSettings.enabled) }} />
        <noscript>
          <style>{".intro-curtain,.intro-loader{display:none}.site-main{opacity:1}"}</style>
        </noscript>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd(content.site)) }} />
        <SiteChrome introSettings={introSettings} content={content} footer={<Footer />}>
          {children}
        </SiteChrome>
        <GlassLight />
      </body>
    </html>
  );
}

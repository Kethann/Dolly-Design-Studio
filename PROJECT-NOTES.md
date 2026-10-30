# Dolly Design Studio — project notes

This guide is a quick map of what the website does, which technologies create
its effects, and where the related code lives. It is intended as an overview,
not a setup or deployment manual.

## What the website does

- **Home page (`/`)** — introduces the studio, then presents its statement,
  studio statistics, clients and collaborators, founder, project slate, work
  gallery, process, services, and contact form.
- **Work gallery (`/work`)** — displays projects with category filters.
- **Project pages (`/work/<slug>`)** — show project details, credits, artwork,
  deliverables, and links to the previous and next projects.
- **Breakdowns (`/breakdowns` and `/process/<slug>`)** — show project process
  breakdown material.
- **Creator portal (`/portal`)** — lets an authorized studio editor update site
  content, project media, and visual settings, including the intro. The portal
  is separate from the public site's navigation and visual effects.
- **Contact form** — validates an enquiry, saves it for the portal inbox, and
  sends an email to the studio.

## Which technology is used for what

| Technology | What it does here |
| --- | --- |
| **Next.js 16 App Router** | Routes, page rendering, metadata, image optimization, and server API endpoints. |
| **React 19** | Builds page sections and interactive parts such as filters, forms, and the creator portal. |
| **TypeScript** | Adds checked types to the site and its content structures. |
| **CSS / CSS Modules** | Layout, responsive styling, page transitions, hover effects, and many small animations. |
| **Three.js / WebGL** | Renders the 3D intro and the star-field background. It is not needed for the regular page layout. |
| **GSAP and ScrollTrigger** | Animates the light intro, pointer effects, and selected scroll-linked or scroll-triggered sections. |
| **Lenis** | Adds eased wheel scrolling and smooth programmatic navigation when reduced motion is not requested. |
| **Next Image / image loader / Cloudflare Images** | Serves appropriately sized project artwork where supported, with blurred previews and cache-busting image versions. |
| **Node.js APIs and Nodemailer** | Handle contact enquiries and studio email delivery on the server. |
| **OpenNext for Cloudflare** | Packages the Next.js app for Cloudflare deployment. |

## Intro, motion, and visual effects

- **Opening logo intro:** On a fresh home-page load, capable devices play an
  approximately eight-second, custom Three.js animation: faceted stars form
  the logo, a large star arrives, a reveal wave lights the logo, and the scene
  dissolves into the page.
- **Lightweight intro:** Reduced-motion visitors, devices that do not meet the
  3D device checks, and browsers without WebGL use a small GSAP/SVG rolling-star
  reveal instead. With reduced motion enabled, that version shows the logo
  without the rolling movement. The intro can be switched off in the portal;
  Escape jumps to its end.
- **Ambient star background:** A separate, dynamically loaded Three.js layer
  keeps stars and the premium backdrop behind the site's pages after the
  opening. The intro hands off its stars to this background.
- **Smooth scrolling:** Lenis runs in the site shell unless the visitor has
  enabled reduced motion. Menus and dialogs can freeze scrolling.
- **Scroll effects:** GSAP ScrollTrigger reveals process cards and synchronizes
  the manifesto's word lighting with scroll position. CSS handles most
  transitions, hover responses, and decorative looping effects.
- **Pointer and hover effects:** GSAP positions the poster-hover frame;
  the custom pen cursor follows the pointer directly and is disabled on touch
  devices and for reduced motion.
- **Motion preferences:** The site checks `prefers-reduced-motion` and disables
  or simplifies motion in the relevant interactions. The normal system cursor
  remains available when the custom cursor is not appropriate.

The intro shows a loading state while its 3D scene is prepared. If it is still
loading after five seconds, or does not finish by its hard stop, the page is
shown rather than keeping the visitor behind a blank screen.

## What helps it feel smooth and load faster

- The Three.js intro and page star field are **loaded on demand**, rather than
  being required for the initial page structure.
- The intro checks for reduced motion, WebGL, data-saver preference, processor
  count, and available device memory before choosing its 3D version.
- **Device pixel ratio is capped** for 3D canvases on lower-powered devices.
  The intro can step its rendering resolution down further if frames stay slow.
- Images can show a tiny blurred placeholder while loading. Project pages use
  responsive image sizing; on supported Cloudflare deployments, image
  variants can be resized for the visitor's screen.
- Image URLs include a content-based version so replacing an image does not
  leave the old image stuck in browser or CDN caches.
- The main page is built from separate sections, and interactive behavior is
  limited to client-side components that need it.

These are implementation choices intended to reduce unnecessary work; actual
loading and animation performance still depends on the device, browser,
network, and hosting setup.

## Where to look in the code

| Area | Main files |
| --- | --- |
| Routes and home-page order | `app/page.tsx`, `app/work/page.tsx`, `app/work/[slug]/page.tsx`, `app/breakdowns/page.tsx` |
| Shared site shell and global setup | `components/SiteChrome.tsx`, `app/layout.tsx` |
| Home-page sections | `components/sections/` |
| Intro choice and fallback | `components/Intro.tsx`, `components/IntroFirstLight.tsx` |
| 3D intro and its timing | `components/intro/StarIntro.tsx`, `lib/intro/timeline.ts` |
| Persistent star field | `components/Backdrop.tsx`, `components/StarField.tsx` |
| Scroll and motion preferences | `lib/smooth-scroll.tsx`, `lib/motion.tsx` |
| Device rendering budget | `lib/device-budget.ts`, `lib/intro/adaptive-quality.ts` |
| Work cards and project display | `components/WorkGrid.tsx`, `components/ProjectView.tsx` |
| Contact form and server handler | `components/sections/Contact.tsx`, `app/api/contact/route.ts` |
| Editable copy and project records | `content/` — see [`content/README.md`](content/README.md) |
| Portal | `app/portal/`, `app/api/portal/`, `lib/portal/` |
| Image metadata and helper functions | `scripts/build-image-manifest.mjs`, `lib/images.ts`, `lib/image-loader.ts` |

## Keywords and plain-language meanings

- **App Router** — Next.js's folder-based routing system used by this site.
- **Client component** — a React component that runs in the browser for
  interaction or animation; marked with `"use client"`.
- **Server component / server route** — code rendered or run on the server,
  such as page metadata and API handlers.
- **WebGL** — browser graphics technology used by Three.js to draw the 3D stars.
- **Lazy loading / dynamic import** — postponing a feature's code until it is
  useful, so it is not part of every page's initial work.
- **Device pixel ratio (DPR)** — how many rendered pixels are used for each
  screen pixel; lowering it reduces graphics work at the cost of some sharpness.
- **Adaptive quality** — lowering the intro's rendering resolution when
  sustained slow frames are detected.
- **Scroll-linked animation** — an effect whose progress follows the visitor's
  scroll position.
- **Scroll-triggered animation** — an effect that starts when its section
  enters the viewport.
- **Reduced motion** — an operating-system accessibility preference asking
  websites to minimize movement.
- **Responsive image** — an image delivered at a size appropriate to its
  display area, rather than always sending the largest source.
- **Blur placeholder** — a small preview shown until the full image arrives.
- **Cache-busting version** — a URL tag that changes when the image file
  changes, prompting browsers and CDNs to fetch the replacement.
- **SEO / metadata** — page titles, descriptions, social previews, and
  structured data used by search engines and link previews.
- **Portal** — the studio's private editor for website copy and visual settings.

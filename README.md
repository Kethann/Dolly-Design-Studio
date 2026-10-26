# Dolly Design Studio — website

A cinematic portfolio for Dolly Design Studio, built around the studio's own
pen-and-star logo: a pen-nib cursor (traced from the logo), a 3D star intro
that forms and reveals the real logo, and a gallery of real posters pulled
from the studio's portfolio.

Built with Next.js 16 (App Router) + TypeScript, GSAP for animation, Lenis
for smooth scroll, and three.js for the intro only (loaded on demand, so the
rest of the site stays light).

## Running it locally

```bash
cd site
npm install
npm run dev
```

Then open **http://localhost:3000**.

Other useful commands:

```bash
npm run build      # production build (also used by `npm run check`)
npm run start      # run the production build locally
npm run check      # images + typecheck + lint + build, all in one
npm run typecheck  # TypeScript only
npm run lint       # ESLint only
npm run images     # after adding/replacing images in public/images
```

## Where things are

```
site/
├── content/          ← ALL text, links and project data — edit here (see content/README.md)
│   └── generated/       made by scripts, don't edit
├── public/images/    ← every image: brand/, posters/<project>/, title-designs/
├── app/              pages (home, /work, /work/<project>, 404) and the contact-form API
├── components/       the building blocks of each page
│   ├── sections/        the home-page sections, top to bottom
│   ├── intro/           the 3D star intro
│   └── cursor/          the pen cursor
├── lib/              helpers (motion settings, smooth scroll, images, intro maths)
└── scripts/          build-image-manifest.mjs (run by `npm run images`)
```

**To change any wording, link, image or project, you only need `content/` and
`public/images/` — the step-by-step guide is in
[`content/README.md`](content/README.md).**

## The intro

Every time the home page is loaded (about 10 seconds):

1. A gold glint of "first light" flares where the logo will be.
2. Faceted 3D stars — gold, silver and pearl white — fly in from the corners
   at different depths (far ones small, near ones large), shedding fine
   glitter along their paths, and settle into random slots of the real logo.
   Only some of them glow.
3. A big gold star swoops in trailing sparkles, lands on the logo, flips to
   catch the light, then rolls across it — the crisp logo is revealed in its
   wake.
4. The star docks into the logo's own star with a flash, a sheen of light
   sweeps across the logo, and the intro hands over to the page. The 3D logo
   is aligned pixel-for-pixel with the page logo, so the hand-off is seamless.

There is no skip button; keyboard users can press **Esc** to jump to the end.
It doesn't replay when moving around inside the site, and links straight to
another page (e.g. a project) open that page directly.

Touch devices, visitors with "reduce motion" turned on, and browsers without
WebGL get a lightweight version instead (a star rolling across the logo).

The code lives in `components/intro/StarIntro.tsx`. The timing of every beat
is in `lib/intro/timeline.ts`, the big star's path in
`lib/intro/big-star-path.ts`, and the other stars' paths and colours in
`lib/intro/choreography.ts`.

## Editing content

See [`content/README.md`](content/README.md) for a table of which file
changes which text, and step-by-step instructions for adding posters and
projects. Testimonials go in `content/clients.ts` — the block on the home
page stays hidden until there's at least one.

## Contact form email delivery

The contact form posts to `/app/api/contact/route.ts`. By default (no
`RESEND_API_KEY` set) it just logs submissions to the terminal — handy for
local development.

To send real emails:

1. Create a free account at [resend.com](https://resend.com) and get an API
   key.
2. Copy `.env.example` to `.env.local` and fill in:
   ```
   RESEND_API_KEY=your-key-here
   CONTACT_TO_EMAIL=dollydesignstudios@gmail.com
   ```
3. Restart the dev server.

The form also has a honeypot field and a simple rate limit built in, so it's
safe to put live without extra setup.

## Deploying

This is a standard Next.js app — it deploys to **Vercel** with zero config
(`vercel.com/new`, pick this repo, done), or any host that runs Next.js.
Before going live:

1. Set `NEXT_PUBLIC_SITE_URL` to the real domain (used for SEO, the sitemap
   and social preview images).
2. Set the `RESEND_API_KEY` / `CONTACT_TO_EMAIL` env vars if you want the
   contact form to send real emails (see above).
3. Run `npm run check` once locally to make sure everything still builds
   cleanly.

## What's deliberately simple, and why

- **WebGL only where it earns its place.** three.js powers the intro and is
  downloaded only by visitors who get it; the rest of the site is plain
  HTML/CSS, so it loads fast and works everywhere.
- **No separate CMS (Sanity/Payload).** Projects, services and site text live
  in readable TypeScript files under `content/`. For a studio updating its
  own portfolio a few times a month, editing a file and redeploying is
  simpler and more reliable than running a second service — and nothing here
  stops a real CMS from being added later if the studio outgrows this.
- **The Process section** uses real poster stages from one showcase project
  rather than invented sketch/concept art the studio didn't provide — see
  the `[CLIENT TO PROVIDE]` note in `content/clients.ts` for the one optional
  piece (testimonials) left for the studio to fill in with real quotes.

## Accessibility & performance notes

- The page is always fully visible — nothing is hidden behind cursor effects.
  The pen cursor is a mouse-only nicety; touch devices and reduced-motion
  visitors get the normal system cursor.
- All images are served as responsive AVIF/WebP via `next/image`, with
  blur-up placeholders generated at build time.
- Every page has real semantic HTML underneath the animation — screen
  readers and search engines see normal headings, links and alt text.

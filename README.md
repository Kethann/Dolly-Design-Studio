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
npm run check      # typecheck + lint + regression tests + production build
npm test           # automated regression tests; no real email or publishing
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

**Use `/portal` for current wording, media and project changes.** The files in
`content/` provide defaults and local saved content; see
[`content/README.md`](content/README.md) for the distinction.

For an overall guide to the site's features, animation, performance choices,
and technology keywords, see [`PROJECT-NOTES.md`](PROJECT-NOTES.md).
For the cleanup results and before/after comparison, see [`CLEANUP-REPORT.md`](CLEANUP-REPORT.md).

## The intro (V1)

Every time the home page is loaded (about 8 seconds):

1. Faceted 3D stars — gem-cut, with a brushed-metal finish — stream in from
   the corners at different depths (far ones small, near ones large) from the
   very first frame, shedding fine glitter, and settle into random slots of
   the real logo. Some of them glow, in their own colour, on their facets.
2. A big gold star flies in out of deep space and sets down exactly on the
   logo's own star, springs to rest, and starts to shiver.
3. The shiver releases into a wave that ripples out across the logo,
   revealing the crisp logo as it goes; the formation stars ride the wave
   and dissolve into glitter. The big star flattens into the logo's star.
4. A sheen sweeps the logo, a dark tinted glass settles over the background
   stars, and the intro dissolves into the page. A few of the background stars
   stay behind the glass: they float like stars on water (nearer ones bigger
   and crisp, farther ones smaller and soft), the cursor sends ripples through
   them, and one or two big stars turn slowly in the corners.

There is no skip button; keyboard users can press **Esc** to jump to the end.
It doesn't replay when moving around inside the site, and links straight to
another page (e.g. a project) open that page directly.

Visitors who prefer reduced motion, browsers without WebGL, and touch devices
that do not meet the device checks get a lightweight version instead. Capable
phones and tablets can play the 3D version too.

The code lives in `components/intro/StarIntro.tsx` (the intro) and
`components/StarField.tsx` (the stars that stay). The timing of every beat is
in `lib/intro/timeline.ts`, the big star's path and the wave in
`lib/intro/big-star-path.ts`, and the other stars' paths in
`lib/intro/choreography.ts`.

## The creator portal

The studio manages content, media, accounts and visual settings from **`/portal`**.
The intro and appearance controls include:

- background colour of the page and intro, and the dark tinted glass over the
  background stars (tint colour, opacity, blur)
- a premium gradient backdrop (or plain colour): style (waves, silk, halo,
  minimal), second colour, line colour, line strength, depth, movement, and a
  new random arrangement at a click
- two star layers on the page: in front of the glass (sharp unless blurred)
  and behind it (depth blur), each with its own count and size, plus one or
  two big corner stars with their own size
- glow intensity (100% = the original intro), glow colour (or each star's own
  colour), share of glowing stars, star size, facet depth, metallic texture
- star colours: add or remove colours and set each colour's share of the stars
- number of formation stars and the depth of space
- the stars that stay after the reveal: how many, their floating motion, how
  strongly the cursor ripples them, depth blur, and the big corner stars
- switching the intro off, and a **Randomize** button for trying new looks

Every change shows instantly in a live preview of the real home page. Drag the
timeline to hold any moment of the intro while adjusting. Nothing reaches
visitors until **Save & publish**.

Settings are stored in `content/intro-settings.json` (it can also be edited
by hand).

**Setting it up:** configure `PORTAL_SECRET` for session signing and the account
setup/recovery settings in `.env.example`. Existing accounts do not require the
setup password to remain present when a signing secret is configured. Keep the
studio mailbox settings intact for recovery and enquiries.

**Storage:** local development uses files; the configured Cloudflare deployment
uses R2 for content, accounts and uploaded media. The storage adapter is in
`lib/storage.ts`. See `DEPLOY.md` for the deployment configuration.

## Versions and undoing changes

The site is a git repository. Each intro change is its own commit, so any
single change can be undone with `git revert <commit>`, and named versions
are tagged:

- `intro-v0-original` — the original intro (roll-across reveal)
- `intro-v1` — this version

`git log --oneline` lists the changes. To look at the original again,
`git checkout intro-v0-original` (and `git checkout master` to come back).

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

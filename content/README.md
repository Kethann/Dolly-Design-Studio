# Editing the website's content

Everything you can read on the website lives in this folder. Change the text
between the quotes `"…"`, save, and the site updates (instantly with
`npm run dev`; after `npm run build` for the live site). You never need to
touch the `components/` or `app/` folders to change wording, images or links.

## Which file changes what

| What you want to change | File | Look for |
| --- | --- | --- |
| Studio name, email, phone, WhatsApp, location | `site.ts` | `contact` |
| Instagram / X / IMDb / Behance links | `site.ts` | `social` |
| Top menu labels | `site.ts` | `navItems` |
| Google / WhatsApp share preview text | `site.ts` | `description`, `seo` |
| Words under the logo at the top of the home page | `home.ts` | `hero` |
| The big "Let us be the cover page…" statement | `home.ts` | `manifesto` |
| "Selected work" heading and link | `home.ts` | `gallery` |
| "How a poster is built" text, its 4 stages, and which project it uses | `home.ts` | `process` |
| "Services" heading | `home.ts` | `services` |
| The numbers (4+ years, 10+ films…) | `home.ts` | `clients.stats` |
| Contact headline, form labels, dropdown options, messages | `home.ts` | `contact` |
| The services list (names, descriptions, hover poster) | `services.ts` | |
| Client and collaborator names, testimonials | `clients.ts` | |
| Projects: titles, credits, descriptions, images, order, featured | `projects.ts` | |
| Work page heading, filter "All" label | `pages.ts` | `workPage` |
| Project page labels ("Back to work", "Client", "Role") | `pages.ts` | `projectPage` |
| "Page not found" page | `pages.ts` | `notFoundPage` |
| Footer text | `pages.ts` | `footer` |
| Category names (also the Work page filter buttons) | `types.ts` | `CATEGORIES` |

`generated/` holds files made by scripts (the traced logo, the pen-nib cursor
and the image-size list). **Don't edit those by hand.**

## Images

All images are in `public/images/`:

```
public/images/
├── brand/
│   ├── logo.png      the logo, transparent background, 3000px wide — use this to share or send
│   ├── logo.svg      the same logo as a vector — what the website itself displays (always sharp)
│   └── og-image.jpg  the preview picture shown when a link to the site is shared
├── posters/
│   └── <project>/    01-….jpg is the cover, then 02-…, 03-… in display order
└── title-designs/    the title-logo collection
```

Every poster and title design is a standard JPG — open, share or send them
like any photo. They're at the highest resolution available in the original
portfolio PDF. If you have the original high-resolution exports, drop them in
with the **same file names**; the site picks up the sharper versions
automatically. Replacing a file is always safe — see "Why replacing an image
just works" below.

### Adding or replacing a poster

1. Put the image in `public/images/posters/<project-slug>/`, named like the
   others: a two-digit number, then a short description —
   e.g. `05-dacoit-teaser-poster.jpg`. Use JPG for posters (PNG only if it
   needs transparency).
2. **Replacing** an existing file: that's it — refresh the page (see below if
   it's the live, built site rather than `npm run dev`).
   **Adding** a new file: add it to that project's `images` list in
   `projects.ts`:
   ```ts
   { src: "/images/posters/dacoit/05-dacoit-teaser-poster.jpg", alt: "Describe what's in the poster" },
   ```
   The first image in the list is the cover. Always write a real `alt`
   description — it's read out to blind visitors and helps Google.

### Adding a new project

1. Create `public/images/posters/<new-slug>/` and add its images.
2. In `projects.ts`, copy an existing project block, paste it, and edit every
   field. The `slug` must match the folder name and becomes the web address
   (`/work/<new-slug>`). `category` must be one of the names in `types.ts`.
   Set `featured: true` to show it on the home page; `order` sets its
   position (lower = earlier).

### Why replacing an image just works

Every image on the site is addressed with a short tag based on its own file
contents (`…jpg?v=45154c66ea`), not just its name. Replace the file and the
tag changes automatically, so visitors — and the website's own caching — can
never be shown an old version by mistake; a replaced poster appears the
moment the page is refreshed.

That tag comes from `content/generated/image-manifest.json`, which is rebuilt
automatically every time the site is built (`npm run build`, or whatever your
host runs to publish it). While running locally with `npm run dev` it's kept
up to date too, but only if you run `npm run images` after replacing a file —
dev mode doesn't rebuild it for you. Either way, nothing to remember when
publishing a change: building the site always picks up the latest images.

## Formatting notes

- Keep the quotes and the comma at the end of each line.
- To use an apostrophe inside text, the typographic one `’` is safest
  (e.g. `Let’s`), so it doesn't clash with the quotes.
- In the manifesto statement, wrap words in `*asterisks*` to set them in gold
  italic.
- After editing, `npm run check` confirms everything is still valid.

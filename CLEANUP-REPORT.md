# Cleanup and progress comparison

Author: Kethan

This compares the issues reported and reproduced during the local work with the
current implementation. It is not a claim that every device or production service
has been tested.

## Final cleanup

- Removed the unused `Making.tsx`, `Making.module.css`, and `content/bts.ts`.
  An import-graph scan and reference search confirmed that the old section was
  disconnected. The current Photos & BTS cards and video player remain active.
- Removed the stale generated `.open-next/` output: 1,709 files, 33,722,110 bytes
  (32.2 MiB). `npm run cf:build` regenerates it when needed; no deployment ran.
- Removed the zero-byte `data/backups/content` artifact. Actual recovery data
  under `.data` and the media backup folders outside `site` were retained.
- Removed trailing blank lines from the image-label helper.
- Corrected documentation about saved content, image limits/resizing, SMTP,
  account setup, and R2 storage.
- Added `npm test` and included it in `npm run check`, so the regression suite is
  part of the standard validation command.
- Corrected two Turbopack filesystem-tracing warnings: upload size checks and
  streaming reads now declare that their files come from runtime storage rather
  than asking the bundler to trace the entire project.
  The portal route's traced file count fell from 440 to 146; the video-serving
  route's count fell from 406 to 112. These are build-trace counts, not RAM measurements.

The active content JSON is loaded through the storage adapter, rather than a
static import, and must remain. The optional `pages-front/` forwarding app,
dependencies, regression tests, brand assets, fonts, intro assets and live
development files were also retained.

## Earlier state compared with the current implementation

| Area | Earlier issue | Current behavior |
| --- | --- | --- |
| Section spacing | Adjacent section padding created large, inconsistent gaps; desktop padding reached 72px per side. | Shared padding scales from 24px to 40px; heading gaps and content edges are aligned. |
| Phone and tablet layout | Long headings and narrow form/grid columns could overflow. | Wrapping, grid sizing, form widths and project navigation have responsive bounds. |
| Portal return navigation | “Back to work” looked clickable but a preview CSS rule blocked pointer input. | The restriction is removed; desktop clicks and phone taps return to Work with preview editing intact. |
| Gallery controls | Small filters used tab semantics without matching tab keyboard behavior. | Filters have 44px touch targets, pressed states, and ordinary button keyboard behavior. |
| Card editing | Editing, opening a card, and adding/reordering entries needed clearer separation. | Explicit Edit controls, normal card navigation, Add controls and drag/keyboard reorder are implemented. |
| Media selection | File-name selection and individual deletion were cumbersome. | Visual media selection, select-all/custom selection and bulk deletion are available; protected brand/intro media stay excluded. |
| Clean template | Uploaded artwork was mixed into the initial portfolio. | The earlier media reset retained text and records, with recoverable backups; no further content reset occurred in this cleanup. |
| Image quality | Uploaded image variants ignored page-requested quality; some size hints did not match layouts. | Quality is forwarded and cached separately; responsive selection accounts for card layout and display density. |
| Image positioning | Hover transforms could conflict with saved zoom/crop transforms. | Interaction scale is separate from saved crop positioning and zoom. |
| Photos & BTS | Photo cards needed video support and adaptable captions. | MP4/MKV upload and video cards are implemented; frames adapt to video dimensions and captions remain below. Codec support still depends on the browser. |
| Motion and memory | Continuous work and unbounded image/canvas processing could waste resources. | Particle/canvas budgets, offscreen cleanup, bounded image/PSD processing and visibility-aware animation reduce unnecessary work. |
| Portal reliability | Authentication, uploads, storage actions and draft flows needed stronger failure handling. | Regression coverage includes auth/recovery, duplicate-upload prevention, stale callback handling, storage failures and draft navigation. |

## Verification

- Earlier targeted browser checks covered home-page spacing at eight viewport
  sizes from 280px to 1920px, including landscape.
- Gallery filtering, reset and project navigation passed at five viewport sizes.
- Image fixtures passed 1×, 2× and 3× density checks. For a roughly 600px card,
  the browser selected 640px at 1× and 1280px at 2× in the tested configuration.
- Portal Back to work passed actual mouse and touch input tests; the process
  return link also reached its target section.
- The final cleanup passed TypeScript, full ESLint and all 70 automated tests.
- The corrected production build completed with no warning/error markers and
  generated all 43 static-page tasks. Targeted lint also passed after the tracing fix.
- A temporary local production server returned 200 for Home, Work, a project,
  Photos & BTS, Breakdowns and the portal. The media API rejected an unsigned
  request with 401, the content API rejected unsupported GET with 405, and
  missing media returned 404. The temporary server was stopped; the development
  server remains available at `http://localhost:3000`.

The 32.2 MiB cleanup figure is disk space, not measured runtime RAM savings.
There is no controlled whole-site before/after RAM or speed percentage. Low-
resolution source images cannot gain missing detail through higher quality
settings. Live CDN processing and real email delivery need environment-specific
verification; tests here do not send real email or deploy.

The intro, studio logo and existing mailbox configuration were preserved.
No commit, push or deployment was performed during that cleanup audit.

## Release preparation — 30 October 2026

The subsequent release was authorized with Kethan as the sole author. Video uploads
now accept up to 50 MiB, with exact-size validation and the shared media-work gate.
The audit findings were addressed: OTP changes use conditional R2 writes, section
navigation preserves preview query parameters, and multipart uploads enforce a
byte limit while reading their bodies.

Release validation: TypeScript, full ESLint, 73 automated tests, the Cloudflare
OpenNext build, a native local R2 conditional-write check, and browser verification
of the repaired service-to-contact-to-process preview navigation all passed.
Live content is backed up separately before applying the requested clean-media,
service-category, process-heading and LinkedIn changes. Account and mail settings
are not part of that content update.

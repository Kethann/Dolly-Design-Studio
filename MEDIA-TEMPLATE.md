# Clean media template

The image slots are empty; project records, image captions, client and collaborator names, breakdown layer labels, slate entries, and all other text are retained. Replace a slot through the portal and publish normally. Empty slots render without broken image requests.

The DDS logo files, brand/share images, fonts, opening animation, star textures, and background settings are preserved. Only the slate's picture fields change inside `content/intro-settings.json`; the slate is a separate page section from the opening animation.

## Local recovery copy

Before clearing the template, the original content and 83 content media files were saved outside `site/`, in `../media-template-backup-2026-10-30/`. Its `content/` directory contains the original text and media references; `public-images/` contains the removed media folders. This archive is not deployed.

## Existing live portal

An existing deployment reads saved content and uploads from R2. Deploying the template does not erase that data automatically.

After this version is deployed, sign in with an owner account, open **Pictures**, and use **Start with clean media → Review media reset**. Publish or discard other edits first. The review requires typing `CLEAR MEDIA` and publishes the reset immediately.

The reset keeps text and all record slots, clears ordinary content image fields and slate picture fields, and archives ordinary uploaded images before removing them from the library. It preserves files referenced by the intro/background, all star textures, fonts, account records, enquiries, and branding. It does not run during deployment or on future uploads.

Recovery copies are stored under the path displayed after the reset: `data/backups/media-reset/<id>/`. `snapshot.json` contains the earlier content/settings and the list of original storage keys. `files/<original-key>` contains each archived upload. These archives continue to use storage so that the reset is recoverable. On a filesystem host, `data/` storage keys map to `.data/`.

To recover, restore archived files to the original keys listed in `snapshot.json`, then restore its `content` and `settings` objects to `content/site-content.json` and `content/intro-settings.json`. Recovery replaces subsequent edits, so it should be performed deliberately by an administrator. The existing live site is not changed until the owner runs the reset.

## Verification

Run `node --test tests/media-template.test.mjs`, `npm run typecheck`, `npm run lint`, and `npm run build` from `site/`. The reset tests use an in-memory storage mock and do not touch live data.

The regression checks also cover unreadable/corrupt saved documents, captions that contain image paths, and fresh content reads after another Cloudflare Worker publishes. A reset clears portal undo history so Undo cannot restore references to removed files. New uploads become removable in the library immediately.

## Performance follow-up

Client portraits/logos and the fallback slate now request responsive image sizes. Both ordinary uploads and slate uploads use the R2 image-resizing route. These smaller responses depend on the Cloudflare Images binding; without it, the original image is still served. Bundled responsive images use a quality and widths allowed by the Next configuration.

Distant, closed breakdowns remove their rendered image layers. Open, fullscreen and actively dragged artwork stays mounted because zoom and pan can move it outside its original bounds. Spinning pauses in hidden tabs and resumes without jumping. Aspect-ratio probes detach their load handlers during cleanup, and their metadata cache is bounded. Browser upload conversion releases bitmaps and canvas pixels on success and failure.

On hosts with Sharp, uploads over 40 million decoded pixels are refused with an export-smaller message. This uses Sharp's [documented pixel limit](https://sharp.pixelplumbing.com/api-constructor/#parameters); it is an input guard, not a guarantee of a particular memory ceiling. Cloudflare's existing upload and image-binding path remains separate.

Run the regression suite for resize routing, conversion cleanup, oversized-image rejection and retained transparency. Actual frame rates, device memory use, and the revised empty-artwork styling still need browser/device verification; no measured performance gain is claimed.

# Glass title circle

The homepage's `collaborations` section uses a transparent glass circle, not the previous silver CD. Existing uploaded titles, order, project links, intro and studio logo are preserved. Internal `disc` names remain for saved-content compatibility.

## Composition and motion

- The complete small circle holds its size (not its rotation) for the first 12% of the entrance, then approaches once and expands into a large arc behind the heading. `glassCircleComposition` defines separate phone, tablet and desktop framing.
- Rotation is visible throughout the entrance: a 4× speed multiplier eases continuously to the saved speed at landing, without stopping or resetting the angle. Only position and scale settle; the glass keeps turning. Pause freezes both entrance and rotation, and release after dragging restores automatic spin smoothly.
- Title PNGs stay rigidly attached to the rotating glass. There are no opaque cards, clock marks, metallic backing, generated captions or centre hole.
- A steady diagonal projector enters from above the desktop/tablet scene and the upper outside corner on phones. `glassProjectorOrigin` keeps the source above the frame even when editing offsets. A fixed surface-space window illuminates only the title pixels currently passing through it. The beam returns to neutral cool light over empty glass.
- A slim bevel and broad, low-energy lamp reflection give the pane a glass surface without adding a clock, metallic reflections or another mesh. The reflection stays anchored to the lamp while subtle surface variation rotates.
- A subtle neutral-black tint fills the same pane; the existing glass visibility control adjusts its density. The light-contact sheen is confined to the projector footprint. Airborne haze softens before landing so the coloured logo, not a white patch, stays visible. Tint and reflection share the original mesh and rendering budget.
- Colour uses an 8×8 pigment grid per image, sampled once at load. Each frame only the overlapping pigment contributes; there are no per-frame canvas reads. The same ray uniforms drive the volume, dust and surface reflection.
- The heading region stays dim. Screen edges and the departing part of the section feather through the existing antialias pass. Scroll updates are coalesced into one animation frame and do not rerender React.
- Hover gently lifts a title without stopping rotation. Click opens the existing movie-detail dialog; the glass and attached titles keep rotating behind it. Close or Escape dismisses only the dialog. The View the work link and non-WebGL collection fallback remain available.
- Hold and drag the glass to turn it in either direction; release eases back to its configured speed over half a second. Titles remain attached and pass through the same fixed light window. Small taps still open details, but dragging never does. On touchscreens, swipe sideways to rotate; vertical gestures retain native page scrolling. Manual rotation also works while paused or with reduced motion, without enabling automatic movement.

## Portal controls

Under **Glass title circle**, edit arrival duration, rotation speed, circle size, glass visibility, tilt, projector, glow and artwork settings. Beam aim has separate desktop (1025px+), tablet (641–1024px) and mobile (up to 640px) values. Calibration guides appear only in portal preview.

The first eight saved entries occupy equally spaced positions; additional entries stay saved in the editor. PNGs preserve their aspect ratio. Resetting appearance never changes images or their order. `glassVersion: 1` migrates old CD angles and beam coordinates to the reference composition once, retaining artwork, colours, ordering and light preferences.

## Rendering budget and fallback

- Lazy-loaded near the viewport; sleeps off-screen and in hidden tabs.
- Reduced motion skips the entrance and continuous movement. Pause freezes the circle and rays; scroll feathering and explicit setting changes still work.
- DPR capped at 2, plus a 1.6-million-pixel framebuffer ceiling (800,000 on coarse-pointer/low-core devices). Sustained slow frames reduce quality further.
- Targets 60 fps on desktop and 30 fps on lower-power devices; these are targets, not guaranteed device performance.
- Sequential image decoding; at most four million base texture pixels across eight images, plus mipmaps.
- One glass mesh with an analytic bevel. No environment capture, metallic geometry stack, shadow maps, transmission framebuffer or separate blur scene.
- Bounded bloom/FXAA buffers; observers, requests, frames, geometry, materials, textures and targets disposed on removal. Context loss switches to a collection fallback.

## Local verification and standalone demo

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.

`node tests/glass-browser.mjs` tests a local development server on port 3000 using an **isolated** headless Chromium debugging port 9227. It checks entrance, scrolling, viewport overflow, reduced motion and title-dialog interactions. Sample PNGs are served by request interception inside that test; no content files, media library or live service are modified. Screenshots go into the OS temporary `dds-glass-qa` directory.

Run `node scripts/build-disc-demo.mjs` after changing `scene.ts` or `lib/content/disc.ts`. `/disc-hero/index.html` is the generated single-file demo with pinned CDN modules, lil-gui and transparent sample titles. Remote images require CORS permission. The demo uses a black backdrop; the website retains its existing page backdrop.

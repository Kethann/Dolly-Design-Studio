# Glass title circle

The homepage's `collaborations` section uses a transparent glass circle, not the previous silver CD. Existing uploaded titles, order, project links, intro and studio logo are preserved. Internal `disc` names remain for saved-content compatibility.

## Composition and motion

- The complete small circle holds its size (not its rotation) for the first 12% of the entrance, then approaches once and expands into a large arc behind the heading. The stage spans the full section width independently of the copy container. `glassCircleComposition` fits the tilted rim to the reference's upper-right, middle-right and lower-middle landmarks across desktop/tablet aspect ratios; phone framing is preserved. Copy height does not change canvas dimensions.
- Entrance opacity eases from transparent to visible over the first 22% of the approach. Rotation gathers gently from 0.6× to 2.4× saved speed, then settles to 1× without stopping or resetting its angle. Quintic easing gives the fades and rotation hand-offs zero slope and acceleration at their endpoints. Pause freezes both entrance and rotation.
- Title PNGs stay rigidly attached to the rotating glass. There are no opaque cards, clock marks, metallic backing, generated captions or centre hole.
- A steady diagonal projector enters from above the desktop/tablet scene and the upper outside corner on phones. `glassProjectorOrigin` keeps the source above the frame even when editing offsets. A fixed surface-space window illuminates only the title pixels currently passing through it. The beam returns to neutral cool light over empty glass.
- One thin antialiased edge reflection gives the pane a glass surface, without secondary lips, shoulders or concentric rings. The reflection stays anchored to the lamp while subtle surface variation rotates. A wider quintic feather blends the copy-side and bottom into transparency after bloom, fading both colour and alpha. Its CSS-pixel bounds are independent of DPR/render quality; the opposite and top edges keep their narrow fades. The circle, title transforms and main lower sweep are unchanged, with no extra ring, mesh or render target.
- A subtle neutral-black tint fills the same pane by default. The portal's **Glass tint** group controls its colour, opacity and colour softness; RGB changes ease without rebuilding geometry or textures. The **Shadow behind the glass** group independently controls backdrop colour, opacity and spread, using the existing feathered CSS layer. Zero opacity removes the respective tint/backdrop, and each group can reset without changing motion or artwork. These values persist in `proofTable.disc`; old documents receive the original appearance defaults.
- The light-contact sheen is confined to the projector footprint. Airborne haze softens before landing so the coloured logo, not a white patch, stays visible. Tint and reflection share the original mesh and rendering budget.
- Colour uses an 8×8 pigment grid per image, sampled once at load. Each frame only the overlapping pigment contributes; there are no per-frame canvas reads. The same ray uniforms drive the volume, dust and surface reflection.
- The heading region stays dim. Entrance and departing-section opacity feather premultiplied colour and alpha through the existing antialias pass, with no added render targets. Scroll fades ease in both directions without replaying the entrance. Updates are coalesced into one animation frame and do not rerender React.
- Hover gently lifts a title without stopping rotation. Click opens the existing movie-detail dialog; the glass and attached titles keep rotating behind it. Close or Escape dismisses only the dialog. The View the work link and non-WebGL collection fallback remain available.
- Hold and drag the glass to turn it in either direction; release or resume eases back to its configured speed over 0.65 seconds. Titles remain attached and pass through the same fixed light window. Small taps still open details, but dragging never does. On touchscreens, swipe sideways to rotate; vertical gestures retain native page scrolling. Manual rotation also works while paused or with reduced motion, without enabling automatic movement.

## Portal controls

**Circle & entrance → Arc edge thickness** ranges from 1% (ultra-thin) to 100%
(the broadest single reflection); the new default is 8%. It narrows the reflection,
not the circle's radius or placement. Pixel derivatives and subpixel coverage keep
small settings distinguishable on low-DPR screens. **Use ultra-thin edge** changes
only this setting, preserving saved geometry, artwork and lighting choices.

Edge light is independent of tint opacity. Surface reflection affects only the
glass landing, not title glow. Beam haze and ray-strength controls also govern
the dust, so switching both off leaves no floating light particles. **Reset
lighting only** restores projector controls without resetting titles or geometry.

**Title settings** contains shared angle, size and gap controls. Each title can
override its angle, use 25–100% of the shared size, fade its complete print/glow
with blend opacity, and choose Normal, Screen or Additive blending. Hidden titles
do not receive clicks or tint the projector. Changes reuse decoded images.

Under **Glass title circle**, edit arrival duration, rotation speed, circle size, glass visibility, tilt, projector, glow and artwork settings. Beam aim has separate desktop (1025px+), tablet (641–1024px) and mobile (up to 640px) values. The editor marks the active group from the iframe's actual width, including when a desktop preview is constrained by a small screen. Calibration guides appear only in portal preview.

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

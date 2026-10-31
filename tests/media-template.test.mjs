import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const json = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const clone = (value) => structuredClone(value);

test("projector density follows image brightness bands without extinguishing the lamp", () => {
  const { discImageBands } = loader()("lib/content/disc.ts");
  const bands = discImageBands([0,0,0,255, 64,64,64,255, 128,128,128,255, 255,255,255,255], 4);
  assert.equal(bands[0], .35);
  assert.ok(Math.abs(bands[3] - 1) < 1e-12);
  assert.ok(bands[0] < bands[1] && bands[1] < bands[2] && bands[2] < bands[3]);
  assert.deepEqual(discImageBands([255,255,255,0], 1), [.35,.35,.35,.35]);
  assert.deepEqual(discImageBands([], 0), [.35,.35,.35,.35]);
  assert.ok(Math.abs(discImageBands([255,255,255,255, 0,0,0,255], 1)[0] - (.35 + .65 * Math.sqrt(.5))) < 1e-12);
});

function uploadHarness(send) {
  const slots=[];let cursor=0;const cleanups=[];
  const state=initial=>{const at=cursor++;if(!(at in slots))slots[at]=initial;return [slots[at],v=>{slots[at]=typeof v==='function'?v(slots[at]):v}];};
  const {useUploads}=loader({react:{useState:state,useRef:value=>state({current:value})[0],useEffect:fn=>{if(!cleanups.length)cleanups.push(fn());}}})("app/portal/use-uploads.ts");
  function UploadHarness() { cursor=0;return useUploads("image",send); }
  return {render:UploadHarness,close(){cleanups.forEach(fn=>fn?.());}};
}

test("breadcrumbs preserve entry points, trim revisited parents, and bound long journeys", () => {
  const { defaultTrail, advanceTrail, readTrail, TRAIL_LIMIT } = loader()("lib/navigation-trail.ts");
  assert.deepEqual(defaultTrail("/work/dacoit"), ["/", "/work", "/work/dacoit"]);
  assert.deepEqual(defaultTrail("/process/sketchboards"), ["/", "/#process", "/process/sketchboards"]);
  let paths = advanceTrail(["/", "/#collaborations"], "/work/dacoit");
  assert.deepEqual(paths, ["/", "/#collaborations", "/work/dacoit"]);
  assert.deepEqual(advanceTrail(paths, "/#collaborations"), ["/", "/#collaborations"]);
  assert.deepEqual(readTrail(paths, "/work/dacoit"), paths);
  assert.equal(readTrail(paths, "/work/another"), null, "History from another page cannot redirect this one");
  for (let i = 0; i < 30; i++) paths = advanceTrail(paths, `/work/film-${i}`);
  assert.equal(paths.length, TRAIL_LIMIT);
  assert.equal(paths[0], "/");
  assert.equal(paths.at(-1), "/work/film-29");
  assert.deepEqual(advanceTrail(paths, "/"), ["/"]);
});

test("breadcrumb destinations reject unsafe URLs and preserve preview before the hash", () => {
  const { trailPath, readTrail, trailHref, hashSection } = loader()("lib/navigation-trail.ts");
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/portal", "/api/contact", "/work/%2e%2e", {}, null]) assert.equal(trailPath(value), null);
  assert.equal(readTrail(["/", "//evil.test"], "//evil.test"), null);
  assert.equal(readTrail(["/", "/work", "/work"], "/work"), null);
  assert.equal(trailHref("/#collaborations", true), "/?portal-preview#collaborations");
  assert.equal(trailHref("/work/dacoit", true), "/work/dacoit?portal-preview");
  assert.equal(trailHref("/work", false), "/work");
  assert.equal(hashSection("#%E0%A4%A"), "");
  assert.equal(hashSection("#work"), "work");
});

test("upload controls reject rapid duplicate starts and recover after failure", async () => {
  let finish;let calls=0;const completed=[];
  const ui=uploadHarness(async()=>{calls++;return new Promise(resolve=>{finish=resolve});});
  const file={name:"photo.png",type:"image/png",size:10};
  const first=ui.render().start([file],value=>completed.push(value));
  await ui.render().start([file],value=>completed.push(value));
  assert.equal(calls,1);finish("one");await first;
  assert.deepEqual(completed,["one"]);assert.equal(ui.render().state.busy,false);
  const failed=uploadHarness(async()=>{throw new Error("Connection interrupted")});
  await failed.render().start([file],()=>assert.fail("Failed upload applied"));
  assert.equal(failed.render().state.busy,false);assert.match(failed.render().state.errors[0],/Connection interrupted/);
});

test("closing an editor prevents late uploads changing its draft or starting the next file", async () => {
  let finish,progress;let calls=0;const completed=[];
  const ui=uploadHarness((_,onProgress)=>{calls++;progress=onProgress;return new Promise(resolve=>{finish=resolve});});
  const file={name:"photo.png",type:"image/png",size:10};
  const run=ui.render().start([file,file],value=>completed.push(value));
  progress(150);assert.equal(ui.render().state.percent,100);
  ui.close();const before=ui.render().state;
  progress(50);finish("late");await run;
  assert.equal(calls,1);assert.deepEqual(completed,[]);assert.equal(ui.render().state,before);
});

test("legacy filenames cannot crash portal labels and exclude URL query strings", () => {
  const {fileName}=loader()("app/portal/image-info.ts");
  assert.equal(fileName("/images/my%20photo.png?v=123#test"),"my photo.png");
  assert.equal(fileName("/images/bad%E0%A4%A.png"),"bad%E0%A4%A.png");
});

test("video cards preserve photo defaults and safely retain video metadata through saves and reorder", () => {
  const read = loader();
  const { cleanItem } = read("lib/content/process.ts");
  assert.equal(cleanItem({ image: "/images/example.jpg" }).mediaType, "image");
  assert.equal(cleanItem({ mediaType: "video", video: "https://outside.invalid/movie.mp4" }).video, "");
  assert.equal(cleanItem({ mediaType: "video", video: "/media/videos/../file.mp4" }).video, "");
  const content = json("content/site-content.json");
  const item = { mediaType: "video", video: "/media/videos/test-clip.mp4", videoWidth: 1080, videoHeight: 1920, title: "BTS", note: "Caption stays below", image: "" };
  content.home.process.cards[0].items = [item, { title: "A photo", image: "" }];
  const saved = read("lib/content/sanitize.ts").sanitizeContent(content);
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.process.cards.0.items", 0, 1);
  assert.equal(moved.home.process.cards[0].items[1].video, item.video);
  assert.equal(moved.home.process.cards[0].items[1].videoHeight, 1920);
  assert.equal(moved.home.process.cards[0].items[1].note, item.note);
});

test("video signatures and byte ranges reject invalid input and support browser seeking", () => {
  const { videoType, videoRange } = loader()("lib/video.ts");
  const mp4 = Buffer.alloc(32); mp4.write("ftypisom", 4);
  assert.equal(videoType(mp4), "mp4");
  mp4.write("avif", 8); assert.equal(videoType(mp4), null);
  assert.equal(videoType(Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]), Buffer.from("----matroska----")])), "mkv");
  assert.equal(videoType(Buffer.from("a file named movie.mp4")), null);
  assert.deepEqual(videoRange("bytes=20-39", 100), {start:20,end:39});
  assert.deepEqual(videoRange("bytes=20-", 100), {start:20,end:99});
  assert.deepEqual(videoRange("bytes=-20", 100), {start:80,end:99});
  assert.deepEqual(videoRange("bytes=20-999", 100), {start:20,end:99});
  for(const bad of ["bytes=100-", "bytes=30-20", "bytes=-0", "bytes=0-4,8-10", "bytes=--", "bytes=9007199254740992-"]) assert.equal(videoRange(bad,100), "invalid");
});

test("video upload body has a hard bound and rejects truncated transfers", async () => {
  const { readVideoBody } = loader()("lib/video.ts");
  const body = values => new ReadableStream({ start(c) { values.forEach(v=>c.enqueue(new Uint8Array(v))); c.close(); } });
  assert.deepEqual([...await readVideoBody(body([[1,2],[3,4]]),4)], [1,2,3,4]);
  await assert.rejects(readVideoBody(body([[1,2,3,4,5]]),4), /size changed/);
  await assert.rejects(readVideoBody(body([[1,2]]),4), /incomplete/);
});

test("video serving streams only requested bytes and HEAD never opens a stream", async () => {
  const requests=[];
  const route=loader({"@/lib/storage":{store:async()=>({size:async()=>100,getStream:async(key,range)=>{
    requests.push({key,range});return {body:new ReadableStream({start(c){c.enqueue(new Uint8Array(range?.length??100));c.close();}})};
  }})}})("app/media/videos/[name]/route.ts");
  const ctx={params:Promise.resolve({name:"test.mp4"})};
  const res=await route.GET(new Request("http://local/media/videos/test.mp4",{headers:{Range:"bytes=10-19"}}),ctx);
  assert.equal(res.status,206);assert.equal(res.headers.get("content-range"),"bytes 10-19/100");assert.equal((await res.arrayBuffer()).byteLength,10);
  assert.deepEqual(requests[0].range,{offset:10,length:10});
  const head=await route.HEAD(new Request("http://local/media/videos/test.mp4",{method:"HEAD"}),ctx);
  assert.equal(head.headers.get("content-length"),"100");assert.equal(requests.length,1);
  const bad=await route.GET(new Request("http://local/media/videos/test.mp4",{headers:{Range:"bytes=200-"}}),ctx);
  assert.equal(bad.status,416);assert.equal(requests.length,1);
});

test("video uploads require sign-in, same origin, bounded bodies and valid containers", async () => {
  let user=null;let origin=true;const writes=[];
  const route=loader({
    "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    "@/lib/portal/auth":{getPortalUser:async()=>user},
    "@/lib/request-origin":{requestOriginMatches:()=>origin},
    "@/lib/portal/activity":{logActivity:async()=>{}},
    "@/lib/storage":{store:async()=>({putBytes:async(...args)=>writes.push(args)})},
  })("app/api/portal/videos/route.ts");
  const bytes=Buffer.alloc(32);bytes.write("ftypisom",4);
  const req=(body=bytes,size=body.length)=>new Request("http://local/api/portal/videos",{method:"POST",headers:{Origin:"http://local","Content-Length":String(size)},body});
  assert.equal((await route.POST(req())).status,401);
  user={id:"owner"};origin=false;assert.equal((await route.POST(req())).status,403);
  origin=true;assert.equal((await route.POST(req(bytes,50*1024*1024+1))).status,413);
  assert.equal((await route.POST(req(Buffer.alloc(32)))).status,400);assert.equal(writes.length,0);
  const success=await route.POST(req());assert.equal(success.status,200);assert.match((await success.json()).src,/^\/media\/videos\/[a-z0-9-]+\.mp4$/);
  assert.equal(writes.length,1);assert.equal(writes[0][2],"video/mp4");
  // Exercise the inclusive 50 MB boundary with a chunked container fixture, without storing a real file.
  const chunk = new Uint8Array(1024*1024);
  let sent = 0;
  const body = new ReadableStream({pull(controller) {
    if (sent === 50) { controller.close(); return; }
    if (sent++ === 0) { const first=chunk.slice();first.set(bytes);controller.enqueue(first); }
    else controller.enqueue(chunk);
  }});
  const boundary = await route.POST({headers:new Headers({Origin:"http://local","Content-Length":String(50*1024*1024)}),body});
  assert.equal(boundary.status,200);
  assert.equal(writes.length,2);assert.equal(writes[1][1].byteLength,50*1024*1024);
});

test("section editors never repeat a field path or render duplicate React keys", () => {
  const { CONTENT_PAGES } = loader()("app/portal/content-schema.ts");
  const check = (fields) => {
    assert.equal(new Set(fields.map((f) => f.path)).size, fields.length);
    for (const field of fields) if (field.kind === "list") check(field.fields);
  };
  for (const page of Object.values(CONTENT_PAGES)) for (const section of page.sections) check(section.fields);
});

test("disc settings migrate old slates, clamp invalid controls, and retain artwork and ordering", () => {
  const read = loader();
  const { DISC_DEFAULTS, sanitizeDisc, sectorSize } = read("lib/content/disc.ts");
  assert.deepEqual(sanitizeDisc(undefined), DISC_DEFAULTS);
  assert.deepEqual(sanitizeDisc({ spinSpeed: NaN, bloom: "high" }), DISC_DEFAULTS);
  assert.equal(sanitizeDisc({ discTilt: -999 }).discTilt, -75);
  assert.equal(sanitizeDisc({ spinSpeed: 0 }).spinSpeed, 0);
  assert.equal(sanitizeDisc({ slotGap: 100 }).slotGap, 12);
  assert.equal(sanitizeDisc({}).projectorSide, -1, "Existing slates receive the left-hand projector");
  assert.equal(sanitizeDisc({ projectorSide: -100 }).projectorSide, -1);
  assert.equal(sanitizeDisc({ projectorSide: .4 }).projectorSide, 1);
  assert.equal(sanitizeDisc({ projectorSide: NaN }).projectorSide, -1);
  for (const count of [0, 1, 2, 12, 16, 100]) {
    const { step, width } = sectorSize(count, 12);
    assert.ok(width > 0 && width < step);
    assert.ok(Math.abs(step * Math.max(1, count) - Math.PI * 2) < 1e-10);
  }
  const { sanitizeIntroSettings } = read("lib/intro/settings.ts");
  const legacy = json("content/intro-settings.json");
  const migrated = sanitizeIntroSettings(legacy);
  assert.deepEqual(migrated.proofTable.disc, DISC_DEFAULTS);
  assert.deepEqual(migrated.proofTable.items.map(it => [it.src, it.slug]), legacy.proofTable.items.map(it => [it.src, it.slug]));
  migrated.proofTable.disc.spinSpeed = -0.2;
  assert.equal(sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.disc.spinSpeed, -0.2);
  const custom = { ...DISC_DEFAULTS, lightIntensity: 0, saturation: 0, vibrance: 0.7, slotOpacity: 0.5, slotSize: 0.8, slotBlur: 0, glowRadius: 0.9, glowThreshold: 1.2, unfocusedBrightness: 0.4 };
  migrated.proofTable.disc = custom;
  migrated.proofTable.items[0].tint = "#55aaff";
  migrated.proofTable.items[0].titleColor = "#123456";
  migrated.proofTable.items[0].titleGlowColor = "#abcdef";
  migrated.proofTable.items[0].titleGlowIntensity = 1.35;
  const roundTrip = sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(roundTrip.proofTable.disc, custom);
  assert.equal(roundTrip.proofTable.items[0].tint, "#55aaff");
  assert.equal(roundTrip.proofTable.items[0].titleColor, "#123456");
  assert.equal(roundTrip.proofTable.items[0].titleGlowColor, "#abcdef");
  assert.equal(roundTrip.proofTable.items[0].titleGlowIntensity, 1.35);
  migrated.proofTable.items[0].titleColor = "red";
  migrated.proofTable.items[0].titleGlowColor = "#xyzxyz";
  migrated.proofTable.items[0].titleGlowIntensity = 99;
  const boundedTitle = sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.items[0];
  assert.equal(boundedTitle.titleColor, undefined);
  assert.equal(boundedTitle.titleGlowColor, undefined);
  assert.equal(boundedTitle.titleGlowIntensity, 2);
  assert.equal(sanitizeDisc({ saturation: 999, slotSize: -4 }).saturation, 2);
  assert.equal(sanitizeDisc({ saturation: 999, slotSize: -4 }).slotSize, 0.7);
  assert.equal(sanitizeDisc({ spinSpeed: -0.2 }).saturation, 1, "Earlier disc documents receive new colour defaults");
  assert.equal(sanitizeDisc({ discTilt: -65 }).discRoll, -65, "Existing documents receive the upright reference angle");
  assert.equal(sanitizeDisc({ rayStyle: 1.6 }).rayStyle, 2);
  assert.equal(sanitizeDisc({ rayStyle: -1 }).rayStyle, 0);
  for (const rayStyle of [0, 1, 2]) {
    migrated.proofTable.disc = { ...custom, rayStyle, discRoll: -50, rayElevation: 3, raySpread: 1.5, rayPrism: 0.8 };
    assert.deepEqual(sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.disc, migrated.proofTable.disc);
  }
});

test("disc title regions stay separated inside the silver ring", () => {
  const { discPanelLayout } = loader()("lib/content/disc.ts");
  for (const count of [1, 2, 5, 6, 8, 12, 16]) for (const gap of [0.5, 12]) for (const size of [0.7, 1]) {
    const panel = discPanelLayout(count, gap, size);
    assert.ok(panel.inner > 0.22);
    assert.equal(panel.innerHalfWidth, panel.outerHalfWidth, "Transparent PNGs are never warped into wedges");
    assert.ok(Math.hypot(panel.outer, panel.outerHalfWidth) < 1, "Title pixels stay inside the rim");
    assert.ok(Math.atan2(panel.innerHalfWidth, panel.inner) < panel.step / 2, "Adjacent titles cannot overlap");
    assert.ok(Math.abs(panel.step * count - Math.PI * 2) < 1e-10, "Adding titles redistributes them equally");
  }
});

test("disc mounts transparent title artwork without card or frame layers", () => {
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.doesNotMatch(source, /const glass = own\(/);
  assert.doesNotMatch(source, /EdgesGeometry\(panelGeometry/);
  assert.match(source, /gl_FragColor=vec4\(c,tex\.a\*imageOpacity\)/);
  assert.match(source, /Float32BufferAttribute\(\[0, 0, 1, 0, 1, 1, 0, 1\], 2\)/);
  assert.match(source, /titleGlowIntensity/);
  assert.match(source, /mix\(contactColour,vec3\(1\.\),\.08\)/);
  assert.match(source, /hullWidth = 1\.5/);
  assert.match(source, /makeAimGuide\(0x5be7ff\).*makeAimGuide\(0xffd45b\)/s);
  assert.match(source, /setAimGuides\(value: boolean\)/);
  const page = readFileSync(path.join(root, "components/proof-table/ProofTable.tsx"), "utf8");
  assert.match(page, /setBeamOrigin\(sourceX,/);
  assert.match(page, /titleBounds\.bottom \+ Math\.min\(14, Math\.max\(4, titleGap \* \.22\)\)/);
  assert.match(page, /const stacked = stageBounds\.top >= bodyBounds\.bottom/);
  assert.match(page, /setAimGuides\(portalPreview\)/);
  assert.match(source, /smoothstep\(\.015,\.42,along\)/);
});

test("projector illuminates only overlapping image pixels and blends partial entries in either direction", () => {
  const { discPanelLayout, discProjectionWindow, discProjectionMask, discProjectionCoverage } = loader()("lib/content/disc.ts");
  const panel = discPanelLayout(8, 3, 1), window = discProjectionWindow(panel, .67, 1.1);
  assert.equal(discProjectionMask(window.center, 0, window, .75), 1);
  assert.equal(discProjectionMask(window.outer + .01, 0, window, .75), 0);
  assert.equal(discProjectionMask(window.center, window.outerHalfWidth + .01, window, .75), 0);
  const halfWidth = (window.innerHalfWidth + window.outerHalfWidth) / 2;
  const edgeWeight = discProjectionMask(window.center, halfWidth * .85, window, .75);
  assert.ok(edgeWeight > 0 && edgeWeight < 1, "Only the entering edge is feathered, not the whole image");
  const centered = discProjectionCoverage(panel, window, 0, .75);
  const partial = discProjectionCoverage(panel, window, .35, .75);
  assert.ok(partial > 0 && partial < centered);
  assert.equal(discProjectionCoverage(panel, window, Math.PI, .75), 0);
  assert.ok(Math.abs(partial - discProjectionCoverage(panel, window, -.35, .75)) < 1e-9);
  assert.ok(Math.abs(partial - discProjectionCoverage(panel, window, Math.PI * 2 + .35, .75)) < 1e-9);
});

test("upright artwork keeps its aspect ratio entirely inside a rotating projected plaque", () => {
  const { discArtworkFrame } = loader()("lib/content/disc.ts");
  for (const angle of [0, .3, 1, 2, 3, 4, 5]) for (const aspect of [.25, 1, 4]) for (const viewport of [.5, 1, 2]) {
    const points = [{ x: -.2, y: -.5 }, { x: .2, y: -.5 }, { x: .4, y: .5 }, { x: -.4, y: .5 }]
      .map(p => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
    const box = discArtworkFrame(points, aspect, viewport);
    assert.ok(Math.abs(box.halfWidth / box.halfHeight * viewport - aspect) < 1e-8);
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      const x = box.x + dx * box.halfWidth, y = box.y + dy * box.halfHeight;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        assert.ok((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= -1e-8, "No corner clips outside the plaque");
      }
    }
  }
});

test("projector colour ignores transparent padding and preserves artwork pigment", () => {
  const { discImageColour, sanitizeDisc } = loader()("lib/content/disc.ts");
  assert.deepEqual(discImageColour([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 0, 255]), [1, 0, 0]);
  const colour = discImageColour([255, 0, 0, 255, 255, 255, 255, 255]);
  assert.ok(colour[0] > .9 && colour[1] < .1);
  assert.deepEqual(discImageColour([0, 0, 0, 0]), [.5, .5, .5]);
  assert.equal(sanitizeDisc({}).rayMotion, .45);
  assert.equal(sanitizeDisc({ rayMotion: 0 }).rayMotion, 0);
  assert.equal(sanitizeDisc({ rayMotion: Infinity }).rayMotion, .45);
  assert.equal(sanitizeDisc({ rayMotion: 8 }).rayMotion, 1);
});

test("disc displays eight entries without deleting titles or changing their link order", () => {
  const { DISC_SLOT_LIMIT, visibleDiscItems } = loader()("lib/content/disc.ts");
  const items = Array.from({ length: 12 }, (_, i) => ({ slug: `title-${i}`, src: `image-${i}.png` }));
  const original = clone(items);
  assert.equal(DISC_SLOT_LIMIT, 8);
  assert.deepEqual(visibleDiscItems(items), original.slice(0, 8));
  assert.deepEqual(items, original);
  const reordered = [items[10], ...items.filter((_, i) => i !== 10)];
  assert.equal(visibleDiscItems(reordered)[0].slug, "title-10");
  assert.equal(visibleDiscItems([]).length, 0);
  assert.equal(visibleDiscItems(items.slice(0, 3)).length, 3);
});

test("projector footprint tracks slot dimensions and stays inside the selected plaque", () => {
  const { DISC_DEFAULTS, discPanelLayout, discProjectionWindow } = loader()("lib/content/disc.ts");
  assert.equal(DISC_DEFAULTS.focusAngle, -18);
  for (const count of [1, 5, 12, 16]) for (const size of [.7, 1]) for (const radius of [.48, .67, .82]) for (const spread of [.3, 1.1, 2]) {
    const layout = discPanelLayout(count, 3, size), window = discProjectionWindow(layout, radius, spread);
    assert.ok(window.inner >= layout.inner && window.outer <= layout.outer);
    assert.ok(window.inner < window.center && window.center < window.outer);
    for (const [r, width] of [[window.inner, window.innerHalfWidth], [window.outer, window.outerHalfWidth]]) {
      const boundary = layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * (r - layout.inner) / (layout.outer - layout.inner);
      assert.ok(width > 0 && width < boundary, "Even maximum spread stays inside the glass");
    }
  }
  const window = (count, size) => discProjectionWindow(discPanelLayout(count, 3, size), .67, 1.1);
  assert.ok(window(16, 1).outerHalfWidth < window(5, 1).outerHalfWidth);
  assert.ok(window(5, .7).outer - window(5, .7).inner < window(5, 1).outer - window(5, 1).inner);
});

test("stat values retain typed symbols, decimal precision, blank drafts and text effects through saving", () => {
  const read = loader();
  const { statText, statCounter } = read("lib/content/stat-value.ts");
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { contentProblems } = read("app/portal/validate.ts");
  const { applyTextEffect } = read("lib/content/text-effects.ts");
  assert.equal(statText(4, "+"), "4+");
  assert.equal(statText("4", "+"), "4+");
  for (const value of ["4+", "4-", "-4", "+4", "[[4+]]", "[[glow|4+]]", "", "004+"]) {
    assert.equal(statText(value, "+"), value);
    const content = json("content/site-content.json");
    content.home.stats[0].value = value;
    const saved = sanitizeContent(JSON.parse(JSON.stringify(content)));
    assert.equal(saved.home.stats[0].value, value);
    const errors = contentProblems(saved).filter(p => p.path === "home.stats.0.value");
    assert.equal(errors.length, value ? 0 : 1);
  }
  assert.equal(statText("[[4]]", "+"), "[[4]]+");
  assert.deepEqual(statCounter("-4.50"), {target:-4.5,decimals:2,sign:"-",suffix:""});
  assert.equal(statCounter(applyTextEffect("[[4+]]", "glow")), null);
  const number = read("app/portal/content-schema.ts").findList("home.stats").fields.find(f => f.path === "value");
  assert.equal(number.kind, "text");assert.equal(number.fx, true);
});

test("text effects preserve old dots, isolate field choices, and keep editable brackets simple", () => {
  const { applyTextEffect, editableFx, plainFx, selectedEffect, TEXT_EFFECTS } = loader()("lib/content/text-effects.ts");
  const original = "Make [[cinematic]] work with [[character]].";
  assert.equal(selectedEffect(original), "particles");
  for (const { id } of TEXT_EFFECTS) {
    const encoded = applyTextEffect(original, id);
    assert.equal(editableFx(encoded), original);
    assert.equal(selectedEffect(encoded), id);
    assert.equal(plainFx(encoded), "Make cinematic work with character.");
  }
  assert.equal(original, "Make [[cinematic]] work with [[character]].");
  assert.equal(plainFx("[[unknown|literal]]"), "unknown|literal");
});

test("effect marking handles selections, whitespace, punctuation and existing brackets", () => {
  const { markEffectWords } = loader()("lib/content/text-effects.ts");
  assert.equal(markEffectWords("Make cinematic."), "Make [[cinematic]].");
  assert.equal(markEffectWords("Make cinematic work", 5, 14), "Make [[cinematic]] work");
  assert.equal(markEffectWords("Make [[cinematic]]", 8, 12), "Make [[cinematic]]");
  assert.equal(markEffectWords("Make [[cinematic]] work"), "Make [[cinematic]] work");
  assert.equal(markEffectWords("  great work  ", 0, 14), "  [[great work]]  ");
});

test("text colour and glow options stay with their own marked number through edits, saves and reorders", () => {
  const read = loader();
  const fx = read("lib/content/text-effects.ts");
  const options = { color: "#12abcd", glowColor: "#ef3456", glowStrength: 0.45, glowRadius: 18, glowMode: "always" };
  const encoded = fx.applyTextEffect("[[30+]]", "glow", options);
  assert.equal(fx.editableFx(encoded), "[[30+]]");
  assert.equal(fx.plainFx(encoded), "30+");
  assert.deepEqual(fx.selectedEffectOptions(encoded), options);
  assert.deepEqual(fx.selectedEffectOptions(fx.applyTextEffect(encoded, "outline")), options);
  assert.equal(read("lib/content/stat-value.ts").statText(encoded, "+"), encoded);
  const content = json("content/site-content.json");
  const neighbour = clone(content.home.stats[1]);
  content.home.stats[0].value = encoded;
  const saved = read("lib/content/sanitize.ts").sanitizeContent(JSON.parse(JSON.stringify(content)));
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.stats", 0, 1);
  assert.equal(moved.home.stats[1].value, encoded);
  assert.deepEqual(moved.home.stats[0], neighbour);
  assert.equal(fx.applyTextEffect(encoded, "glow", {}), "[[glow|30+]]");
  assert.deepEqual(fx.effectStyle(options), {color:"#12abcd", "--fx-glow-color":"#ef3456", "--fx-glow-opacity":"45%", "--fx-glow-radius":"18px"});
  assert.equal(read("lib/content/process.ts").slugify(fx.applyTextEffect("[[My Heading]]", "glow", options)), "my-heading");
});

test("effect settings reject unsafe CSS and clamp costly glow values without changing legacy markers", () => {
  const fx = loader()("lib/content/text-effects.ts");
  assert.deepEqual(fx.cleanEffectOptions({color:"url(https://invalid.example)",glowColor:"red;position:fixed",glowStrength:5,glowRadius:9999,glowMode:"invalid"}), {glowStrength:1,glowRadius:32});
  assert.deepEqual(fx.cleanEffectOptions({glowStrength:NaN,glowRadius:Infinity}), {});
  assert.deepEqual(fx.cleanEffectOptions({glowStrength:-1,glowRadius:-20}), {glowStrength:0,glowRadius:1});
  assert.deepEqual(fx.selectedEffectOptions("[[glow;color=red;glowRadius=Infinity;glowStrength=0|4+]]"), {glowStrength:0});
  assert.equal(fx.applyTextEffect("[[4+]]", "particles"), "[[4+]]");
  assert.equal(fx.applyTextEffect("[[glow|4+]]", "glow"), "[[glow|4+]]");
  assert.deepEqual(fx.effectStyle({}), {});
});

test("particle controls round-trip with numbers, retain colours through presets, and stay field-local", () => {
  const read = loader(), fx = read("lib/content/text-effects.ts");
  const options = { color: "#12abcd", particleColor: "#e94b92", particleSize: .75, particleScatter: 6, particleSpeed: 1.2, particleGlow: .6 };
  const encoded = fx.applyTextEffect("[[30+]]", "particles", options);
  assert.equal(fx.editableFx(encoded), "[[30+]]");
  assert.equal(fx.plainFx(encoded), "30+");
  assert.deepEqual(fx.selectedEffectOptions(encoded), options);
  const content = json("content/site-content.json"), neighbour = clone(content.home.stats[1]);
  content.home.stats[0].value = encoded;
  const saved = read("lib/content/sanitize.ts").sanitizeContent(JSON.parse(JSON.stringify(content)));
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.stats", 0, 1);
  assert.equal(moved.home.stats[1].value, encoded);
  assert.deepEqual(moved.home.stats[0], neighbour);
  assert.deepEqual(fx.selectedEffectOptions(fx.applyTextEffect(encoded, "glow")), options);
  for (const preset of fx.PARTICLE_PRESETS) {
    const next = fx.applyTextEffect(encoded, "particles", { ...options, ...preset.options });
    assert.equal(fx.selectedEffectOptions(next).particleColor, options.particleColor);
    assert.equal(fx.selectedEffectOptions(next).color, options.color);
  }
  assert.equal(fx.applyTextEffect(encoded, "particles", {}), "[[30+]]");
});

test("particle settings reject unsafe colours, clamp movement and preserve explicit zero", () => {
  const fx = loader()("lib/content/text-effects.ts");
  assert.deepEqual(fx.cleanEffectOptions({particleColor:"red;position:fixed",particleSize:99,particleScatter:99,particleSpeed:99,particleGlow:99}),
    {particleSize:1.6,particleScatter:8,particleSpeed:2,particleGlow:1});
  assert.deepEqual(fx.cleanEffectOptions({particleSize:NaN,particleScatter:Infinity,particleSpeed:"1",particleGlow:-Infinity}), {});
  assert.deepEqual(fx.selectedEffectOptions("[[particles;particleColor=#00AAEE;particleSize=-2;particleScatter=0;particleSpeed=0;particleGlow=0|4+]]"),
    {particleColor:"#00aaee",particleSize:.5,particleScatter:0,particleSpeed:.5,particleGlow:0});
  for (const preset of fx.PARTICLE_PRESETS) assert.deepEqual(fx.cleanEffectOptions(preset.options), preset.options);
  assert.equal(fx.applyTextEffect("[[4+]]", "particles"), "[[4+]]", "Legacy dots keep their defaults");
});

test("heading effects survive sanitizing and card moves without changing page addresses", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { reorderContent } = read("app/portal/reorder-content.ts");
  const content = json("content/site-content.json");
  content.home.process.cards[0].title = "[[sheen|A special heading]]";
  const clean = sanitizeContent(content);
  const moved = reorderContent(clean, "home.process.cards", 0, 1);
  assert.equal(moved.home.process.cards[1].title, "[[sheen|A special heading]]");
  assert.equal(moved.home.process.cards[1].slug, clean.home.process.cards[0].slug);
  assert.equal(read("lib/content/process.ts").slugify("[[glow|A special heading]]"), "a-special-heading");
});

test("preview reorder preserves content and renumbers projects without mutating the draft", () => {
  const { reorderContent } = loader()("app/portal/reorder-content.ts");
  const original = json("content/site-content.json");
  const before = clone(original);
  const result = reorderContent(original, "projects", 0, 3);
  assert.equal(result.projects[3].slug, original.projects[0].slug);
  assert.deepEqual(result.projects.slice(0, 3).map((p) => p.slug), original.projects.slice(1, 4).map((p) => p.slug));
  assert.deepEqual(result.projects.map((p) => p.order), result.projects.map((_, i) => i + 1));
  assert.equal(result.site, original.site);
  assert.deepEqual(original, before);
  assert.deepEqual(reorderContent(result, "projects", 3, 0).projects.map((p) => p.slug), original.projects.map((p) => p.slug));
});

test("preview reorder validates paths and positions and keeps nested cards together", () => {
  const { reorderContent } = loader()("app/portal/reorder-content.ts");
  const content = json("content/site-content.json");
  for (const [list, from, to] of [["projects", -1, 0], ["projects", 0, 9999], ["projects", .5, 1], ["projects", 0, 0], ["projects", "0", 1], ["site", 0, 1], ["__proto__.cards", 0, 1], ["projects.999.images", 0, 1]]) {
    assert.equal(reorderContent(content, list, from, to), content);
  }
  const custom = { ...content, projects: [{ ...content.projects[0], images: [{src:"a", alt:"A"}, {src:"b", alt:"B"}, {src:"c", alt:"C"}] }] };
  const result = reorderContent(custom, "projects.0.images", 2, 0);
  assert.deepEqual(result.projects[0].images, [{src:"c", alt:"C"}, {src:"a", alt:"A"}, {src:"b", alt:"B"}]);
  assert.equal(custom.projects[0].images[0].src, "a");
});

function panelHarness(file, name, props = {}) {
  const slots = [];
  let cursor = 0;
  const state = (initial) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = initial;
    return [slots[at], (value) => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
  };
  const Component = loader({
    react: { useState: state, useRef: (value) => state({ current: value })[0], useCallback: (fn) => fn, useEffect: () => {} },
    "./activity.module.css": {}, "./inbox.module.css": {},
  })(file)[name];
  return { render() {
    cursor = 0;
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node); walk(node.props?.children);
    };
    walk(Component(props));
    return { nodes, button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text), find: (type) => nodes.find((node) => node.type === type) };
  } };
}

test("failed optimistic changes preserve new rows, updated replies, and later status changes", () => {
  const { rollbackStatus, appendUnique } = loader()("app/portal/list-state.ts");
  const rows = [{ id: "one", status: "archived", replies: ["new reply"] }, { id: "two", status: "new" }];
  const restored = rollbackStatus(rows, "one", "archived", "read");
  assert.deepEqual(restored, [{ id: "one", status: "read", replies: ["new reply"] }, rows[1]]);
  assert.deepEqual(rollbackStatus(rows, "one", "new", "read"), rows);
  assert.deepEqual(appendUnique([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((row) => row.id), ["a", "b", "c"]);
});

test("activity pagination ignores double clicks and keeps overlapping pages unique", async () => {
  const previous = globalThis.fetch;
  const entry = (id) => ({ id, at: "2026-10-30T10:00:00Z", action: "sign-in", name: "Test", ok: true, device: "Test browser", ip: "local" });
  try {
    globalThis.fetch = async () => Response.json({ entries: [entry("a"), entry("b")], more: true, people: [], scope: "everyone" });
    const ui = panelHarness("app/portal/ActivityPanel.tsx", "ActivityPanel", { me: { role: "owner" } });
    await ui.render().button("↻ Refresh").props.onClick();
    let calls = 0;
    let respond;
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { respond = resolve; }); };
    const older = ui.render().button("Show older activity").props.onClick;
    const pending = older(); await older();
    assert.equal(calls, 1);
    assert.ok(ui.render().nodes.some((node) => node.type === "button" && node.props.disabled));
    respond(Response.json({ entries: [entry("b"), entry("c")], more: false, people: [], scope: "everyone" }));
    await pending;
    const screen = ui.render();
    assert.equal(screen.nodes.filter((node) => node.type === "li").length, 3);
    assert.ok(screen.nodes.some((node) => typeof node.props.children === "string" && node.props.children.startsWith("Older activity stays open")));
  } finally { globalThis.fetch = previous; }
});

const sampleEnquiry = { id: "enquiry-one", status: "read", name: "Test Visitor", email: "visitor@example.invalid", phone: "", company: "", projectType: "Poster", message: "A test enquiry", at: "2026-10-30T10:00:00Z", replies: [] };

test("an old inbox refresh cannot undo an archive completed after that refresh started", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ enquiries: [sampleEnquiry], mailConfigured: true });
    const ui = panelHarness("app/portal/InboxPanel.tsx", "InboxPanel");
    await ui.render().button("↻ Refresh").props.onClick();
    ui.render().nodes.find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
    let respond;
    let readSignal;
    globalThis.fetch = (_url, options) => {
      if (options.method === "PATCH") return Promise.resolve(Response.json({ ok: true }));
      readSignal = options.signal;
      return new Promise((resolve) => { respond = resolve; });
    };
    const refresh = ui.render().button("↻ Refresh").props.onClick();
    await ui.render().button("Archive").props.onClick();
    assert.equal(readSignal.aborted, true);
    respond(Response.json({ enquiries: [sampleEnquiry], mailConfigured: true }));
    await refresh;
    assert.ok(ui.render().button("Move back"));
    assert.equal(ui.render().button("Archive"), undefined);
  } finally { globalThis.fetch = previous; }
});

test("reply double-submission is blocked and unconfirmed replies keep the typed draft", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ enquiries: [sampleEnquiry], mailConfigured: true });
    const ui = panelHarness("app/portal/InboxPanel.tsx", "InboxPanel");
    await ui.render().button("↻ Refresh").props.onClick();
    ui.render().nodes.find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
    ui.render().button("✉ Reply").props.onClick();
    ui.render().find("textarea").props.onChange({ target: { value: "Test reply; never actually emailed." } });
    let calls = 0;
    let respond;
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { respond = resolve; }); };
    const submit = ui.render().find("form").props.onSubmit;
    submit({ preventDefault() {} }); submit({ preventDefault() {} });
    assert.equal(calls, 1);
    respond(Response.json({ ok: true }));
    await new Promise(setImmediate);
    const screen = ui.render();
    assert.equal(screen.find("textarea").props.value, "Test reply; never actually emailed.");
    assert.ok(screen.nodes.some((node) => node.props.role === "alert" && node.props.children.includes("did not confirm")));
    assert.equal(screen.button("Send reply").props.disabled, false);
  } finally { globalThis.fetch = previous; }
});

test("visible polling stops background work, never overlaps, and aborts on hide or cleanup", async () => {
  const originals = new Map(["document", "setTimeout", "clearTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const handlers = new Map();
  const timers = new Map();
  let id = 0;
  const doc = { hidden: true, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener: (key) => handlers.delete(key) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  globalThis.setTimeout = (fn) => { timers.set(++id, fn); return id; };
  globalThis.clearTimeout = (key) => timers.delete(key);
  try {
    const { startVisiblePoll } = loader()("lib/visible-poll.ts");
    const signals = [];
    let finish;
    const stop = startVisiblePoll((signal) => {
      signals.push(signal);
      return new Promise((resolve) => { finish = resolve; signal.addEventListener("abort", resolve); });
    }, 30_000);
    assert.equal(signals.length, 0, "A hidden page must not start a request");
    doc.hidden = false;
    handlers.get("visibilitychange")();
    handlers.get("visibilitychange")();
    assert.equal(signals.length, 1, "Repeated visibility events must not duplicate requests");
    assert.equal(timers.size, 0, "No interval while the previous request is pending");
    finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 1);
    const [key, tick] = timers.entries().next().value;
    timers.delete(key); tick();
    assert.equal(signals.length, 2);
    doc.hidden = true; handlers.get("visibilitychange")();
    assert.equal(signals[1].aborted, true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 0);
    doc.hidden = false; handlers.get("visibilitychange")();
    assert.equal(signals.length, 3);
    stop();
    assert.equal(signals[2].aborted, true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 0);
    assert.equal(handlers.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("preview navigation preserves the latest page selection while the initial iframe is still loading", () => {
  const { requestPreviewRoute, finishPreviewLoad } = loader()("app/portal/preview-frame.ts");
  const calls = [];
  const pending = { current: null };
  const location = { pathname: "blank", assign: (url) => calls.push(["assign", url]), replace: (url) => calls.push(["replace", url]) };
  const frame = { contentWindow: { location } };
  requestPreviewRoute(frame, "/work", pending);
  assert.equal(pending.current, "/work");
  assert.equal(calls.length, 0);
  requestPreviewRoute(frame, "/breakdowns", pending);
  location.pathname = "/";
  finishPreviewLoad(frame, pending);
  assert.deepEqual(calls, [["replace", "/breakdowns?portal-preview"]]);
  location.pathname = "/breakdowns";
  finishPreviewLoad(frame, pending);
  assert.equal(pending.current, null);
  requestPreviewRoute(frame, "/work", pending);
  assert.deepEqual(calls.at(-1), ["assign", "/work?portal-preview"]);
  location.pathname = "/work";
  finishPreviewLoad(frame, pending);
  assert.equal(pending.current, null);
});

test("slate markup starts in assembly pose, honors portal appearance, and links only to existing projects", () => {
  const Link = () => null;
  const { ProofTableFallback } = loader({
    react: { useRef: () => ({ current: null }), useEffect: () => {} },
    "next/link": { default: Link },
    "./ProofTable.module.css": {},
  })("components/proof-table/Fallback.tsx");
  const item = { type: "title-png", src: "", slug: "film", film: "Film", tag: "Title", year: 2026 };
  const look = { slabColor: "#123456", slabOpacity: 0.4, glassColor: "#abcdef", glassOpacity: 0.5, reflection: 0.6, frost: 0.2, cardSize: 1 };
  const tree = ProofTableFallback({ items: [item, { ...item, slug: "missing" }], children: "Copy", projectSlugs: ["film"], look });
  const nodes = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    nodes.push(node); walk(node.props?.children);
  };
  walk(tree);
  const scene = nodes.find((node) => node.props["data-assembly"]);
  assert.equal(scene.props["data-assembly"], "ready");
  assert.equal(scene.props["data-paused"], "true");
  assert.equal(scene.props.style["--slab-tint"], "#123456");
  assert.equal(scene.props.style["--glass-opacity"], "50%");
  const links = nodes.filter((node) => node.props.href);
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, "/work/film");
  assert.equal(links[0].props["aria-label"], "View Film");
});

test("slate rendering sleeps when settled, coalesces wakes, and stops when hidden or disposed", () => {
  const originals = new Map(["requestAnimationFrame", "cancelAnimationFrame", "performance"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let next = 0;
  let clock = 100;
  const frames = new Map();
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => clock } });
  globalThis.requestAnimationFrame = (fn) => { frames.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const advance = (time) => { const [id, fn] = frames.entries().next().value; frames.delete(id); clock = time; fn(time); };
  try {
    const { createFrameLoop } = loader()("components/proof-table/frame-loop.ts");
    let allowed = true;
    let moving = false;
    const steps = [];
    const loop = createFrameLoop((dt) => { steps.push(dt); return moving; }, () => allowed);
    loop.wake(); loop.wake(); loop.wake();
    assert.equal(frames.size, 1);
    advance(116);
    assert.equal(frames.size, 0, "Idle slate must not keep scheduling frames");
    moving = true;
    loop.wake(); advance(132);
    assert.equal(frames.size, 1);
    allowed = false;
    advance(148);
    assert.equal(steps.length, 2);
    loop.wake();
    assert.equal(frames.size, 0);
    allowed = true;
    loop.wake(); advance(10_000);
    assert.equal(steps.at(-1), 0.05, "Long stalls never produce an unbounded spring step");
    loop.dispose(); loop.wake();
    assert.equal(frames.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("slate hover is bounded, batched, disabled during assembly/touch/reduced motion, and fully cleaned up", () => {
  const originals = new Map(["requestAnimationFrame", "cancelAnimationFrame", "window", "document", "Element"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = () => {
    const handlers = new Map();
    return { handlers, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener: (key) => handlers.delete(key), emit: (key, event) => handlers.get(key)?.(event) };
  };
  const motion = { ...events(), matches: false };
  const fine = { ...events(), matches: true };
  const doc = { ...events(), hidden: false };
  const values = new Map();
  class Element {
    dataset = {};
    style = { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) };
    closest() { return this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  }
  const slot = new Element();
  const scene = { ...events(), dataset: { assembly: "done" }, contains: (el) => el === slot };
  const frames = new Map();
  let id = 0;
  Object.defineProperty(globalThis, "Element", { configurable: true, value: Element });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: (q) => q.includes("reduced") ? motion : fine } });
  globalThis.requestAnimationFrame = (fn) => { frames.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = (key) => frames.delete(key);
  const pointer = { target: slot, pointerType: "mouse", clientX: 200, clientY: -50 };
  try {
    const { bindGlassHover } = loader()("components/proof-table/hover.ts");
    const stop = bindGlassHover(scene);
    scene.emit("pointermove", pointer); scene.emit("pointermove", pointer);
    assert.equal(frames.size, 1);
    for (const [key, fn] of frames) { frames.delete(key); fn(); }
    assert.equal(slot.dataset.floating, "true");
    assert.equal(values.get("--glass-rx"), "3.00deg");
    assert.equal(values.get("--glass-ry"), "3.00deg");
    scene.emit("pointerleave");
    assert.equal(slot.dataset.floating, undefined);
    assert.equal(values.size, 0);
    scene.dataset.assembly = "playing";
    scene.emit("pointermove", pointer);
    scene.dataset.assembly = "done";
    scene.emit("pointermove", { ...pointer, pointerType: "touch" });
    motion.matches = true;
    scene.emit("pointermove", pointer);
    assert.equal(frames.size, 0);
    motion.matches = false;
    scene.emit("pointermove", pointer);
    doc.hidden = true;
    doc.emit("visibilitychange");
    assert.equal(frames.size, 0);
    stop();
    assert.equal(scene.handlers.size + doc.handlers.size + motion.handlers.size + fine.handlers.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("library loading distinguishes empty results from authentication, server and malformed-response failures", async () => {
  const previous = globalThis.fetch;
  const { readMediaLibrary } = loader()("app/portal/media-library.ts");
  const signal = new AbortController().signal;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.signal, signal);
      assert.equal(options.cache, "no-store");
      return Response.json({ images: [], removable: [] });
    };
    assert.deepEqual(await readMediaLibrary(signal), { images: [], removable: [] });
    for (const status of [401, 500]) {
      globalThis.fetch = async () => Response.json({ error: "Unavailable" }, { status });
      await assert.rejects(readMediaLibrary(signal), status === 401 ? /another tab/ : /retry/);
    }
    for (const body of [{}, { images: [null], removable: [] }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(readMediaLibrary(signal), /incomplete/);
    }
    globalThis.fetch = async () => Response.json({ images: ["one", "one"], removable: ["one", "missing"] });
    assert.deepEqual(await readMediaLibrary(signal), { images: ["one"], removable: ["one"] });
  } finally { globalThis.fetch = previous; }
});

test("saving preserves edits made while the request is pending and accepts normalization for an unchanged draft", async () => {
  const original = globalThis.fetch;
  const { saveDraft, reconcileSaved } = loader()("app/portal/save-draft.ts");
  const submitted = { title: "First title " };
  let current = submitted;
  let saved;
  let respond;
  globalThis.fetch = () => new Promise((resolve) => { respond = resolve; });
  try {
    const request = saveDraft([{ label: "Content", url: "/content", body: submitted, responseKey: "content", accept: (value) => {
      saved = value;
      current = reconcileSaved(current, submitted, value);
    } }]);
    current = { title: "Newer title" };
    respond(Response.json({ content: { title: "First title" } }));
    await request;
    assert.deepEqual(saved, { title: "First title" });
    assert.deepEqual(current, { title: "Newer title" });
    assert.deepEqual(reconcileSaved(submitted, submitted, saved), saved);
  } finally { globalThis.fetch = original; }
});

test("partial saves keep successful sections and report expired sessions without accepting failed content", async () => {
  const original = globalThis.fetch;
  const { saveDraft, SaveError } = loader()("app/portal/save-draft.ts");
  const accepted = [];
  const responses = [Response.json({ settings: { color: "gold" } }), Response.json({ error: "Session ended" }, { status: 401 })];
  globalThis.fetch = async () => responses.shift();
  try {
    await assert.rejects(saveDraft([
      { label: "Design settings", url: "/settings", body: {}, responseKey: "settings", accept: () => accepted.push("settings") },
      { label: "Content", url: "/content", body: {}, responseKey: "content", accept: () => accepted.push("content") },
    ]), (error) => {
      assert.ok(error instanceof SaveError);
      assert.equal(error.status, 401);
      assert.deepEqual(error.completed, ["Design settings"]);
      assert.match(error.message, /Design settings saved/);
      assert.match(error.message, /another tab/);
      return true;
    });
    assert.deepEqual(accepted, ["settings"]);
  } finally { globalThis.fetch = original; }
});

test("malformed save replies and network failures leave the draft unaccepted", async () => {
  const original = globalThis.fetch;
  const { saveDraft } = loader()("app/portal/save-draft.ts");
  let accepted = 0;
  const job = { label: "Content", url: "/content", body: { title: "Draft" }, responseKey: "content", accept: () => accepted++ };
  try {
    for (const body of [{}, { content: null }, { content: [] }, { content: {} }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(saveDraft([job]), /did not confirm/);
    }
    globalThis.fetch = async () => { throw new TypeError("Network down"); };
    await assert.rejects(saveDraft([job]), /draft is still here/);
    assert.equal(accepted, 0);
  } finally { globalThis.fetch = original; }
});

test("a timed-out save aborts its request and clears the timer", async () => {
  const original = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const { saveDraft } = loader()("app/portal/save-draft.ts");
  let expire;
  let cleared = false;
  globalThis.setTimeout = (fn) => { expire = fn; return 123; };
  globalThis.clearTimeout = (id) => { cleared = id === 123; };
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("Aborted")));
  });
  try {
    const request = saveDraft([{ label: "Content", url: "/content", body: {}, responseKey: "content", accept: () => assert.fail("Timed-out save accepted") }]);
    expire();
    await assert.rejects(request, /took too long/);
    assert.equal(cleared, true);
  } finally { Object.assign(globalThis, original); }
});

test("nested dialogs contain focus, close only the top dialog, and restore the previous control", () => {
  const previous = new Map(["document", "Node", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  let doc;
  class Element {
    constructor(children = []) { this.children = children; this.isConnected = true; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    getClientRects() { return this.isConnected ? [{}] : []; }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return this.children; }
    focus() { doc.activeElement = this; emit("focusin", { target: this }); }
  }
  const emit = (name, event) => {
    for (const fn of [...(listeners.get(name) ?? [])]) { if (event.stopped) break; fn(event); }
  };
  const key = (name, shiftKey = false) => {
    const event = { key: name, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    emit("keydown", event);
    return event;
  };
  const trigger = new Element();
  const first = new Element();
  const last = new Element();
  const parent = new Element([first, last]);
  const childControl = new Element();
  const child = new Element([childControl]);
  const dialogs = [parent];
  doc = { body: new Element(), activeElement: trigger, querySelectorAll: () => dialogs,
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "Node", { configurable: true, value: Element });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Element });
  try {
    const { bindDialogFocus } = loader()("app/portal/dialog-focus.ts");
    let parentClosed = 0;
    let childClosed = 0;
    const releaseParent = bindDialogFocus(parent, () => parentClosed++);
    assert.equal(doc.activeElement, first);
    last.focus();
    assert.equal(key("Tab").defaultPrevented, true);
    assert.equal(doc.activeElement, first);
    key("Tab", true);
    assert.equal(doc.activeElement, last);
    trigger.focus();
    assert.equal(doc.activeElement, first, "Background controls cannot steal modal focus");
    dialogs.push(child);
    const releaseChild = bindDialogFocus(child, () => childClosed++);
    key("Escape");
    assert.equal(parentClosed, 0);
    assert.equal(childClosed, 1);
    dialogs.pop();
    child.isConnected = false;
    doc.activeElement = doc.body;
    releaseChild();
    assert.equal(doc.activeElement, first);
    key("Escape");
    assert.equal(parentClosed, 1);
    dialogs.pop();
    parent.isConnected = false;
    doc.activeElement = doc.body;
    releaseParent();
    assert.equal(doc.activeElement, trigger);
    assert.equal([...listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("deleting an item waits for library work, retains failures for retry, and suppresses duplicate submissions", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: {} } });
  const slots = [];
  let cursor = 0;
  const state = (initial) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = initial;
    return [slots[at], (value) => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
  };
  const src = "/images/uploads/test.webp";
  const item = { name: "Card", src };
  let removeCalls = 0;
  let itemDeleted = 0;
  let fail;
  let remove = () => new Promise((_resolve, reject) => { fail = reject; });
  const { useConfirmDelete: renderDelete } = loader({
    react: { useState: state, useRef: (initial) => state({ current: initial })[0] },
    "react-dom": { createPortal: (node) => node },
    "./dialog-focus": { useDialogFocus: () => {} },
    "./ContentEditor": { useEditor: () => ({ content: { cards: [item] }, media: { removable: [src], remove: async () => { removeCalls++; await remove(); } } }) },
    "./content.module.css": {},
  })("app/portal/DeleteDialog.tsx");
  const render = () => {
    cursor = 0;
    const ui = renderDelete();
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      walk(node.props?.children);
    };
    walk(ui.dialog);
    return { ...ui, nodes, button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text) };
  };
  try {
    render().ask({ what: "Card", item, onDelete: () => itemDeleted++ });
    render().nodes.find((node) => node.type === "input").props.onChange({ target: { checked: true } });
    const confirm = render().button("Delete with pictures").props.onClick;
    const pending = confirm();
    await confirm();
    assert.equal(removeCalls, 1);
    assert.equal(itemDeleted, 0, "The editor must remain mounted until library work finishes");
    fail(new Error("Offline"));
    await pending;
    assert.equal(itemDeleted, 0);
    assert.ok(render().nodes.some((node) => node.props.role === "alert"));
    assert.ok(render().button("Delete item only"));
    remove = async () => {};
    await render().button("Retry delete").props.onClick();
    assert.equal(itemDeleted, 1);
    assert.equal(render().dialog, null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("slate assembly pauses out of view, releases its animation on completion, and respects reduced motion", () => {
  const previous = new Map(["window", "document", "IntersectionObserver"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const target = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
      emit: (name, event = {}) => listeners.get(name)?.(event),
    };
  };
  try {
    const doc = { ...target(), hidden: false };
    const motion = { ...target(), matches: false };
    let seen;
    let disconnected = false;
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => motion } });
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class {
      constructor(callback) { seen = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    } });
    const { startAssembly } = loader()("components/proof-table/assembly.ts");
    const scene = { dataset: {} };
    const slab = target();
    const cleanup = startAssembly(scene, slab);
    assert.equal(scene.dataset.assembly, "ready");
    assert.equal(scene.dataset.paused, "true");
    seen([{ isIntersecting: true }]);
    assert.equal(scene.dataset.assembly, "playing");
    assert.equal(scene.dataset.paused, "false");
    doc.hidden = true;
    doc.emit("visibilitychange");
    assert.equal(scene.dataset.paused, "true");
    doc.hidden = false;
    doc.emit("visibilitychange");
    assert.equal(scene.dataset.paused, "false");
    seen([{ isIntersecting: false }]);
    assert.equal(scene.dataset.paused, "true");
    seen([{ isIntersecting: true }]);
    slab.emit("animationend", { target: {} });
    assert.equal(scene.dataset.assembly, "playing", "card completion must not cut the table animation short");
    slab.emit("animationend", { target: slab });
    assert.equal(scene.dataset.assembly, "done");
    assert.equal(disconnected, true);
    assert.equal(doc.listeners.size + motion.listeners.size + slab.listeners.size, 0);
    seen([{ isIntersecting: true }]);
    assert.equal(scene.dataset.assembly, "done", "completed assembly must not replay");
    cleanup();
    assert.deepEqual(scene.dataset, {});
    motion.matches = true;
    const reducedScene = { dataset: {} };
    const cleanupReduced = startAssembly(reducedScene, target());
    assert.equal(reducedScene.dataset.assembly, "done");
    assert.equal(doc.listeners.size + motion.listeners.size, 0);
    cleanupReduced();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("local origin checks accept Next-normalized loopback addresses without accepting foreign sites", () => {
  const { NextRequest } = nativeRequire("next/server");
  const { requestOriginMatches } = loader()("lib/request-origin.ts");
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    for (const address of ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"]) {
      const req = new NextRequest(address + "/api/portal/session", { headers: { origin: address, host: new URL(address).host } });
      assert.equal(requestOriginMatches(req), true, address);
    }
    const local = (origin, host = "127.0.0.1:3000") => new NextRequest("http://127.0.0.1:3000/api/portal/session", { headers: { origin, host } });
    for (const origin of ["https://untrusted.example", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "null", "http://127.0.0.1.evil.test:3000", "http://127.0.0.1:3000/path"]) {
      assert.equal(requestOriginMatches(local(origin)), false, origin);
    }
    assert.equal(requestOriginMatches(local("http://127.0.0.1:3000", "other.example")), false);
    assert.equal(requestOriginMatches(new NextRequest("http://localhost:3000/api/portal/session")), false);
    process.env.NODE_ENV = "production";
    assert.equal(requestOriginMatches(local("http://127.0.0.1:3000")), false);
    const production = (origin) => new NextRequest("https://studio.test/api/portal/session", { headers: { origin, host: "studio.test" } });
    assert.equal(requestOriginMatches(production("https://studio.test")), true);
    assert.equal(requestOriginMatches(production("https://untrusted.example")), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("responsive image URLs resize both upload libraries without duplicate width parameters", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { default: imageLoader } = loader()("lib/image-loader.ts");
    const { resizedSrc, srcSetFor } = loader()("lib/images.ts");
    for (const folder of ["uploads", "proof-table"]) {
      const src = `/images/${folder}/picture.webp?v=abc&w=100`;
      const url = new URL(imageLoader({ src, width: 640 }), "https://test.invalid");
      assert.equal(url.searchParams.get("v"), "abc");
      assert.deepEqual(url.searchParams.getAll("w"), ["640"]);
      assert.equal(new URL(resizedSrc(src, 160), "https://test.invalid").searchParams.get("w"), "160");
      assert.equal(srcSetFor(src, [160, 320]).includes("/_next/image"), false);
    }
    assert.equal(srcSetFor("/images/uploads/logo.svg"), undefined);
    assert.equal(srcSetFor("/images/uploads/animation.gif"), undefined);
    assert.ok(srcSetFor("/images/posters/example.jpg").includes("q=90"));
    process.env.NODE_ENV = "development";
    assert.equal(resizedSrc("/images/proof-table/art.webp", 160), "/images/proof-table/art.webp");
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test("slate upload route forwards valid resize requests and ignores invalid widths", async () => {
  const calls = [];
  const route = loader({ "@/lib/storage": { serveUpload: (...args) => { calls.push(args); return new Response(); } } })("app/images/proof-table/[name]/route.ts");
  for (const width of ["320", "NaN", "-5", "Infinity"]) {
    await route.GET(new Request(`https://test.invalid/images/proof-table/art.webp?w=${width}`), { params: Promise.resolve({ name: "art.webp" }) });
  }
  assert.deepEqual(calls.map((args) => args[2]), [320, undefined, undefined, undefined]);
  assert.equal(calls[0][0], "uploads/proof/");
});

test("browser image conversion releases decoded pixels after success and each failure path", async () => {
  const previous = new Map(["document", "createImageBitmap"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const { prepareImage } = loader()("app/portal/upload.ts");
    for (const mode of ["success", "no-context", "draw-failed", "encode-failed", "empty-blob"]) {
      let closed = 0;
      const canvases = [];
      Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 20, height: 10, close: () => closed++ }) });
      Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => {
        const canvas = {
          width: 0, height: 0,
          getContext: () => mode === "no-context" ? null : { drawImage: () => { if (mode === "draw-failed") throw new Error("draw failed"); } },
          toBlob: (done) => { if (mode === "encode-failed") throw new Error("encode failed"); done(mode === "empty-blob" ? null : new Blob(["test"], { type: "image/webp" })); },
        };
        canvases.push(canvas);
        return canvas;
      } } });
      const result = prepareImage(new File(["test"], "test.bmp", { type: "image/bmp" }));
      if (mode === "success") assert.equal((await result).name, "test.webp");
      else await assert.rejects(result);
      assert.equal(closed, 1, mode);
      assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0), mode);
    }
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Photoshop limits reject large files and decoded dimensions before allocating pixels", async () => {
  const read = loader();
  const { MAX_PSD_MB, assertPsdBounds } = read("app/portal/psd-budget.ts");
  assert.doesNotThrow(() => assertPsdBounds(4000, 4000, 8));
  for (const args of [[8000, 8000], [10000, 1], [4000, 4000, 16], [NaN, 4]]) assert.throws(() => assertPsdBounds(...args), /too large/);
  const large = { name: "large.psd", size: (MAX_PSD_MB + 1) * 1024 * 1024 };
  assert.match(read("app/portal/upload.ts").checkFile(large, "psd"), /64 MB/);
  const { readPsdLayers } = read("app/portal/psd.ts");
  await assert.rejects(readPsdLayers({ ...large, arrayBuffer: () => { throw new Error("must not read"); } }), /limited to 64 MB/);
});

test("Photoshop imports decode one layer at a time, preserve placement, and release pixels", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const sources = [];
  const draws = [];
  let decoded = 0;
  const layers = [
    { name: "Bottom", left: 10, top: 20, right: 30, bottom: 50, opacity: .5, rawData: { bitsPerChannel: 8 } },
    { name: "Top", left: 30, top: 40, right: 50, bottom: 60, rawData: { bitsPerChannel: 8 } },
    { name: "Hidden", left: 0, top: 0, right: 50, bottom: 60, hidden: true, rawData: { bitsPerChannel: 8 } },
  ];
  const context = { drawImage: (...args) => draws.push(args), globalAlpha: 1 };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    const { readPsdLayers } = loader({ "ag-psd": {
      readPsd: (_, options) => {
        assert.equal(options.useRawData, true);
        assert.equal(options.skipCompositeImageData, true);
        return { width: 100, height: 100, bitsPerChannel: 8, children: layers };
      },
      getLayerCanvas: (layer) => {
        assert.ok(sources.every(c => c.width === 0), "Previous source pixels released before decoding next layer");
        decoded++;
        const canvas = { width: layer.right-layer.left, height: layer.bottom-layer.top };
        sources.push(canvas);
        return canvas;
      },
    } })("app/portal/psd.ts");
    const result = await readPsdLayers({ size: 100, arrayBuffer: async () => new ArrayBuffer(0) });
    assert.equal(decoded, 0);
    assert.equal(result.layers.length, 2);
    assert.equal(result.skipped, 1);
    const canvas = result.layers[0].draw();
    assert.equal(canvas.width, 100);
    assert.deepEqual(draws[0].slice(1), [10,20,20,30]);
    assert.equal(context.globalAlpha, .5);
    assert.equal(sources[0].width, 0);
    assert.equal(layers[0].rawData, undefined);
    result.dispose();
    assert.ok(layers.every(layer => !layer.rawData), "Unused layers are released on failure or completion too");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("layer PNG conversion releases its canvas even when encoding throws", async () => {
  const { canvasToPng } = loader()("app/portal/psd.ts");
  const canvas = { width: 100, height: 100, toBlob: () => { throw new Error("encoder failed"); } };
  await assert.rejects(canvasToPng(canvas, "layer.png"), /encoder failed/);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test("real Photoshop raw decoding preserves layer pixels, transparency and order", () => {
  const psd = nativeRequire("ag-psd");
  psd.initializeCanvas(() => { throw new Error("This fixture uses image data only"); },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
  const pixels = new Uint8ClampedArray([255,20,40,128, 10,80,120,255, 0,0,0,0, 70,90,110,200]);
  const imageData = { width: 2, height: 2, data: pixels };
  const bytes = psd.writePsdBuffer({ width: 2, height: 2, imageData, children: [
    { name: "Bottom", left: 0, top: 0, imageData },
    { name: "Top", left: 0, top: 0, imageData },
  ] });
  const decoded = psd.readPsd(bytes, { useRawData: true, skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  assert.deepEqual(decoded.children.map(layer => layer.name), ["Bottom", "Top"]);
  for (const layer of decoded.children) {
    assert.equal(layer.canvas, undefined);
    assert.deepEqual(psd.getLayerImageData(layer).data, pixels);
  }
});

test("image processing bounds concurrency without queuing buffers and recovers after failures", async () => {
  const { createImageWorkGate, isImageBusyError } = loader()("lib/portal/image-work.ts");
  const run = createImageWorkGate();
  let finish;
  let unexpectedCalls = 0;
  const first = run(() => new Promise((resolve) => { finish = resolve; }));
  await assert.rejects(run(async () => { unexpectedCalls++; }), isImageBusyError);
  assert.equal(unexpectedCalls, 0);
  finish("done");
  assert.equal(await first, "done");
  await assert.rejects(run(async () => { throw new Error("decode failed"); }), /decode failed/);
  await assert.rejects(run(() => { throw new Error("sync failure"); }), /sync failure/);
  assert.equal(await run(async () => "ready"), "ready");
  assert.equal(unexpectedCalls, 0);
});

test("server image processing resizes normal images and rejects oversized decoded dimensions", async () => {
  const sharp = nativeRequire("sharp");
  const { processImage } = loader()("lib/portal/image.ts");
  const input = await sharp({ create: { width: 32, height: 16, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const result = await processImage(input, { max: 16, quality: 90 });
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 8);
  assert.equal(metadata.hasAlpha, true);
  // Change only the PNG's declared size; the guard must reject it before allocating those pixels.
  const huge = Buffer.from(input);
  huge.writeUInt32BE(8000, 16);
  huge.writeUInt32BE(8000, 20);
  let crc = 0xffffffff;
  for (const byte of huge.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  huge.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  await assert.rejects(processImage(huge, { max: 16, quality: 90 }), /too many pixels/);
});

// Compile in memory so the test exercises the real TypeScript without adding a build or a test dependency.

test("uploaded artwork quality reaches both routes and stays in bounded cache variants", async () => {
  const read=loader();
  const {default:imageLoader}=read("lib/image-loader.ts");
  const {uploadImageQuality}=read("lib/image-quality.ts");
  for(const q of [75,82,90,95]) {
    const url=new URL(imageLoader({src:"/images/uploads/art.webp?v=abc&q=75",width:1280,quality:q}),"https://test.invalid");
    assert.deepEqual(url.searchParams.getAll("q"),[String(q)]);
    assert.equal(url.searchParams.get("v"),"abc");
  }
  for(const q of [undefined,NaN,Infinity,-1,0]) assert.equal(uploadImageQuality(q),82);
  assert.equal(uploadImageQuality(100),95);
  assert.equal(uploadImageQuality(89),90);
  for(const folder of ["uploads","proof-table"]) {
    const calls=[];
    const route=loader({"@/lib/storage":{serveUpload:(...args)=>{calls.push(args);return new Response();}}})(`app/images/${folder}/[name]/route.ts`);
    await route.GET(new Request(`https://test.invalid/images/${folder}/art.webp?w=1280&q=95`),{params:Promise.resolve({name:"art.webp"})});
    assert.equal(calls[0][2],1280);
    assert.equal(calls[0][3],95);
  }
});

test("resized artwork caches quality separately and streams vector originals unchanged", async () => {
  const key=Symbol.for("__cloudflare-context__");
  const previous=globalThis[key];
  const oldCaches=Object.getOwnPropertyDescriptor(globalThis,"caches");
  const cache=new Map(),jobs=[],transforms=[],outputs=[];
  const bytes=()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("source"));c.close();}});
  globalThis[key]={env:{
    PORTAL_BUCKET:{get:async()=>({body:bytes(),httpMetadata:{contentType:"image/svg+xml"}})},
    IMAGES:{input:()=>({transform:opts=>{transforms.push(opts);return {output:async out=>{outputs.push(out);return {image:bytes,contentType:()=>"image/webp"};}};}})},
  },ctx:{waitUntil:p=>jobs.push(p)}};
  Object.defineProperty(globalThis,"caches",{configurable:true,value:{default:{
    match:async req=>cache.has(req.url)?new Response(cache.get(req.url),{headers:{"Content-Type":"image/webp"}}):undefined,
    put:async(req,res)=>{cache.set(req.url,await res.text());},
  }}});
  try {
    const {serveUpload}=loader()("lib/storage.ts");
    for(const q of [90,95,95]) {
      const res=await serveUpload("uploads/images/","test.webp",1280,q);
      assert.equal(res.status,200);await res.text();await Promise.all(jobs);
    }
    assert.deepEqual(outputs.map(o=>o.quality),[90,95]);
    assert.equal(cache.size,2);
    assert.ok(transforms.every(t=>t.fit==="scale-down"&&t.width===1280));
    const svg=await serveUpload("uploads/images/","test.svg",1280,95);
    assert.equal(svg.headers.get("Content-Type"),"image/svg+xml");
    assert.equal(await svg.text(),"source");
    assert.equal(outputs.length,2);
  } finally {
    if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;
    if(oldCaches)Object.defineProperty(globalThis,"caches",oldCaches);else delete globalThis.caches;
  }
});

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const require = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith(".") && !name.startsWith("@/")) return nativeRequire(name);
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, base + ".ts", base + ".tsx", base + ".json"].find((p) => existsSync(p));
      if (!resolved) throw new Error(`Missing test module ${name}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
    return loaded.exports;
  }
  return (file) => load(path.join(root, file));
}

// Exercise the actual form handlers with deferred responses, without accounts or outgoing email.
function loginHarness() {
  const slots = [];
  let cursor = 0;
  let refreshes = 0;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const { PortalLogin } = loader({
    react: {
      useState: state,
      useRef: (initial) => state({ current: initial })[0],
      useTransition: () => [false, (fn) => fn()],
    },
    "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "./portal.module.css": {},
  })("app/portal/PortalLogin.tsx");
  return {
    render() {
      cursor = 0;
      const nodes = [];
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        walk(node.props?.children);
      };
      walk(PortalLogin({ configured: true, emailLogin: true }));
      return {
        find: (type) => nodes.find((node) => node.type === type),
        input: (id) => nodes.find((node) => node.props.id === id),
        button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text),
        nodes,
      };
    },
    refreshes: () => refreshes,
  };
}

test("sign-in suppresses duplicate requests, locks all form controls, and recovers after a connection failure", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  let fail;
  globalThis.fetch = (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Promise((resolve, reject) => { fail = reject; });
  };
  try {
    const ui = loginHarness();
    let screen = ui.render();
    screen.input("portal-username").props.onChange({ target: { value: " dolly " } });
    screen.input("portal-password").props.onChange({ target: { value: "test-only-password" } });
    screen = ui.render();
    const submit = screen.find("form").props.onSubmit;
    const pending = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.username, "dolly");
    assert.equal(ui.render().find("fieldset").props.disabled, true);
    fail(new Error("offline"));
    await pending;
    screen = ui.render();
    assert.equal(screen.find("fieldset").props.disabled, false);
    assert.ok(screen.nodes.some((node) => node.props.role === "alert"));
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await screen.find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(ui.refreshes(), 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test("emailed code accepts spaced paste, refuses incomplete codes, and clears notices when returning", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    const ui = loginHarness();
    ui.render().button("Email me a sign-in code instead").props.onClick();
    ui.render().input("portal-mail").props.onChange({ target: { value: "test@example.invalid" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.ok(ui.render().nodes.some((node) => node.props.role === "status"));
    ui.render().input("portal-mailcode").props.onChange({ target: { value: "123" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests.length, 1);
    ui.render().input("portal-mailcode").props.onChange({ target: { value: "123 456" } });
    assert.equal(ui.render().input("portal-mailcode").props.value, "123456");
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests[1].body.code, "123456");
    assert.equal(ui.refreshes(), 1);
    ui.render().button("Send a new code").props.onClick();
    assert.equal(ui.render().nodes.some((node) => node.props.role === "status"), false);
  } finally {
    globalThis.fetch = previous;
  }
});

test("login rejects malformed success responses and explains blocked requests without opening the portal", async () => {
  const previous = globalThis.fetch;
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "dolly" } });
    ui.render().input("portal-password").props.onChange({ target: { value: "test-password" } });
    for (const [status, payload, message] of [
      [200, null, /unexpected response/],
      [200, {}, /could not confirm/],
      [200, { needsCode: true }, /start verification/],
      [403, { error: "Forbidden." }, /Reload this page/],
    ]) {
      globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => payload });
      await ui.render().find("form").props.onSubmit({ preventDefault() {} });
      assert.match(ui.render().nodes.find((node) => node.props.role === "alert").props.children, message);
      assert.equal(ui.render().find("fieldset").props.disabled, false);
      assert.equal(ui.refreshes(), 0);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("password recovery blocks mismatches, preserves the login address, and hides revealed passwords on navigation", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, emailEnabled: true }) };
  };
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "artist@example.invalid" } });
    ui.render().button("Show").props.onClick();
    assert.equal(ui.render().input("portal-password").props.type, "text");
    ui.render().button("Forgot your password?").props.onClick();
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    ui.render().input("reset-code").props.onChange({ target: { value: "123456" } });
    ui.render().input("reset-new").props.onChange({ target: { value: "test-only-passphrase" } });
    ui.render().input("reset-confirm").props.onChange({ target: { value: "different-passphrase" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests.length, 1, "a password mismatch must never reach the server");
    ui.render().input("reset-confirm").props.onChange({ target: { value: "test-only-passphrase" } });
    ui.render().button("Show passwords").props.onClick();
    assert.equal(ui.render().input("reset-new").props.type, "text");
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests[1].url, "/api/portal/reset/confirm");
    assert.equal(ui.render().input("portal-username").props.value, "artist@example.invalid");
    assert.equal(ui.render().input("portal-password").props.value, "");
    assert.equal(ui.render().input("portal-password").props.type, "password");
    assert.equal(ui.refreshes(), 0, "resetting a password must not bypass sign-in");
  } finally {
    globalThis.fetch = previous;
  }
});

test("a stalled login request times out and unlocks the form for another attempt", async () => {
  const previous = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let expire;
  let cleared = false;
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 20_000); expire = fn; return 1; };
  globalThis.clearTimeout = () => { cleared = true; };
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "dolly" } });
    ui.render().input("portal-password").props.onChange({ target: { value: "test-password" } });
    const pending = ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(ui.render().find("fieldset").props.disabled, true);
    expire();
    await pending;
    assert.equal(ui.render().find("fieldset").props.disabled, false);
    assert.match(ui.render().nodes.find((node) => node.props.role === "alert").props.children, /took too long/);
    assert.equal(cleared, true);
    assert.equal(ui.refreshes(), 0);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("password sign-in passes a supported long email to authentication without truncating it", async () => {
  const { NextRequest } = nativeRequire("next/server");
  let received;
  const route = loader({
    "@/lib/portal/auth": { isPortalConfigured: async () => true },
    "@/lib/rate-limit": { tooManyFailures: () => false, noteFailure() {} },
    "@/lib/portal/activity": { clientIp: () => "test-only", logActivity: async () => {} },
    "@/lib/portal/otp": {},
    "@/lib/portal/mail": {},
    "@/lib/portal/users": { normalizeUsername: (value) => value.toLowerCase(), verifyLogin: async (value) => { received = value; return null; } },
  })("app/api/portal/session/route.ts");
  const email = `${"a".repeat(60)}@example.invalid`;
  const response = await route.POST(new NextRequest("http://localhost/api/portal/session", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ username: ` ${email} `, password: "test-only" }),
  }));
  assert.equal(received, email);
  assert.equal(response.status, 401);
});

const load = loader();

test("preview navigation opens cards without intercepting edit controls, filters, dialogs or modified clicks", () => {
  const previous = new Map(["window", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  const navigated = [];
  const root = { dataset: {} };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost:3000/work?portal-preview" } } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      documentElement: root,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    } });
    const { bindPreviewNavigation, previewDestination } = loader()("lib/content/preview-navigation.ts");
    const cleanup = bindPreviewNavigation((href) => navigated.push(href));
    const click = ({ href, ui = false, ctrlKey = false, download = false } = {}) => {
      const anchor = href ? { target: "", getAttribute: () => href, hasAttribute: () => download } : null;
      const event = {
        target: { closest: (selector) => selector === "[data-ed-ui]" ? (ui ? {} : null) : anchor },
        button: 0, ctrlKey, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      listeners.get("click")(event);
      return event;
    };
    assert.equal(click().defaultPrevented, false, "service buttons and filters must retain their handlers");
    assert.equal(click({ href: "/work/film", ui: true }).defaultPrevented, false, "only the Edit button's own handler edits");
    assert.equal(click({ href: "/work/film", ctrlKey: true }).defaultPrevented, false);
    assert.equal(click({ href: "/work/film", download: true }).defaultPrevented, false);
    assert.equal(click({ href: "https://example.invalid/work/film" }).defaultPrevented, false);
    assert.equal(click({ href: "/work/film?view=full#images" }).stopped, true);
    assert.deepEqual(navigated, ["/work/film?view=full&portal-preview=#images"]);
    assert.equal(previewDestination("/process/design", "http://localhost:3000/?portal-preview"), "/process/design?portal-preview=");
    assert.equal(previewDestination("/work/film", "http://localhost:3000/"), null);
    assert.equal(previewDestination("#contact", window.location.href), null);
    assert.equal(previewDestination("/portal", window.location.href), null);
    root.dataset.ddsDragged = "1";
    assert.equal(click({ href: "/work/other" }).defaultPrevented, true);
    assert.equal(navigated.length, 1);
    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Add controls remain present for populated and empty filtered galleries and send exact nested edit targets", () => {
  const nodes = (tree) => {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!tree || typeof tree !== "object") return [];
    return [tree, ...nodes(tree.props?.children)];
  };
  const content = json("content/site-content.json");
  const AddContent = () => null;
  for (const [projects, selected] of [[[], "All"], [content.projects, "All"], [content.projects, "Empty category"]]) {
    const { WorkGrid } = loader({
      react: { useState: () => [selected, () => {}] },
      "@/lib/content/context": { useContent: () => ({ ...content, categories: [...content.categories, "Empty category"] }) },
      "./ProjectCard": { ProjectCard: () => null },
      "./PreviewControls": { AddContent },
      "./WorkGrid.module.css": {},
    })("components/WorkGrid.tsx");
    const add = nodes(WorkGrid({ projects })).find((node) => node.type === AddContent);
    assert.equal(add.props.list, "projects");
    assert.equal(add.props.count, content.projects.length, "capacity must count all projects, not just the current filter");
  }
  const controls = loader({ "./PreviewControls.module.css": {} })("components/PreviewControls.tsx");
  assert.equal(nodes(controls.AddContent({ list: "projects", label: "Add", count: 0, max: 100 })).find((node) => node.type === "button").props.disabled, false);
  assert.equal(nodes(controls.AddContent({ list: "projects", label: "Add", count: 100, max: 100 })).find((node) => node.type === "button").props.disabled, true);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const sent = [];
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost" }, parent: { postMessage: (message) => sent.push(message) } } });
    const event = { preventDefault() {}, stopPropagation() {} };
    nodes(controls.AddContent({ list: "projects.2.images", label: "Add image", count: 3 })).find((node) => node.type === "button").props.onClick(event);
    nodes(controls.EditContent({ item: "services.2.gallery.4", label: "Edit image" })).find((node) => node.type === "button").props.onClick(event);
    assert.deepEqual(sent, [
      { source: "dds-site", type: "edit-add", list: "projects.2.images" },
      { source: "dds-site", type: "edit-open", item: "services.2.gallery.4" },
    ]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});

test("unpublished project and process pages open only for an authenticated preview", async () => {
  const content = json("content/site-content.json");
  let signedIn = false;
  const missing = new Error("not found");
  const modules = loader({
    "next/navigation": { notFound: () => { throw missing; } },
    "@/lib/portal/auth": { getPortalUser: async () => signedIn ? { id: "test-owner" } : null },
    "@/lib/content/store": { getContent: async () => content },
    "@/components/ProjectView": { ProjectView: () => null },
    "@/components/ProcessView": { ProcessView: () => null },
  });
  for (const file of ["app/work/[slug]/page.tsx", "app/process/[slug]/page.tsx"]) {
    const page = modules(file).default;
    const params = Promise.resolve({ slug: "unpublished-test-card" });
    signedIn = false;
    await assert.rejects(page({ params, searchParams: Promise.resolve({}) }), (error) => error === missing);
    await assert.rejects(page({ params, searchParams: Promise.resolve({ "portal-preview": "" }) }), (error) => error === missing);
    signedIn = true;
    await assert.rejects(page({ params, searchParams: Promise.resolve({}) }), (error) => error === missing);
    const view = await page({ params, searchParams: Promise.resolve({ "portal-preview": "" }) });
    assert.equal(view.props.slug, "unpublished-test-card");
  }
});

test("section buttons preserve preview and other query parameters through subsequent navigation", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let url = new URL("https://local/?portal-preview&draft=one");
  const section = {};
  try {
    globalThis.window = { get location() { return url; }, history: { state: {}, pushState(_state, _title, href) { url = new URL(href, url); } } };
    globalThis.document = { getElementById: () => section };
    const app = loader({ "./smooth-scroll": { glideTo() {} } });
    assert.equal(app("lib/section-nav.ts").goToSection("contact"), true);
    assert.equal(url.search, "?portal-preview&draft=one");
    assert.equal(url.hash, "#contact");
    assert.match(app("lib/intro/preview-protocol.ts").withPreview("/process/sketchboards"), /portal-preview/);
    app("lib/section-nav.ts").goToSection();
    assert.equal(url.search, "?portal-preview&draft=one");
    assert.equal(url.hash, "");
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test("multipart uploads bound actual bytes and cancel oversized streams without Content-Length", async () => {
  const { readUploadForm, UploadTooLargeError } = loader()("lib/portal/body-limit.ts");
  const form = new FormData();form.set("file", new File(["small"], "small.png", { type: "image/png" }));
  const req = new Request("https://local/upload", { method: "POST", body: form });
  req.headers.delete("Content-Length");
  assert.equal((await readUploadForm(req, 32)).get("file").size, 5);
  for (const declared of [undefined, "1"]) {
    let cancelled = false;let reads = 0;
    const body = new ReadableStream({pull(c) { reads++;c.enqueue(new Uint8Array(40_000)); },cancel() { cancelled = true; }});
    const headers = new Headers({"Content-Type":"multipart/form-data; boundary=bounded"});
    if (declared) headers.set("Content-Length",declared);
    const request = new Request("https://local/upload", {method:"POST",headers,body,duplex:"half"});
    await assert.rejects(readUploadForm(request,32),error=>error instanceof UploadTooLargeError);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(cancelled,true);assert.ok(reads<=4,`Read ${reads} chunks after exceeding limit`);
  }
});

test("conditional R2 OTP writes allow only one concurrent redemption and retain every failed attempt", async () => {
  const symbol = Symbol.for("__cloudflare-context__");
  const before = globalThis[symbol];
  let text = null;let version = 0;
  const bucket = {
    async get() {const snapshot = text;const etag=String(version);return snapshot === null ? null : {etag,text:async()=>snapshot};},
    async put(_key, value, options) {
      const condition=options.onlyIf;
      if (condition.get("If-None-Match")==="*" ? text!==null : condition.get("If-Match")!==JSON.stringify(String(version))) return null;
      text=value;version++;return {etag:String(version)};
    },
  };
  try {
    globalThis[symbol]={env:{PORTAL_BUCKET:bucket}};
    // Independent module instances share only R2, as separate deployed Workers do.
    const a=loader()("lib/portal/otp.ts"), b=loader()("lib/portal/otp.ts");
    const issued=await a.issueCode("reset","test-user");
    const results=await Promise.all([a.checkCode("reset","test-user",issued.code),b.checkCode("reset","test-user",issued.code)]);
    assert.equal(results.filter(r=>r.ok).length,1);
    const next=await a.issueCode("reset","test-user");
    await Promise.all(Array.from({length:5},(_,i)=>(i%2?a:b).checkCode("reset","test-user","not-a-code")));
    assert.equal(JSON.parse(text)[0].attempts,5);
    assert.deepEqual(await b.checkCode("reset","test-user",next.code),{ok:false,reason:"locked"});
  } finally {if(before===undefined)delete globalThis[symbol];else globalThis[symbol]=before;}
});

function accountFixture() {
  const docs = new Map();
  const sent = [];
  let sequence = 0;
  let me = null;
  let deliveryOk = true;
  let atomicTail = Promise.resolve();
  const storage = {
    getText: async (key) => docs.get(key) ?? null,
    putText: async (key, value) => { docs.set(key, value); },
    list: async (prefix) => [...docs.keys()].filter((key) => key.startsWith(prefix)),
  };
  const app = loader({
    "@/lib/storage": {
      store: async () => storage,
      writeJson: async (key, value) => docs.set(key, JSON.stringify(value)),
      updateJsonAtomically: (key, initial, change) => {
        const task = atomicTail.then(() => {
          const next = change(docs.has(key) ? JSON.parse(docs.get(key)) : structuredClone(initial));
          if (next.value !== undefined) docs.set(key, JSON.stringify(next.value));
          return next.result;
        });
        atomicTail = task.then(() => {}, () => {});
        return task;
      },
      writeJsonSafely: async (key, value) => {
        if (docs.has(key)) docs.set(`data/backups/people/${sequence++}.json`, docs.get(key));
        docs.set(key, JSON.stringify(value));
      },
    },
    "@/lib/portal/auth": {
      getPortalUser: async () => me,
      createSessionToken: (id, version) => `test.${id}.${version}`,
      sessionCookie: (value) => ({ name: "dds_portal", value, httpOnly: true }),
    },
    "@/lib/rate-limit": { tooManyFailures: () => false, noteFailure() {}, isRateLimited: () => false },
    "@/lib/portal/activity": { clientIp: () => "test-only", logActivity: async () => {} },
    "@/lib/portal/mail": {
      canRecoverByMail: () => false,
      isMailConfigured: () => true,
      studioMailboxes: () => ["studio@example.invalid"],
      codeEmail: (input) => ({ subject: input.purpose, text: input.code, html: "" }),
      sendMail: async (input) => { sent.push(input); return deliveryOk ? { ok: true } : { ok: false, reason: "failed" }; },
    },
  });
  const { NextRequest } = nativeRequire("next/server");
  return {
    docs, sent,
    users: app("lib/portal/users.ts"),
    otp: app("lib/portal/otp.ts"),
    route: (file) => app(file),
    as: (user) => { me = user; },
    delivery: (ok) => { deliveryOk = ok; },
    request: (body, method = "POST") => new NextRequest("http://localhost/api/portal/test", {
      method, headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  };
}

test("portal username/password changes keep ownership checks and invalidate old passwords, sessions and codes", async () => {
  const f = accountFixture();
  const original = await f.users.createUser({ username: "owner", name: "Owner", password: "Original-phrase-123", role: "owner", email: "owner@example.invalid" });
  const editor = await f.users.createUser({ username: "editor", name: "Editor", password: "Editor-phrase-123", role: "editor" });
  f.as(editor);
  const route = f.route("app/api/portal/users/route.ts");
  assert.equal((await route.DELETE(f.request({ id: original.id }, "DELETE"))).status, 403);
  f.as(original);
  const changed = await f.users.changeUsername(original.id, "new-owner");
  assert.equal(await f.users.verifyLogin("owner", "Original-phrase-123"), null);
  assert.ok(await f.users.verifyLogin("new-owner", "Original-phrase-123"));
  f.as(changed);
  await f.otp.issueCode("reset", original.id);
  await f.otp.issueCode("login", "mail:owner@example.invalid");
  assert.equal((await route.PATCH(f.request({ id: original.id, currentPassword: "wrong", password: "New-phrase-123" }, "PATCH"))).status, 400);
  const response = await route.PATCH(f.request({ id: original.id, currentPassword: "Original-phrase-123", password: "New-phrase-123" }, "PATCH"));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie"));
  assert.equal(await f.users.userForSession(original.id, 1), null);
  assert.equal(await f.users.verifyLogin("new-owner", "Original-phrase-123"), null);
  assert.ok(await f.users.verifyLogin("new-owner", "New-phrase-123"));
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-otps.json")), []);
});

test("deleting a user removes restorable credentials and both kinds of OTP without changing other accounts", async () => {
  const f = accountFixture();
  const owner = await f.users.createUser({ username: "owner", name: "Owner", password: "Owner-phrase-123", role: "owner" });
  const person = await f.users.createUser({ username: "person", name: "Person", password: "Person-phrase-123", role: "editor", email: "person@example.invalid" });
  await f.users.updateUser(person.id, { name: "Person updated" });
  const beforeOwner = JSON.parse(f.docs.get("data/portal-users.json")).users.find((u) => u.id === owner.id);
  await f.otp.issueCode("reset", person.id);
  await f.otp.issueCode("login", "mail:person@example.invalid");
  const keep = await f.otp.issueCode("reset", owner.id);
  f.as(owner);
  const response = await f.route("app/api/portal/users/route.ts").DELETE(f.request({ id: person.id }, "DELETE"));
  assert.equal(response.status, 200);
  assert.equal(await f.users.userForSession(person.id, 1), null);
  assert.equal(await f.users.verifyLogin("person", "Person-phrase-123"), null);
  for (const [key, text] of f.docs) {
    if (key.includes("portal-users") || key.includes("backups/people")) assert.equal(text.includes(person.id), false, key);
  }
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-users.json")).users, [beforeOwner]);
  assert.equal((await f.otp.checkCode("reset", owner.id, keep.code)).ok, true);
  await assert.rejects(f.users.removeUser(owner.id), /last owner/);
  const replacement = await f.users.createUser({ username: "other-owner", name: "Other owner", password: "Other-owner-phrase-123", role: "owner" });
  const selfDelete = await f.route("app/api/portal/users/route.ts").DELETE(f.request({ id: owner.id }, "DELETE"));
  assert.deepEqual(await selfDelete.json(), { ok: true, signedOut: true });
  assert.ok(selfDelete.headers.get("set-cookie"));
  assert.equal(await f.users.userForSession(owner.id, 1), null);
  assert.equal((await f.users.listUsers())[0].id, replacement.id);
});

test("forgot password emails an OTP, enforces cooldown, changes the password once and signs out old sessions", async () => {
  const f = accountFixture();
  const person = await f.users.createUser({ username: "artist", name: "Artist", password: "Original-phrase-123", role: "owner", email: "artist@example.invalid" });
  const request = f.route("app/api/portal/reset/request/route.ts");
  const confirm = f.route("app/api/portal/reset/confirm/route.ts");
  const response = await request.POST(f.request({ identifier: "artist" }));
  assert.deepEqual(await response.json(), { ok: true, emailEnabled: true });
  assert.equal(f.sent[0].to, "artist@example.invalid");
  const code = f.sent[0].text;
  assert.match(code, /^\d{6}$/);
  assert.equal(f.docs.get("data/portal-otps.json").includes(`"${code}"`), false);
  await request.POST(f.request({ identifier: "artist" }));
  assert.equal(f.sent.length, 1);
  const unknown = await request.POST(f.request({ identifier: "unknown-person" }));
  assert.deepEqual(await unknown.json(), { ok: true, emailEnabled: true });
  assert.equal(f.sent.length, 1);
  const weak = await confirm.POST(f.request({ identifier: "artist", code, password: "short" }));
  assert.equal(weak.status, 400);
  const done = await confirm.POST(f.request({ identifier: "artist", code, password: "Replacement-phrase-123" }));
  assert.equal(done.status, 200);
  assert.equal(await f.users.userForSession(person.id, 1), null);
  assert.ok(await f.users.verifyLogin("artist", "Replacement-phrase-123"));
  const replay = await confirm.POST(f.request({ identifier: "artist", code, password: "Another-phrase-123" }));
  assert.equal(replay.status, 400);
});

test("failed OTP delivery allows a fresh retry, and wrong or expired codes never verify", async () => {
  const f = accountFixture();
  const person = await f.users.createUser({ username: "artist", name: "Artist", password: "Original-phrase-123", role: "owner", email: "artist@example.invalid" });
  const request = f.route("app/api/portal/reset/request/route.ts");
  f.delivery(false);
  await request.POST(f.request({ identifier: "artist" }));
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-otps.json")), []);
  f.delivery(true);
  await request.POST(f.request({ identifier: "artist" }));
  assert.equal(f.sent.length, 2, "a failed delivery must not start a cooldown");
  const code = f.sent[1].text;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await f.otp.checkCode("reset", person.id, wrong)).ok, false);
  assert.deepEqual(await f.otp.checkCode("reset", person.id, code), { ok: false, reason: "locked" });
  await f.otp.clearCodes(person.id);
  const fresh = await f.otp.issueCode("reset", person.id);
  const rows = JSON.parse(f.docs.get("data/portal-otps.json"));
  rows[0].expires = Date.now() - 1;
  f.docs.set("data/portal-otps.json", JSON.stringify(rows));
  assert.deepEqual(await f.otp.checkCode("reset", person.id, fresh.code), { ok: false, reason: "expired" });
});

test("the configured studio mailbox can recover a fresh owner after accounts are deleted", async () => {
  const f = accountFixture();
  const owner = await f.users.createUser({ username: "old-owner", name: "Old owner", password: "Original-phrase-123", role: "owner", email: "studio@example.invalid" });
  await f.users.removeUser(owner.id, { allowLastOwner: true });
  assert.deepEqual(await f.users.listUsers(), []);
  await f.route("app/api/portal/reset/request/route.ts").POST(f.request({ identifier: "studio@example.invalid" }));
  assert.equal(f.sent[0].to, "studio@example.invalid");
  const response = await f.route("app/api/portal/reset/confirm/route.ts").POST(f.request({ identifier: "studio@example.invalid", code: f.sent[0].text, password: "Recovered-phrase-123" }));
  assert.equal(response.status, 200);
  const recovered = await f.users.verifyLogin("studio@example.invalid", "Recovered-phrase-123");
  assert.equal(recovered.user.role, "owner");
  assert.notEqual(recovered.user.id, owner.id);
  assert.equal(await f.users.userForSession(owner.id, 1), null);
});

test("invalid account storage and unreadable backups stop account mutations", async () => {
  const f = accountFixture();
  f.docs.set("data/portal-users.json", "{");
  await assert.rejects(f.users.createUser({ username: "new-owner", name: "Owner", password: "Owner-phrase-123", role: "owner" }));
  assert.equal(f.docs.get("data/portal-users.json"), "{");
  f.docs.delete("data/portal-users.json");
  await f.users.createUser({ username: "owner", name: "Owner", password: "Owner-phrase-123", role: "owner" });
  const person = await f.users.createUser({ username: "person", name: "Person", password: "Person-phrase-123", role: "editor" });
  const before = f.docs.get("data/portal-users.json");
  f.docs.set("data/backups/people/broken.json", "{");
  await assert.rejects(f.users.removeUser(person.id));
  assert.equal(f.docs.get("data/portal-users.json"), before);
});

const { resetMedia, protectedMedia, canResetMediaFile } = load("lib/content/reset-media.ts");
const { sanitizeContent } = load("lib/content/sanitize.ts");
const { sanitizeIntroSettings } = load("lib/intro/settings.ts");
const { contentProblems } = load("app/portal/validate.ts");

function fixture() {
  const content = json("content/site-content.json");
  const settings = json("content/intro-settings.json");
  content.projects[0].images[0].src = "/images/uploads/art.webp";
  content.projects[0].brief = "/images/uploads/art.webp is the reference path mentioned in this brief.";
  content.projects[0].images[0].alt = "/images/uploads/art.webp";
  content.clients[0].logo = "/images/uploads/client.webp";
  content.collaborators[0].photo = "/images/uploads/person.webp";
  content.home.founder.photo = "/images/uploads/founder.webp";
  content.pages.home.backdrop = "/images/uploads/backdrop.webp";
  content.breakdowns[0].layers[0].image = "/images/uploads/layer.webp";
  settings.proofTable.items[0].src = "/images/proof-table/title.webp";
  settings.sweep.pattern.src = "/images/uploads/protected-pattern.webp";
  return { content, settings };
}

test("clearing media retains every text value, record, caption, font and non-slate setting", () => {
  const before = fixture();
  const original = clone(before);
  const next = resetMedia(before.content, before.settings);
  assert.deepEqual(before, original, "reset must not mutate its inputs");
  function check(a, b, key = "") {
    if (["src", "image", "photo", "logo", "sample", "backdrop"].includes(key.split(".").at(-1)) && typeof a === "string" && a.startsWith("/images/") && !/^\/images\/(brand|textures|star-textures)\//.test(a)) {
      assert.equal(b, "", key);
    } else if (Array.isArray(a)) {
      assert.equal(b.length, a.length, key);
      a.forEach((value, i) => check(value, b[i], `${key}.${i}`));
    } else if (a && typeof a === "object") {
      assert.deepEqual(Object.keys(b), Object.keys(a), key);
      for (const name of Object.keys(a)) check(a[name], b[name], `${key}.${name}`);
    } else assert.deepEqual(b, a, key);
  }
  check(before.content, next.content);
  check(before.settings.proofTable, next.settings.proofTable);
  const withoutSlate = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "proofTable"));
  assert.deepEqual(withoutSlate(next.settings), withoutSlate(before.settings));
  assert.deepEqual(resetMedia(next.content, next.settings), next, "reset is idempotent");
});

test("saved empty slots survive validation and sanitizing, and can be filled again", () => {
  const { content, settings } = fixture();
  const empty = resetMedia(content, settings);
  const saved = sanitizeContent(empty.content);
  const design = sanitizeIntroSettings(empty.settings);
  assert.equal(saved.projects.length, content.projects.length);
  assert.deepEqual(saved.projects.map((p) => p.images.map((im) => im.alt)), content.projects.map((p) => p.images.map((im) => im.alt)));
  assert.deepEqual(saved.breakdowns.map((b) => b.layers.map((l) => l.label)), content.breakdowns.map((b) => b.layers.map((l) => l.label)));
  assert.equal(design.proofTable.items.length, settings.proofTable.items.length);
  assert.deepEqual(design.proofTable.items.map((it) => it.film), settings.proofTable.items.map((it) => it.film));
  assert.deepEqual(contentProblems(saved), []);
  saved.projects[0].images[0].src = "/images/uploads/new-art.webp";
  saved.breakdowns[0].layers[0].image = "/images/uploads/new-layer.webp";
  design.proofTable.items[0].src = "/images/proof-table/new-title.webp";
  assert.equal(sanitizeContent(saved).projects[0].images[0].src, "/images/uploads/new-art.webp");
  assert.equal(sanitizeContent(saved).breakdowns[0].layers[0].image, "/images/uploads/new-layer.webp");
  assert.equal(sanitizeIntroSettings(design).proofTable.items[0].src, "/images/proof-table/new-title.webp");
});

test("reset file scope excludes intro dependencies, branding, fonts, account data and unsafe paths", () => {
  const { settings } = fixture();
  const keep = protectedMedia(settings);
  assert.equal(canResetMediaFile("uploads/images/art.webp", keep), true);
  assert.equal(canResetMediaFile("uploads/proof/title.webp", keep), true);
  for (const key of ["uploads/images/protected-pattern.webp", "uploads/textures/star.webp", "uploads/fonts/body.woff2", "data/portal-users.json", "images/brand/logo.svg", "uploads/images/../brand/logo.svg", "uploads/images/..secret.webp"]) {
    assert.equal(canResetMediaFile(key, keep), false, key);
  }
});

function server({ user = { id: "owner", role: "owner" }, backupFails = false, saveFails = false, readFails = false, invalidDocument } = {}) {
  let { content, settings } = fixture();
  const original = clone({ content, settings });
  const events = [];
  const files = new Map(["uploads/images/art.webp", "uploads/images/protected-pattern.webp", "uploads/proof/title.webp"].map((key) => [key, "picture"]));
  const s = {
    async getText(key) {
      if (readFails) throw new Error("storage unavailable");
      if (invalidDocument !== undefined) return invalidDocument;
      return JSON.stringify(key === "content/site-content.json" ? content : settings);
    },
    async list(prefix) { return [...files.keys()].filter((key) => key.startsWith(prefix)); },
    async putText(key, text) { events.push(["backup", key]); files.set(key, text); },
    async copy(key, dest) { if (backupFails) throw new Error("archive failed"); events.push(["copy", key]); files.set(dest, files.get(key)); },
    async remove(key) { events.push(["remove", key]); files.delete(key); },
  };
  const route = loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "next/cache": { revalidatePath: () => events.push(["revalidate"]) },
    "@/lib/portal/auth": { getPortalUser: async () => user },
    "@/lib/portal/activity": { logActivity: async () => {} },
    "@/lib/storage": { store: async () => s },
    "@/lib/content/store": {
      getContent: async () => clone(content),
      writeContent: async (value) => { events.push(["content"]); content = clone(value); },
    },
    "@/lib/portal/settings-store": {
      readIntroSettings: async () => clone(settings),
      writeIntroSettings: async (value) => {
        if (saveFails) { saveFails = false; throw new Error("settings save failed"); }
        events.push(["settings"]); settings = clone(value);
      },
    },
  })("app/api/portal/media-reset/route.ts");
  const post = (body, origin = "https://studio.test") => route.POST({ headers: new Headers({ origin }), nextUrl: new URL("https://studio.test/api/portal/media-reset"), json: async () => body });
  return { route, post, events, files, original, state: () => ({ content, settings }) };
}

test("the live reset archives before writes/deletions and preserves the intro dependency", async () => {
  const app = server();
  const review = await (await app.route.GET()).json();
  assert.equal(review.files, 2);
  const res = await app.post({ token: review.token, confirmation: "CLEAR MEDIA" });
  assert.equal(res.status, 200);
  assert.ok(app.events.findIndex(([op]) => op === "content") > app.events.map(([op]) => op).lastIndexOf("copy"));
  assert.ok(app.events.findIndex(([op]) => op === "remove") > app.events.findIndex(([op]) => op === "settings"));
  assert.equal(app.files.has("uploads/images/protected-pattern.webp"), true);
  const archive = [...app.files.entries()].find(([key]) => key.endsWith("/snapshot.json"));
  assert.deepEqual(JSON.parse(archive[1]).content, app.original.content);
  assert.deepEqual(app.state(), resetMedia(app.original.content, app.original.settings));
});

test("invalid saved documents cannot be reset or replaced with defaults", async () => {
  for (const invalidDocument of ["", "null", "[]", "42", "{broken"]) {
    const app = server({ invalidDocument });
    assert.equal((await app.route.GET()).status, 500, invalidDocument);
    assert.equal(app.events.length, 0);
    assert.deepEqual(app.state(), app.original);
  }
});

test("filesystem storage treats only missing files as absent and propagates read/list failures", async () => {
  let code = "ENOENT";
  const fail = async () => { throw Object.assign(new Error("simulated filesystem error"), { code }); };
  const { store } = loader({ "node:fs/promises": { readFile: fail, readdir: fail } })("lib/storage.ts");
  const disk = await store();
  assert.equal(await disk.getText("content/site-content.json"), null);
  assert.equal(await disk.getBytes("uploads/images/example.webp"), null);
  assert.deepEqual(await disk.list("uploads/images/"), []);
  for (code of ["EACCES", "EIO"]) {
    await assert.rejects(disk.getText("content/site-content.json"), { code });
    await assert.rejects(disk.getBytes("uploads/images/example.webp"), { code });
    await assert.rejects(disk.list("uploads/images/"), { code });
  }
});

test("the Cloudflare media library includes newly uploaded slate artwork", async () => {
  const route = loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/activity": {},
    "@/lib/portal/image": {},
    "@/lib/portal/settings-store": { readIntroSettings: async () => fixture().settings },
    "@/lib/storage": { store: async () => ({
      kind: "r2",
      list: async (prefix) => prefix === "uploads/proof/" ? ["uploads/proof/new-title.webp"] : ["uploads/images/new-art.webp"],
    }) },
  })("app/api/portal/media/route.ts");
  const result = await (await route.GET()).json();
  for (const src of ["/images/uploads/new-art.webp", "/images/proof-table/new-title.webp"]) {
    assert.ok(result.images.includes(src));
    assert.ok(result.removable.includes(src));
  }
  assert.equal(result.images.some((src) => src.startsWith("/images/brand/")), false);
});

test("library selections survive search changes by identity and exclude stale or protected files", () => {
  const { librarySelection } = loader()("app/portal/media-selection.ts");
  const images = ["/images/uploads/actor-a.webp", "/images/uploads/actor-b.webp", "/images/uploads/poster.webp", "/images/uploads/intro.webp"];
  const removable = images.slice(0, 3);
  const state = librarySelection(images, removable, [images[2]], "actor-a");
  assert.equal(state.allShownSelected, false, "matching counts are not matching selections");
  assert.equal(state.hiddenSelected, 1);
  const picked = [...new Set([...state.selected, ...state.shownRemovable])];
  const changed = librarySelection(images, removable, picked, " ACTOR ");
  assert.deepEqual(changed.selected, [images[2], images[0]]);
  assert.equal(changed.allShownSelected, false);
  const all = librarySelection(images, removable, images, "");
  assert.deepEqual(all.selected, removable);
  assert.equal(all.allShownSelected, true);
  assert.deepEqual(librarySelection([images[1]], removable, picked, "").selected, []);
  assert.equal(librarySelection([], [], [], "").allShownSelected, false);
});

test("bulk library listings and direct deletion protect intro dependencies", async () => {
  const settings = fixture().settings;
  const removed = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/activity": { logActivity: async () => {} },
    "@/lib/portal/image": {},
    "@/lib/content/store": {},
    "@/lib/portal/settings-store": { readIntroSettings: async () => settings },
    "@/lib/storage": { store: async () => ({
      kind: "r2",
      getText: async () => JSON.stringify(settings),
      list: async (prefix) => prefix === "uploads/images/" ? ["uploads/images/protected-pattern.webp", "uploads/images/art.webp"] : [],
      remove: async (key) => removed.push(key),
    }) },
  };
  const list = loader(mocks)("app/api/portal/media/route.ts");
  const library = await (await list.GET()).json();
  assert.ok(library.images.includes("/images/uploads/protected-pattern.webp"));
  assert.deepEqual(library.removable, ["/images/uploads/art.webp"]);
  const route = loader(mocks)("app/api/portal/storage/route.ts");
  const request = (key, confirmed = true) => ({ headers: new Headers({ origin: "https://studio.test" }), nextUrl: new URL("https://studio.test"), json: async () => ({ key, confirmed }) });
  assert.equal((await route.DELETE(request("uploads/images/protected-pattern.webp"))).status, 409);
  assert.deepEqual(removed, []);
  assert.equal((await route.DELETE(request("uploads/images/art.webp", false))).status, 400);
  assert.equal((await route.DELETE(request("uploads/images/art.webp"))).status, 200);
  assert.deepEqual(removed, ["uploads/images/art.webp"]);
});

test("Cloudflare renders read fresh content/settings after another worker publishes", async () => {
  let { content, settings } = fixture();
  const fresh = loader({
    "next/server": { connection: async () => {} },
    "@/lib/storage": {
      onCloudflare: () => true,
      readJson: async (key) => clone(key === "content/site-content.json" ? content : settings),
    },
  });
  const { getContent } = fresh("lib/content/store.ts");
  const { readIntroSettings } = fresh("lib/portal/settings-store.ts");
  assert.ok((await getContent()).projects[0].images[0].src);
  assert.ok((await readIntroSettings()).proofTable.items[0].src);
  ({ content, settings } = resetMedia(content, settings));
  assert.equal((await getContent()).projects[0].images[0].src, "");
  assert.equal((await readIntroSettings()).proofTable.items[0].src, "");
});

test("the live reset refuses non-owners, cross-origin requests, missing confirmation and stale reviews", async () => {
  for (const user of [null, { role: "editor" }, { role: "owner", setup: true }]) {
    const app = server({ user });
    assert.ok((await app.route.GET()).status >= 400);
    assert.ok((await app.post({})).status >= 400);
    assert.equal(app.events.length, 0);
  }
  const app = server();
  const { token } = await (await app.route.GET()).json();
  assert.equal((await app.post({ token, confirmation: "CLEAR MEDIA" }, "https://elsewhere.test")).status, 403);
  assert.equal((await app.post({ token })).status, 400);
  assert.equal((await app.post({ token: "stale", confirmation: "CLEAR MEDIA" })).status, 409);
  assert.equal(app.events.length, 0);
});

test("storage or backup failure leaves the saved site intact; failed publish restores both documents", async () => {
  const unavailable = server({ readFails: true });
  assert.equal((await unavailable.route.GET()).status, 500);
  assert.equal(unavailable.events.length, 0);
  for (const options of [{ backupFails: true }, { saveFails: true }]) {
    const app = server(options);
    const { token } = await (await app.route.GET()).json();
    assert.equal((await app.post({ token, confirmation: "CLEAR MEDIA" })).status, 500);
    assert.deepEqual(app.state(), app.original);
    assert.equal(app.events.some(([op]) => op === "remove"), false);
  }
});

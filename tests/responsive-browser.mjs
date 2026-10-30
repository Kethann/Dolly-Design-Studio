// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Optional DDS_QA_USERNAME / DDS_QA_PASSWORD enable portal checks. No content is saved.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const targets = await (await fetch("http://127.0.0.1:9227/json/list")).json();
const target = targets.find((t) => t.type === "page" && (t.url === "about:blank" || t.url.startsWith("http://127.0.0.1:3000")));
assert.ok(target, "Open a local test tab in the isolated browser");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map();
const errors = [];
let id = 0;
socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.id) {
    const job = pending.get(event.id);
    pending.delete(event.id);
    if (event.error) job.reject(new Error(event.error.message)); else job.resolve(event.result);
  } else if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text + ": " + (event.params.exceptionDetails.exception?.description ?? ""));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timed out: ${method}`)); }, 45_000);
  pending.set(next, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  socket.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "Evaluation failed");
  return result.result.value;
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression) => {
  const start = Date.now();
  while (Date.now() - start < 45_000) { if (await evaluate(expression)) return; await pause(250); }
  throw new Error(`Timed out: ${expression}`);
};
const output = path.join(os.tmpdir(), "dds-responsive-qa");
await mkdir(output, { recursive: true });
const screenshot = async (name) => {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(output, name + ".png"), Buffer.from(shot.data, "base64"));
};
const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");
try {
  for (const [width, height] of (process.argv.includes("--portal-only") ? [] : [[390, 844], [768, 1024], [1440, 900], [844, 390]])) {
    await viewport(width, height);
    await send("Page.navigate", { url: "http://127.0.0.1:3000/" });
    await send("Page.bringToFront");
    await waitFor('!!document.querySelector("[data-slate-slot]")');
    await pause(1500);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await pause(800);
    await evaluate('document.querySelector("[data-assembly]").scrollIntoView({block:"center",behavior:"instant"})');
    await waitFor('document.querySelector("[data-assembly]").dataset.assembly === "done"');
    const layout = await evaluate(`(() => {
      const scene = document.querySelector('[data-assembly]');
      const table = scene.getBoundingClientRect();
      const section = scene.closest('section');
      const copy = section.querySelector('h2').parentElement.getBoundingClientRect();
      const first = scene.querySelector('[data-slate-slot]').getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        overlap: copy.right > table.left + 2 && table.right > copy.left + 2 && copy.bottom > table.top + 2 && table.bottom > copy.top + 2,
        tableFits: table.left >= 0 && table.right <= innerWidth + 1,
        cursor: {x:first.x + first.width / 2, y:first.y + first.height / 2} };
    })()`);
    assert.equal(layout.overlap, false, `Slate copy overlaps at ${width}`);
    assert.equal(layout.tableFits, true, `Slate overflows at ${width}`);
    assert.ok(layout.scrollWidth <= width + 1, `Page overflow at ${width}: ${layout.scrollWidth}`);
    await screenshot(`slate-${width}`);
    if (width === 1440) {
      const cursor = await evaluate(`(() => {const r=document.querySelector('[data-slate-slot]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...cursor });
      await waitFor('!!document.querySelector("[data-floating=true]")');
      await screenshot("slate-hover");
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await waitFor('!document.querySelector("[data-floating=true]")');
      await send("Emulation.setEmulatedMedia", { features: [] });
    }
    console.log(JSON.stringify({ view: "slate", width, height, overlap: layout.overlap, overflow: layout.scrollWidth > width }));
  }
  if (process.env.DDS_QA_PASSWORD) {
    await send("Page.navigate", { url: "http://127.0.0.1:3000/portal" });
    await waitFor(`location.origin === 'http://127.0.0.1:3000' && document.readyState === 'complete'`);
    const credentials = JSON.stringify({ username: process.env.DDS_QA_USERNAME, password: process.env.DDS_QA_PASSWORD });
    const signedIn = await evaluate(`fetch('/api/portal/session', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(async r=>({status:r.status,ok:(await r.json()).ok}))`);
    assert.equal(signedIn.ok, true, "Local sign-in failed");
    for (const [width, height] of [[390, 844], [768, 1024], [844, 390], [1440, 900]]) {
      await viewport(width, height);
      await send("Page.navigate", { url: "http://127.0.0.1:3000/portal" });
      await send("Page.bringToFront");
      await waitFor(`!!document.querySelector('[aria-label="Portal tools"]')`);
      await pause(800);
      if (width === 390) {
        await waitFor(`Object.keys(document.querySelector('select[aria-label="Choose a page to edit"]')).some(key=>key.startsWith('__reactProps$'))`);
        await evaluate(`(() => {const select=document.querySelector('select[aria-label="Choose a page to edit"]');select.value='work';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await waitFor(`document.querySelector('iframe')?.contentWindow.location.pathname === '/work'`);
        await waitFor(`!!document.querySelector('iframe')?.contentDocument.querySelector('[data-ed-add-list="projects"]')`);
        await waitFor(`(() => {const frame=document.querySelector('iframe');const main=frame.contentDocument.querySelector('main');return main && frame.contentWindow.getComputedStyle(main).opacity === '1' && !frame.contentDocument.querySelector('.intro-curtain');})()`);
      }
      const metrics = await evaluate(`(() => {
        const save = [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save & publish').getBoundingClientRect();
        const tools = document.querySelector('[aria-label="Portal tools"]').getBoundingClientRect();
        const frame = document.querySelector('iframe').getBoundingClientRect();
        return {save: {x:save.x,right:save.right,bottom:save.bottom},tools:{top:tools.top,bottom:tools.bottom},frame:{top:frame.top,bottom:frame.bottom},width:innerWidth,height:innerHeight};
      })()`);
      assert.ok(metrics.save.x >= 0 && metrics.save.right <= width + 1, `Publish offscreen at ${width}`);
      assert.ok(metrics.frame.bottom <= metrics.tools.top + 1, `Dock covers preview at ${width}`);
      await screenshot(`portal-${width}`);
      await evaluate(`document.querySelector('[data-dock-item][aria-label*="Image"]')?.click()`);
      await waitFor('!!document.getElementById("sheet-title")');
      await pause(300);
      const sheet = await evaluate(`(() => {const r=document.getElementById('sheet-title').closest('section').getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom}})()`);
      assert.ok(sheet.x >= 0 && sheet.right <= width + 1 && sheet.top >= metrics.save.bottom, `Editing panel overlaps toolbar at ${width}: ${JSON.stringify(sheet)}`);
      await screenshot(`library-${width}`);
      await evaluate(`document.querySelector('section[aria-labelledby="sheet-title"] button[aria-label="Close"]').click()`);
      await waitFor(`!!document.querySelector('button[title^="Storage:"]')`);
      await evaluate(`document.querySelector('button[title^="Storage:"]').click()`);
      await waitFor(`!!document.querySelector('[role="dialog"][aria-label="Storage"]')`);
      const storage = await evaluate(`(() => {const dialog=document.querySelector('[role="dialog"][aria-label="Storage"]'); const r=dialog.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom,clipped:!!dialog.closest('[role="toolbar"]'),focusInside:dialog.contains(document.activeElement)};})()`);
      assert.ok(storage.x >= 0 && storage.right <= width + 1 && storage.top >= 0 && storage.bottom <= height + 1, `Storage dialog overflows at ${width}`);
      assert.equal(storage.clipped, false, 'Storage dialog must escape the scrolling toolbar');
      assert.equal(storage.focusInside, true, 'Keyboard focus must enter the dialog');
      await screenshot(`storage-${width}`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitFor(`!document.querySelector('[role="dialog"][aria-label="Storage"]')`);
      for (const label of ["Activity log", "Enquiries"]) {
        await evaluate(`document.querySelector('[data-dock-item][aria-label=${JSON.stringify(label)}]').click()`);
        await waitFor(`document.getElementById('sheet-title')?.textContent === ${JSON.stringify(label)}`);
        await waitFor(`![...document.querySelectorAll('section[aria-labelledby="sheet-title"] button')].some(button=>button.textContent === 'Refreshing…' || button.textContent === 'Loading…')`);
        await pause(350);
        const panel = await evaluate(`(() => {const el=document.getElementById('sheet-title').closest('section');const body=el.querySelector('header').nextElementSibling;return {width:body.clientWidth,scrollWidth:body.scrollWidth,errors:[...el.querySelectorAll('[role="alert"]')].map(n=>n.textContent)};})()`);
        assert.ok(panel.scrollWidth <= panel.width + 1, `${label} has horizontal overflow at ${width}`);
        assert.deepEqual(panel.errors, [], `${label} reported an error`);
        await screenshot(`${label === "Enquiries" ? "inbox" : "activity"}-${width}`);
      }
      console.log(JSON.stringify({ view: "portal", width, height, ...metrics, sheet }));
    }
  }
  assert.deepEqual(errors, [], "Browser runtime exceptions");
  console.log(`Screenshots: ${output}`);
} finally { socket.close(); }

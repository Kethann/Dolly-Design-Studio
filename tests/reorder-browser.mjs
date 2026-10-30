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
  } else if (event.method === "Page.javascriptDialogOpening") void send("Page.handleJavaScriptDialog", {accept:true});
  else if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.text + ": " + (event.params.exceptionDetails.exception?.description ?? ""));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  if (process.env.DDS_QA_TRACE && ["Page.navigate", "Page.enable", "Runtime.enable", "Page.bringToFront"].includes(method)) console.log(method);
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
await send("Page.handleJavaScriptDialog", {accept:true}).catch(() => {});
await send("Runtime.enable");
await send("Page.bringToFront");
const inside = (code) => evaluate(`(() => {const w=document.querySelector('iframe').contentWindow;const d=w.document;return (${code});})()`);
const order = () => inside(`Array.from(d.querySelectorAll('[data-ed-item^="projects."]')).map(el=>el.querySelector('h3')?.textContent || el.dataset.edLabel)`);
const point = (key, handle = false) => inside(`(() => {const el=d.querySelector('[${handle ? "data-ed-reorder" : "data-ed-item"}="projects.${key}"]');const r=el.getBoundingClientRect();const f=document.querySelector('iframe').getBoundingClientRect();return {x:f.x+r.x+r.width/2,y:f.y+r.y+Math.min(70,r.height/2)};})()`);
const move = async (from, to, touch = false, cancel = false) => {
  const a = await point(from, true), b = await point(to);
  if (touch) {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{...a, id: 1}] });
    for (let step=1;step<=12;step++) { await send("Input.dispatchTouchEvent", {type:"touchMove",touchPoints:[{x:a.x+(b.x-a.x)*step/12,y:a.y+(b.y-a.y)*step/12,id:1}]}); await pause(20); }
    await pause(100);
    await send("Input.dispatchTouchEvent", {type:cancel ? "touchCancel" : "touchEnd",touchPoints:[]});
  } else {
    await send("Input.dispatchMouseEvent", {type:"mousePressed",...a,button:"left",clickCount:1});
    for (let step=1;step<=12;step++) { await send("Input.dispatchMouseEvent", {type:"mouseMoved",x:a.x+(b.x-a.x)*step/12,y:a.y+(b.y-a.y)*step/12,button:"left",buttons:1}); await pause(20); }
    await pause(100);
    if (cancel) await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await send("Input.dispatchMouseEvent", {type:"mouseReleased",...b,button:"left",clickCount:1});
  }
  await pause(1000);
};
try {
  assert.ok(process.env.DDS_QA_USERNAME && process.env.DDS_QA_PASSWORD, "Supply local test credentials through the environment");
  await viewport(1440, 1000);
  await send("Page.navigate", {url:"http://127.0.0.1:3000/portal"});
  await waitFor("document.readyState === 'complete'");
  const credentials = JSON.stringify({ username: process.env.DDS_QA_USERNAME, password: process.env.DDS_QA_PASSWORD });
  assert.equal(await evaluate(`fetch('/api/portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.ok)`), true);
  for (const [width, touch] of [[1440, false], [768, true], [390, true]]) {
    await viewport(width, 1000);
    await send("Emulation.setTouchEmulationEnabled", {enabled:touch,maxTouchPoints:1});
    await send("Page.navigate", {url:"http://127.0.0.1:3000/portal"});
    await waitFor(`!!document.querySelector('[aria-label="Portal tools"]')`);
    await pause(1200);
    await evaluate(`(() => {const select=document.querySelector('select[aria-label="Choose a page to edit"]');select.value='work';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-ed-reorder="projects.1"]')`);
    await inside(`(d.querySelector('[data-ed-item="projects.0"]').scrollIntoView({block:'start',behavior:'instant'}), w.scrollBy(0,-120), true)`);
    await pause(400);
    await inside(`(() => {w.reorderAnimations=0;const animate=w.Element.prototype.animate;w.Element.prototype.animate=function(frames,options){if(Array.isArray(frames)&&frames[0]?.translate)w.reorderAnimations++;return animate.call(this,frames,options)};return true})()`);
    const before = await order();
    console.log(`Checking ${touch ? 'touch' : 'mouse'} drag`);
    await move(0, 1, touch);
    await waitFor(`document.querySelector('iframe').contentDocument.querySelector('[data-ed-item="projects.1"]').dataset.edLabel === ${JSON.stringify(before[0])}`);
    const after = await order();
    if (after[1] !== before[0]) console.log(await inside(`({status:d.querySelector('.dds-reorder-status')?.textContent, handles:[...d.querySelectorAll('[data-ed-reorder]')].slice(0,2).map(e=>({key:e.dataset.edReorder,rect:e.getBoundingClientRect().toJSON()})),before:${JSON.stringify(before)},after:${JSON.stringify(after)}})`));
    assert.equal(after[1], before[0], `${touch ? 'Touch' : 'Mouse'} drag failed`);
    assert.equal(after[0], before[1]);
    assert.ok(await inside("w.reorderAnimations > 0"), "Cards did not animate into their new positions");
    assert.equal(await inside("w.location.pathname"), "/work", "Drag navigated away");
    await move(0, 1, touch, true);
    assert.deepEqual(await order(), after, "Cancelled drag changed order");
    await inside(`(d.querySelector('[data-ed-reorder="projects.0"]').focus(), true)`);
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
    await waitFor(`document.querySelector('iframe').contentDocument.querySelector('[data-ed-item="projects.0"]').dataset.edLabel === ${JSON.stringify(before[0])}`);
    assert.deepEqual(await order(), before, "Keyboard move did not restore order");
    await screenshot(`reorder-${width}`);
    console.log(`${width}px: drag, cancel, keyboard, navigation passed`);
    if (width === 1440) {
      // Category subsets carry original list indices, not filtered positions.
      await inside(`(d.querySelectorAll('[aria-label="Filter work by category"] button')[1].click(), true)`);
      await pause(1500);
      const filtered = await order();
      assert.ok(filtered.length > 1 && filtered.length < before.length);
      await inside(`(d.querySelector('[data-ed-reorder]').focus(),true)`);
      await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
      await waitFor(`Array.from(document.querySelector('iframe').contentDocument.querySelectorAll('[data-ed-item]'))[1]?.dataset.edLabel === ${JSON.stringify(filtered[0])}`);
      assert.equal((await order())[0], filtered[1]);
      await evaluate(`document.querySelector('button[aria-label^="Undo"],button[title^="Undo"]')?.click()`);
      await waitFor(`document.querySelector('iframe').contentDocument.querySelector('[data-ed-item]')?.dataset.edLabel === ${JSON.stringify(filtered[0])}`);
      await inside(`(d.querySelectorAll('[aria-label="Filter work by category"] button')[0].click(),true)`);
      await pause(600);
      assert.deepEqual(await order(), before, "Undo failed to restore all cards");
      console.log("Filtered reorder and Undo passed");
      if (process.argv.includes("--memory")) {
        await send("Performance.enable");
        const memory = async () => {
          await pause(350);
          await send("HeapProfiler.collectGarbage");
          const metrics = await send("Performance.getMetrics");
          return { heap: metrics.metrics.find((m) => m.name === "JSHeapUsedSize")?.value, ...(await send("Memory.getDOMCounters")) };
        };
        const start = await memory();
        for (let count=0;count<12;count++) {
          const expected = before[count % 2 === 0 ? 1 : 0];
          await inside(`(d.querySelector('[data-ed-reorder="projects.0"]').focus(),true)`);
          await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
          await waitFor(`document.querySelector('iframe').contentDocument.querySelector('[data-ed-item="projects.0"]').dataset.edLabel === ${JSON.stringify(expected)}`);
          await pause(250);
        }
        const end = await memory();
        assert.deepEqual(await order(), before, "Repeated moves changed content unexpectedly");
        assert.equal(await inside("d.querySelectorAll('.dds-reorder-badge,[data-ed-dragging],[data-ed-drop]').length"), 0, "Drag helpers leaked");
        assert.equal(await inside("d.getAnimations().filter(a=>a.effect?.getKeyframes().some(k=>k.translate)).length"), 0, "Reorder animations leaked");
        assert.ok(end.nodes - start.nodes < 300, "DOM nodes accumulated after repeated moves");
        assert.ok(end.jsEventListeners - start.jsEventListeners < 30, "Event listeners accumulated after repeated moves");
        console.log("Repeated-reorder memory check:", JSON.stringify({start,end}));
      }
    }
    if (width === 390) {
      await send("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:"reduce"}]});
      const animationCount = await inside("w.reorderAnimations");
      await inside(`(d.querySelector('[data-ed-reorder="projects.0"]').focus(),true)`);
      await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
      await waitFor(`document.querySelector('iframe').contentDocument.querySelector('[data-ed-item="projects.1"]').dataset.edLabel === ${JSON.stringify(before[0])}`);
      assert.equal(await inside("w.reorderAnimations"), animationCount, "Reduced motion still animated cards");
      await send("Emulation.setEmulatedMedia", {features:[]});
      console.log("Reduced motion passed");
    }
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
  // Reload discards unsaved test moves. This check never calls Save & publish.
  await send("Page.navigate", {url:"http://127.0.0.1:3000/portal"});
  console.log("All reorder checks passed; no content published.");
} finally { socket.close(); }

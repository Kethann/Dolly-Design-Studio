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
  else if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") errors.push(event.params.args.map(arg=>arg.value ?? arg.description).join(" "));
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
const group = '[aria-label="Text effects for Heading"]';
const choose = (effect) => evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('[data-effect-value="${effect}"]').click()`);
try {
  assert.ok(process.env.DDS_QA_USERNAME && process.env.DDS_QA_PASSWORD);
  // Read-only browser fixtures exercise a larger picker without uploading or changing stored media.
  await send("Page.addScriptToEvaluateOnNewDocument", {source:`(() => {const original=window.fetch.bind(window);window.fetch=(input,init)=>{const url=typeof input==='string'?input:input.url;return url==='/api/portal/media'&&(!init?.method||init.method==='GET')?Promise.resolve(new Response(JSON.stringify({images:['/images/brand/og-image.jpg','/images/textures/dark-grunge-scratched-texture-background-b18b59.webp',...Array.from({length:58},(_,i)=>'/images/brand/logo.svg?sample='+i)],removable:[]}),{status:200,headers:{'Content-Type':'application/json'}})):original(input,init);};})();`});
  await viewport(1440, 1000);
  await send("Page.navigate", {url:"http://127.0.0.1:3000/portal"});
  await waitFor("document.readyState === 'complete'");
  const credentials = JSON.stringify({username:process.env.DDS_QA_USERNAME,password:process.env.DDS_QA_PASSWORD});
  assert.equal(await evaluate(`fetch('/api/portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.ok)`),true);
  await send("Page.navigate", {url:"http://127.0.0.1:3000/portal"});
  await waitFor(`!!document.querySelector('[aria-label="Portal tools"]')`);
  errors.length = 0; // Ignore buffered messages from an earlier test page; watch this editor session.
  await pause(1000);
  await evaluate(`(() => {const select=document.querySelector('select[aria-label="Choose a page to edit"]');select.value='work';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-t="work.title"]')`);
  await waitFor(`!!document.querySelector('iframe').contentDocument.querySelector('[aria-label="Edit All work"]')`);
  await inside(`(d.querySelector('[aria-label="Edit All work"]').click(),true)`);
  await waitFor(`!!document.querySelector(${JSON.stringify(group)})`);
  const inputValue = await evaluate(`document.querySelector(${JSON.stringify(group)}).parentElement.querySelector('input').value`);
  await choose("glow");
  await waitFor(`!!document.querySelector('iframe').contentDocument.querySelector('[data-t="work.title"] [data-text-effect="glow"]')`);
  assert.equal(await inside(`!!d.querySelector('[data-t="work.label"] [data-text-effect="glow"]')`),false,"Effect leaked to another heading");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).parentElement.querySelector('input').value.includes('glow|')`),false,"Internal setting leaked into text input");
  await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('[data-effect-value="glow"]').focus()`);
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  await waitFor(`document.querySelector(${JSON.stringify(group)}).querySelector('[data-effect-value="sheen"]').getAttribute('aria-checked')==='true'`);
  for (const effect of ["sheen","outline","particles","none"]) {
    await choose(effect);
    const selector = effect === "particles" ? '[data-t="work.title"] canvas' : effect === "none" ? null : `[data-t="work.title"] [data-text-effect="${effect}"]`;
    if (selector) await waitFor(`!!document.querySelector('iframe').contentDocument.querySelector(${JSON.stringify(selector)})`);
    else await waitFor(`!document.querySelector('iframe').contentDocument.querySelector('[data-t="work.title"] canvas,[data-t="work.title"] [data-text-effect]')`);
  }
  await choose("sheen");
  await waitFor(`!!document.querySelector('iframe').contentDocument.querySelector('[data-text-effect="sheen"]')`);
  for (const width of [1440,768,390]) {
    await viewport(width,1000); await pause(400);
    const bounds = await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(group)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()`);
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width+1, `Effects overflow at ${width}`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelectorAll('canvas').length`),0,"Effect samples allocated canvases");
    await screenshot(`text-effects-${width}`);
  }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cancel')?.click()`);
  await waitFor(`!document.querySelector(${JSON.stringify(group)})`);
  await waitFor(`!document.querySelector('iframe').contentDocument.querySelector('[data-t="work.title"] [data-text-effect="sheen"]')`);
  assert.equal(await inside(`d.querySelector('[data-t="work.title"]').textContent`), inputValue, "Cancel failed to restore heading");
  await inside(`(d.querySelector('[aria-label="Edit Dacoit"]').click(),true)`);
  await waitFor(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Cover —'))`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Cover —')).click()`);
  await waitFor(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Browse images')`);
  const browse = () => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Browse images').click()`);
  await browse();
  await waitFor(`!!document.querySelector('[aria-label="Search your pictures by name"]')`);
  const tiles = 'button[aria-label^="Use "][aria-pressed]';
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(tiles)}).length`),48,"Initial thumbnails were not bounded");
  assert.equal(await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(tiles)})).every(b=>b.querySelector('img')&&b.textContent.trim()==='')`),true,"Filenames showed by default");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Show more pictures')).click()`);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(tiles)}).length`),60);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Names').click()`);
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(tiles)}).textContent.includes('og image')`));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Names').click()`);
  await evaluate(`document.querySelector(${JSON.stringify(tiles)}).click()`);
  await waitFor(`!document.querySelector('[aria-label="Search your pictures by name"]')`);
  assert.ok(await evaluate(`!!document.querySelector('details summary')`));
  await browse();
  await waitFor(`!!document.querySelector(${JSON.stringify(tiles+'[aria-pressed="true"]')})`);
  for (const width of [1440,768,390]) {
    await viewport(width,1000); await pause(300);
    const layout = await evaluate(`(() => {const tile=document.querySelector(${JSON.stringify(tiles)});tile.scrollIntoView({block:'center'});const r=tile.parentElement.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()`);
    assert.ok(layout.left>=0&&layout.right<=layout.width+1,`Picker overflow at ${width}`);
    await screenshot(`visual-picker-${width}`);
  }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cancel')?.click()`);
  await waitFor(`!document.querySelector('[aria-label="Search your pictures by name"]')`);
  await evaluate(`document.querySelector('[data-dock-item][aria-label*="Image"]')?.click()`);
  await waitFor(`!!document.querySelector('[aria-label="Search images by name or folder"]')`);
  assert.equal(await evaluate(`document.querySelectorAll('figure figcaption').length`),0,"Library names should be optional");
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Names').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('figure figcaption').length`),60);
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log("Visual choices, keyboard controls, bounded image thumbnails, selection, mobile layout, and Cancel passed. Nothing published.");
} finally { socket.close(); }

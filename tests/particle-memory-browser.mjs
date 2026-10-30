// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Exercises public heading effects without changing saved content.
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

const stats = () => evaluate(`Array.from(document.querySelectorAll('[data-live]')).map(el=>{const r=el.getBoundingClientRect(),c=el.querySelector('canvas');return {text:el.textContent,live:el.dataset.live,active:el.dataset.active,pixels:c.width*c.height,near:r.bottom>=-120&&r.top<=innerHeight+120&&r.right>=0&&r.left<=innerWidth};})`);
const memory = async () => {
  await send('HeapProfiler.collectGarbage');
  return {heap:(await send('Runtime.getHeapUsage')).usedSize, ...await send('Memory.getDOMCounters')};
};
try {
  await viewport(1440,1000);
  await send('Page.navigate',{url:'http://127.0.0.1:3000/'});
  await waitFor(`document.readyState==='complete' && document.querySelector('[data-live]') && !document.querySelector('.intro-curtain') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
  await evaluate('document.fonts.ready.then(()=>true)');
  const initial = await stats();
  assert.ok(initial.filter(w=>!w.near).every(w=>w.pixels===0),'Off-screen words do not allocate canvases');
  const focus = async () => {
    await evaluate(`document.querySelector('[data-live]').scrollIntoView({block:'center',behavior:'instant'})`);
    await waitFor(`(()=>{const el=document.querySelector('[data-live]');const r=el.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight){el.scrollIntoView({block:'center',behavior:'instant'});return false;}return el.dataset.live==='true';})()`);
    return evaluate(`(()=>{const r=document.querySelector('[data-live]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  };
  let point=await focus();
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await waitFor(`document.querySelector('[data-live]').dataset.active==='true'`);
  await screenshot('particle-memory-hover');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
  await waitFor(`document.querySelector('[data-live]').dataset.active==='false'`);
  const before=await memory();
  for(let i=0;i<8;i++) {
    await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
    await waitFor(`document.querySelector('[data-live] canvas').width===0`);
    await focus();
  }
  const after=await memory();
  assert.ok(after.heap-before.heap<8*1024*1024,'Repeated effects must not retain large heap growth');
  assert.ok(after.jsEventListeners-before.jsEventListeners<10,'Listeners do not accumulate');
  assert.ok(after.nodes-before.nodes<100,'DOM nodes do not accumulate');
  console.log(JSON.stringify({initial,before,after,heapGrowth:after.heap-before.heap}));
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await waitFor(`Array.from(document.querySelectorAll('[data-live] canvas')).every(c=>c.width===0)`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await focus();
  await evaluate(`document.querySelector('[data-live] > span').style.fontSize='3000px'`);
  await waitFor(`document.querySelector('[data-live] canvas').width===0`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-live] > span')).opacity`),'1');
  await evaluate(`document.querySelector('[data-live] > span').style.removeProperty('font-size')`);
  await focus();
  for(const width of [768,390]) {
    await viewport(width,1000);
    // Reload after the intentionally extreme font fixture; let scroll-pinned sections settle at this width.
    await send('Page.navigate',{url:'http://127.0.0.1:3000/'});
    await waitFor(`document.readyState==='complete' && document.querySelector('[data-live]') && !document.querySelector('.intro-curtain') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
    await evaluate('document.fonts.ready.then(()=>true)');
    point=await focus();
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await waitFor(`document.querySelector('[data-live]').dataset.active==='true'`);
    assert.ok((await stats()).every(w=>w.pixels<=2000000));
    await screenshot('particle-memory-'+width);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: off-screen release, hover, repeated scrolling, reduced motion, oversized fallback and responsive effects.');
} finally {socket.close();}

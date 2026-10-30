// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Checks section spacing and responsive content bounds without changing saved content.
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
const before=process.argv.includes('--before');
const motion=process.argv.includes('--motion');
const phase=before?'before':motion?'motion':'after';
const records=[];
try {
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:motion?'no-preference':'reduce'}]});
  for(const [width,height] of (before||motion?[[390,844],[1440,900]]:[[280,720],[320,740],[390,844],[768,1024],[844,390],[1024,768],[1440,900],[1920,1080]])) {
    await viewport(width,height);
    await send('Page.navigate',{url:'http://127.0.0.1:3000/'});
    await waitFor(`document.readyState==='complete' && document.querySelector('#contact') && !document.querySelector('.intro-curtain') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
    await evaluate('document.fonts.ready.then(()=>true)');
    await pause(1200);
    const metrics=await evaluate(`(()=>{const ids=['agency','clients','about','work','process','services','contact'];return {width:innerWidth,sections:ids.map(id=>{const el=document.getElementById(id);if(!el)return {id,missing:true};const s=getComputedStyle(el),box=el.getBoundingClientRect(),container=el.querySelector('.container'),c=container?.getBoundingClientRect();return {id,top:box.top+scrollY,bottom:box.bottom+scrollY,height:box.height,padTop:parseFloat(s.paddingTop),padBottom:parseFloat(s.paddingBottom),left:c?.left,right:c?.right}}),overflow:Array.from(document.querySelectorAll('main .container, main form, main input:not([type=checkbox]):not([type=hidden]),main select,main textarea,main [class*="Founder"][class*="card"],main [class*="Process"][class*="stepTitle"]')).filter(el=>!el.closest('[data-marquee], [aria-hidden="true"]')&&getComputedStyle(el).display!=='none').map(el=>{const r=el.getBoundingClientRect();return {section:el.closest('section')?.id,tag:el.tagName,cls:el.className,left:r.left,right:r.right,client:el.clientWidth,scroll:el.scrollWidth}}).filter(r=>r.left<-.5||r.right>innerWidth+.5||r.scroll>r.client+2)}})()`);
    records.push(metrics);
    console.log(JSON.stringify(metrics));
    if(!before) {
      assert.deepEqual(metrics.overflow,[],`Content overflows at ${width}x${height}`);
      assert.ok(metrics.sections.filter(s=>!s.missing).every(s=>s.padTop<=41&&s.padBottom<=41),'Section padding exceeds compact scale');
    }
    if([390,1440].includes(width)) for(const id of ['clients','collaborations','process','contact']) {
      await evaluate(`window.scrollTo({top:document.getElementById('${id}').getBoundingClientRect().top+scrollY-220,behavior:'instant'})`);
      await pause(motion?2200:150);
      await screenshot(`spacing-${phase}-${id}-${width}`);
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,`spacing-${phase}.json`),JSON.stringify(records,null,2));
  console.log('PASS: section spacing and content bounds across tested viewport sizes.');
} finally { socket.close(); }

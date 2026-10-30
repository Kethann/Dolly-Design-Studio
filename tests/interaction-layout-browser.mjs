// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Checks responsive controls, keyboard filtering and navigation without saving content.
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

try {
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of [[280,720],[390,844],[768,1024],[844,390],[1440,900]]) {
    await viewport(width,height);
    await send('Page.navigate',{url:'http://127.0.0.1:3000/work'});
    await waitFor(`document.readyState==='complete' && document.querySelector('[aria-label="Filter work by category"] button') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
    await evaluate('document.fonts.ready.then(()=>true)');
    await send('Page.bringToFront');
    const metrics=await evaluate(`(()=>{const group=document.querySelector('[aria-label="Filter work by category"]');return {role:group.getAttribute('role'),buttons:Array.from(group.querySelectorAll('button')).map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}}),cards:Array.from(document.querySelectorAll('main a[href^="/work/"]')).map(c=>c.getAttribute('href')),padding:parseFloat(getComputedStyle(document.querySelector('main section')).paddingBottom)}})()`);
    assert.equal(metrics.role,'group');
    assert.ok(metrics.buttons.every(b=>b.height>=44&&b.width>=44&&b.left>=0&&b.right<=width+1),'Touch controls stay within viewport');
    assert.ok(metrics.padding<=40);
    assert.ok(metrics.cards.length>0);
    await evaluate(`document.querySelectorAll('[aria-label="Filter work by category"] button')[1].focus()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await waitFor(`document.querySelectorAll('[aria-label="Filter work by category"] button')[1].getAttribute('aria-pressed')==='true'`);
    const filtered=await evaluate(`Array.from(document.querySelectorAll('main a[href^="/work/"]')).map(c=>c.getAttribute('href'))`);
    assert.ok(filtered.length>0&&filtered.length<metrics.cards.length,'Keyboard filter changes visible cards');
    await evaluate(`document.querySelector('[aria-label="Filter work by category"] button').click()`);
    await waitFor(`document.querySelectorAll('main a[href^="/work/"]').length===${metrics.cards.length}`);
    if(width===390) await screenshot('refined-work-phone');
    const href=metrics.cards[0];
    await evaluate(`document.querySelector('main a[href="${href}"]').click()`);
    await waitFor(`location.pathname===${JSON.stringify(href)} && document.readyState==='complete'`);
    console.log(`PASS ${width}x${height}: touch target size, keyboard filtering, reset and project navigation`);
  }
  await viewport(390,844);
  await send('Page.navigate',{url:'http://127.0.0.1:3000/'});
  await waitFor(`document.readyState==='complete' && document.querySelector('#contact textarea') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
  const form=await evaluate(`(()=>{const t=document.querySelector('#contact textarea');t.value='A local layout check only';t.style.height='300px';const s=getComputedStyle(t),r=t.getBoundingClientRect();return {resize:s.resize,width:r.width,height:r.height,left:r.left,right:r.right}})()`);
  assert.equal(form.resize,'vertical');
  assert.equal(form.height,300);
  assert.ok(form.left>=0&&form.right<=390);
  assert.deepEqual(errors,[]);
  console.log('PASS: message field grows vertically inside its column; no form submitted or content saved.');
} finally { socket.close(); }

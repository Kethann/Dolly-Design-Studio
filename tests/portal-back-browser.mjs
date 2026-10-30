// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Regresses real pointer/touch return links in the portal; uses an existing local session and never saves content.
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

const inside = code => evaluate(`(()=>{const w=document.querySelector('iframe').contentWindow;const d=w.document;return (${code})})()`);
try {

  for(const width of [1440,390]) {
    await viewport(width,1000);
    await send('Emulation.setTouchEmulationEnabled',{enabled:width===390,maxTouchPoints:1});
    await send('Page.navigate',{url:'http://127.0.0.1:3000/portal'});
    await waitFor(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-ed-item="clients.0"]')`);
    await evaluate(`(()=>{const s=document.querySelector('[aria-label="Choose a page to edit"]');s.value='project';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`document.querySelector('iframe')?.contentWindow?.location.pathname.startsWith('/work/')&&!!document.querySelector('iframe')?.contentDocument?.querySelector('article a[href="/work"]')`);
    await pause(1500);
    const p=await inside(`(()=>{const a=d.querySelector('article a[href="/work"]'),r=a.getBoundingClientRect(),f=document.querySelector('iframe').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x:f.x+x,y:f.y+y,clickable:d.elementFromPoint(x,y)?.closest('a')===a,height:r.height}})()`);
    assert.ok(p.clickable,'Back link does not receive pointer input');
    assert.ok(p.height>=44,'Back link must have a usable touch target');
    await screenshot('portal-back-before-'+width);
    if(width===390) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
    }
    await waitFor(`document.querySelector('iframe')?.contentWindow?.location.pathname==='/work'&&document.querySelector('[aria-label="Choose a page to edit"]').value==='work'`);
    assert.equal(await inside(`new URLSearchParams(w.location.search).has('portal-preview')`),true);
    await waitFor(`document.querySelector('iframe')?.contentDocument?.documentElement.hasAttribute('data-dds-edit')`);
    console.log('PASS project Back to work actual pointer',width);
  }
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="Choose a page to edit"]');s.value='step';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('iframe')?.contentWindow?.location.pathname.startsWith('/process/')&&!!document.querySelector('iframe')?.contentDocument?.querySelector('article a[href*="#process"]')`);
  await pause(1000);
  await inside(`(d.querySelector('article a[href*="#process"]').click(),true)`);
  await waitFor(`document.querySelector('iframe')?.contentWindow?.location.pathname==='/'&&document.querySelector('[aria-label="Choose a page to edit"]').value==='home'`);
  await pause(2200);
  console.log('process return',await inside(`({hash:w.location.hash,search:w.location.search,scroll:w.scrollY,target:d.querySelector('#process')?.getBoundingClientRect().top})`));
  assert.equal(await inside(`new URLSearchParams(w.location.search).has('portal-preview')`),true);
  assert.ok(Math.abs(await inside(`d.querySelector('#process').getBoundingClientRect().top`))<200,'Process return did not reach its section');
  assert.deepEqual(errors,[]);
}finally{socket.close()}

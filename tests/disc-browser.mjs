// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Checks section spacing and responsive content bounds without changing saved content.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const targets = await (await fetch("http://127.0.0.1:9227/json/list")).json();
const target = targets.find((t) => t.type === "page" && (t.url === "about:blank" || t.url.startsWith("http://localhost:3000") || t.url.startsWith("http://127.0.0.1:3000")));
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
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.bringToFront");
let instrumentation;
// Does not save portal content or contact any studio mailbox.
try {
 instrumentation = await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__discDrawCalls=0;window.__discPowers=new Set();window.__discPowerSamples=0;const names=new WeakMap();const gl=WebGL2RenderingContext.prototype;const lookup=gl.getUniformLocation;gl.getUniformLocation=function(...args){const value=lookup.apply(this,args);if(value)names.set(value,args[1]);return value};const uniform=gl.uniform1f;gl.uniform1f=function(loc,value){if(names.get(loc)==='power'){window.__discPowers.add(value);window.__discPowerSamples++}return uniform.call(this,loc,value)};for(const key of ['drawElements','drawArrays']){const fn=gl[key];gl[key]=function(...args){window.__discDrawCalls++;return fn.apply(this,args)}}})();`});
 await viewport(1440,900);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:'http://localhost:3000/disc-hero/index.html'});await pause(1500);
 await waitFor('!!document.querySelector(".lil-gui") && !!document.querySelector("canvas")?.dataset.engine');
 await pause(1200);
 assert.equal(await evaluate('document.querySelector("#hero").classList.contains("failed")'),false);
 assert.equal(await evaluate('document.querySelectorAll(".lil-gui .controller").length'),23);
 await screenshot('disc-final-desktop');
 // Late image decodes may legitimately invalidate one still frame after pausing.
 await evaluate('document.querySelector("#pause").click()');await pause(3500);
 const stopped=await evaluate('window.__discDrawCalls');await pause(1000);assert.equal(await evaluate('window.__discDrawCalls'),stopped);
 await evaluate('document.querySelector("#pause").click()');await pause(700);assert.ok(await evaluate('window.__discDrawCalls')>stopped);
 assert.deepEqual(await evaluate('[...window.__discPowers]'),[0.8], 'Projector power remains constant as slots enter and leave focus');
 assert.ok(await evaluate('window.__discPowerSamples')>0, 'Observed the actual beam shader uniform');
 await evaluate('document.body.style.paddingBottom="1500px";scrollTo(0,1800)');await pause(500);
 const hidden=await evaluate('window.__discDrawCalls');await pause(1000);assert.equal(await evaluate('window.__discDrawCalls'),hidden);
 await evaluate('scrollTo(0,0);document.body.style.paddingBottom=""');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await pause(700);
 const reduced=await evaluate('window.__discDrawCalls');await pause(1000);assert.equal(await evaluate('window.__discDrawCalls'),reduced);
 for(const [w,h,name] of [[390,844,'disc-final-phone'],[820,1180,'disc-final-tablet']]){
  await viewport(w,h);await pause(800);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  await screenshot(name);
 }
 await send('Page.navigate',{url:'http://localhost:3000/?disc-check#collaborations'});await pause(2000);
 await waitFor('!!document.querySelector("main") && getComputedStyle(document.querySelector("main")).opacity==="1" && !document.querySelector(".intro-curtain")');
 await waitFor('!!document.querySelector("#collaborations")');
 await evaluate('document.querySelector("#collaborations").scrollIntoView()');
 await waitFor('document.querySelector("[data-disc-state]")?.dataset.discState==="ready"');
 for(const [w,h,name] of [[1440,900,'disc-site-desktop'],[390,844,'disc-site-phone'],[820,1180,'disc-site-tablet']]){
  await viewport(w,h);await pause(800);await evaluate('document.querySelector("#collaborations").scrollIntoView()');await pause(500);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  await screenshot(name);
 }
 await evaluate('document.querySelector("#collaborations details summary").click()');
 assert.ok(await evaluate('document.querySelectorAll("#collaborations details a").length')>0);
 assert.equal(await evaluate('document.querySelector("#collaborations a").getAttribute("href")'),'/work');
 assert.deepEqual(errors,[]);
 console.log('PASS: standalone CDN scene, 23 GUI controls, pause/resume, offscreen sleep, reduced motion, responsive demo/site and collection links.');
} finally { if (instrumentation) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: instrumentation.identifier }); socket.close(); }

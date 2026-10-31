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
  else if (event.method === "Runtime.exceptionThrown" && !event.params.exceptionDetails.url?.startsWith("chrome-extension://")) errors.push(event.params.exceptionDetails.text + ": " + (event.params.exceptionDetails.exception?.description ?? ""));
  else if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") errors.push(event.params.args.map(a => a.value ?? a.description).join(" "));
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
let instrumentation, extraInstrumentation, projectionInstrumentation;
// Does not save portal content or contact any studio mailbox.
try {
 instrumentation = await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__discDrawCalls=0;window.__discPowers=new Set();window.__discPowerSamples=0;window.__discTime=0;window.__discColours=new Set();window.__contactColours=new Set();const names=new WeakMap();const gl=WebGL2RenderingContext.prototype;const lookup=gl.getUniformLocation;gl.getUniformLocation=function(...args){const value=lookup.apply(this,args);if(value)names.set(value,args[1]);return value};const uniform=gl.uniform1f;gl.uniform1f=function(loc,value){if(names.get(loc)==='power'){window.__discPowers.add(value);window.__discPowerSamples++}if(names.get(loc)==='time')window.__discTime=value;return uniform.call(this,loc,value)};const colour=gl.uniform3f;gl.uniform3f=function(loc,r,g,b){const value=[r,g,b].map(v=>v.toFixed(3)).join(',');if(names.get(loc)==='tint')window.__discColours.add(value);if(names.get(loc)==='contactColour')window.__contactColours.add(value);return colour.call(this,loc,r,g,b)};for(const key of ['drawElements','drawArrays']){const fn=gl[key];gl[key]=function(...args){window.__discDrawCalls++;return fn.apply(this,args)}}})();`});
 // Count the pose at draw time: Three.js legitimately skips unchanged uniform uploads.
 const openingInstrumentation=await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
   window.__frontCards=0;window.__openingDepths=new Set();window.__hoverLevels=new Set();
   const names=new WeakMap(),poses=new WeakMap(),programs=new WeakMap(),gl=WebGL2RenderingContext.prototype;
   const lookup=gl.getUniformLocation,matrix=gl.uniformMatrix4fv,uniform=gl.uniform1f,use=gl.useProgram;
   gl.getUniformLocation=function(...args){const loc=lookup.apply(this,args);if(loc)names.set(loc,{program:args[0],name:args[1]});return loc};
   gl.useProgram=function(program){programs.set(this,program);return use.call(this,program)};
   gl.uniformMatrix4fv=function(loc,transpose,data,...rest){const info=names.get(loc);if(info?.name==='modelMatrix')poses.set(info.program,{z:data[14],normal:data[10]/Math.hypot(data[8],data[9],data[10])});return matrix.call(this,loc,transpose,data,...rest)};
   gl.uniform1f=function(loc,value){if(names.get(loc)?.name==='hover')window.__hoverLevels.add(Number(value.toFixed(2)));return uniform.call(this,loc,value)};
   for(const key of ['drawElements','drawArrays']){const draw=gl[key];gl[key]=function(...args){const p=poses.get(programs.get(this));if(p){if(p.z>2.4&&p.normal>.99)window.__frontCards++;if(p.z>1.5&&p.z<2.59&&p.normal>.65)window.__openingDepths.add(Number(p.z.toFixed(3)))}return draw.apply(this,args)}}
 })();`});
 extraInstrumentation=openingInstrumentation.identifier;
 projectionInstrumentation = (await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
   window.__imageBands=new Set();window.__contactStrengths=new Set();
   const gl=WebGL2RenderingContext.prototype,names=new WeakMap(),lookup=gl.getUniformLocation,vector=gl.uniform4f,scalar=gl.uniform1f;
   gl.getUniformLocation=function(...args){const loc=lookup.apply(this,args);if(loc)names.set(loc,args[1]);return loc};
   gl.uniform4f=function(loc,x,y,z,w){if(names.get(loc)==='imageBands')window.__imageBands.add([x,y,z,w].map(v=>v.toFixed(4)).join(','));return vector.call(this,loc,x,y,z,w)};
   gl.uniform1f=function(loc,v){if(names.get(loc)==='contactStrength')window.__contactStrengths.add(v);return scalar.call(this,loc,v)};
 })();`})).identifier;
 await viewport(1440,900);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:'http://localhost:3000/disc-hero/index.html'});await pause(1500);
 await waitFor('!!document.querySelector(".lil-gui") && !!document.querySelector("canvas")?.dataset.engine');
 await pause(1200);
 assert.equal(await evaluate('document.querySelector("#hero").classList.contains("failed")'),false);
 assert.equal(await evaluate('document.querySelectorAll(".lil-gui .controller").length'),28);
 await screenshot('disc-final-desktop');
 // Late image decodes may legitimately invalidate one still frame after pausing.
 await evaluate('document.querySelector("#pause").click()');await pause(3500);
 const stopped=await evaluate('window.__discDrawCalls');await pause(1000);assert.equal(await evaluate('window.__discDrawCalls'),stopped);
 await send('Page.bringToFront');
 await evaluate('document.querySelector("#pause").click()');await pause(1200);
 console.log('Animation state:', await evaluate('({draws:window.__discDrawCalls,hidden:document.hidden,failed:document.querySelector("#hero").className,paused:document.querySelector("#pause").getAttribute("aria-pressed")})'));
 assert.ok(await evaluate('window.__discDrawCalls')>stopped);
 assert.deepEqual(await evaluate('[...window.__discPowers]'),[0.8], 'Projector power remains constant as slots enter and leave focus');
 assert.ok(await evaluate('window.__discPowerSamples')>0, 'Observed the actual beam shader uniform');
 const rayTime=await evaluate('window.__discTime');await pause(600);
 assert.ok(await evaluate('window.__discTime')>rayTime,'Beam filaments animate rather than merely redrawing an unchanged ray');
 assert.ok(await evaluate('window.__discColours.size')>1,'Projector colour changes smoothly with image loading and focus');
 assert.ok(await evaluate('window.__contactColours.size')>1,'The disc reflection follows the same changing artwork colour');
 assert.ok(await evaluate('window.__imageBands.size')>1,'Ray density follows smoothly blended artwork brightness bands');
 assert.ok(await evaluate('[...window.__contactStrengths].some(v=>v>0)'), 'The surface reflection shader receives nonzero light');
 await evaluate(`(()=>{const input=document.querySelector('.lil-gui .controller input[type="text"]');input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const stillDiscRay=await evaluate('window.__discTime');await pause(650);
 assert.ok(await evaluate('window.__discTime')>stillDiscRay,'Ray motion continues when disc spin speed is zero');
 await evaluate(`(()=>{const input=document.querySelector('.lil-gui .controller input[type="text"]');input.value='0.12';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.ok(await evaluate('(()=>{const c=document.querySelector("canvas");return c.width*c.height<=1600000})()'),'Render target pixel budget stays bounded');
 await evaluate(`(()=>{window.__contactStrengths.clear();const row=[...document.querySelectorAll('.lil-gui .controller')].find(el=>el.querySelector('.name')?.textContent==='rayIntensity');const input=row.querySelector('input[type="text"]');input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(350);
 assert.deepEqual(await evaluate('[...window.__contactStrengths]'),[0],'Turning off the lamp also removes the surface reflection');
 await evaluate(`(()=>{const row=[...document.querySelectorAll('.lil-gui .controller')].find(el=>el.querySelector('.name')?.textContent==='rayIntensity');const input=row.querySelector('input[type="text"]');input.value='0.8';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(200);
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
 assert.equal(await evaluate('document.querySelectorAll("#collaborations button[aria-label^=Preview]").length'),8);
 for(const [w,h,name] of [[1440,900,'disc-detail-desktop'],[390,844,'disc-detail-phone']]) {
  await viewport(w,h);
  await evaluate('document.querySelector("#collaborations [data-disc-state]").scrollIntoView({block:"center"})');await pause(500);
  await evaluate('document.querySelector("#collaborations button[aria-label^=Preview]").click()');await pause(500);
  assert.ok(await evaluate(`!!document.querySelector('#collaborations dialog[open]')`));
  assert.ok(await evaluate('document.querySelector("#disc-detail-title").textContent.length>0'),'Clicked card displays its title');
  assert.equal(await evaluate('document.querySelectorAll("#collaborations details small").length'),0,'No extra captions around ordinary slots');
  assert.ok(await evaluate('(()=>{const r=document.querySelector("#collaborations dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'));
  assert.ok(await evaluate('document.querySelector("#collaborations dialog").contains(document.activeElement)'),'Focus moves into the card');
  await screenshot(name);
  await evaluate('window.__frontCards=0');
  await evaluate(`document.querySelector('button[aria-label="Close title preview"]').click()`);
  await pause(400);
  assert.equal(await evaluate('window.__frontCards'),0,'Closed card returns to its disc plane');
  assert.equal(await evaluate('document.querySelector("#collaborations dialog")'),null);
  assert.ok(await evaluate('document.activeElement.getAttribute("aria-label").startsWith("Preview ")'));
 }
 await viewport(1440,900);await evaluate('document.querySelector("#collaborations").scrollIntoView()');await pause(500);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await pause(300);
 await evaluate('window.__openingDepths.clear();window.__frontCards=0;document.querySelector("#collaborations button[aria-label^=Preview]").click()');await pause(1300);
 assert.ok(await evaluate('window.__openingDepths.size>2'),'Opening eases through intermediate 3D poses');
 assert.ok(await evaluate('window.__frontCards>0'),'The original 3D card finishes lifted forward and facing the camera');
 await pause(1200);const modalStill=await evaluate('window.__discDrawCalls');await pause(700);
 assert.equal(await evaluate('window.__discDrawCalls'),modalStill,'Rendering sleeps once the open card has settled');
 await evaluate(`document.querySelector('button[aria-label="Close title preview"]').click()`);await pause(900);
 const resumed=await evaluate('window.__discDrawCalls');await pause(700);
 assert.ok(await evaluate('window.__discDrawCalls')>resumed,'Animation resumes after card closes');
 // Opening and closing a card must not override an explicit Pause.
 await evaluate(`document.querySelector('#collaborations button[aria-pressed="false"]:not([aria-label])').click();document.querySelector('#collaborations button[aria-label^=Preview]').click()`);await pause(900);
 await evaluate(`document.querySelector('button[aria-label="Close title preview"]').click()`);await pause(1600);
 const manuallyPaused=await evaluate('window.__discDrawCalls');await pause(600);
 assert.equal(await evaluate('window.__discDrawCalls'),manuallyPaused,'Manual pause is preserved after closing');
 await evaluate(`document.querySelector('#collaborations button[aria-pressed="true"]:not([aria-label])').click()`);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 // Hit-test the actual disc, not just its collection buttons. Touch opens a preview without navigating.
 await viewport(1440,900);await evaluate('document.querySelector("#collaborations").scrollIntoView()');await pause(500);
 const hitPoint=await evaluate(`(()=>{const c=document.querySelector('#collaborations canvas'),r=c.getBoundingClientRect();window.__frontCards=0;for(let y=30;y<r.height-20;y+=20)for(let x=r.width*.4;x<r.width-20;x+=20){c.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+x,clientY:r.top+y,pointerType:'mouse'}));if(c.style.cursor==='pointer')return {x:r.left+x,y:r.top+y};}return null;})()`);
 assert.ok(hitPoint,'Artwork slots are hittable');await pause(300);
 assert.equal(await evaluate('document.querySelector("#collaborations dialog")'),null,'Hover alone never opens a detail card');
 assert.equal(await evaluate('window.__frontCards'),0,'Hover gives only a small lift, not the full forward pose');
 await evaluate(`document.querySelector('#collaborations [data-disc-state]').dispatchEvent(new PointerEvent('pointerout',{pointerType:'mouse',bubbles:true,relatedTarget:document.body}))`);
 await pause(200);
 await evaluate(`(()=>{const c=document.querySelector('#collaborations canvas');c.dispatchEvent(new PointerEvent('pointerdown',{clientX:${hitPoint.x},clientY:${hitPoint.y},pointerType:'touch'}));c.dispatchEvent(new MouseEvent('click',{clientX:${hitPoint.x},clientY:${hitPoint.y},bubbles:true}));})()`);await pause(300);
 assert.ok(await evaluate('!!document.querySelector("#collaborations dialog[open]")'));
 assert.ok(await evaluate('location.pathname==="/"'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(300);
 assert.equal(await evaluate('document.querySelector("#collaborations dialog")'),null);
 assert.equal(await evaluate('document.querySelector("#collaborations a").getAttribute("href")'),'/work');
 assert.deepEqual(errors,[]);
 console.log('PASS: 28 controls, animated colour-matched ray, bounded render pixels, pause/resume, offscreen/reduced-motion sleep, responsive layouts, subtle hover, click/touch detail card, keyboard dismissal, focus restoration and preserved manual pause.');
} finally {
 if (instrumentation) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: instrumentation.identifier });
 if (extraInstrumentation) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: extraInstrumentation });
 if (projectionInstrumentation) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: projectionInstrumentation });
 if (process.env.DDS_QA_CLOSE === "1") await send("Browser.close");
 socket.close();
}

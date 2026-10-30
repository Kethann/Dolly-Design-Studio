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
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import sharp from "sharp";
const root=fileURLToPath(new URL("../",import.meta.url));
const nativeRequire=createRequire(import.meta.url);
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


const {galleryImageSizes}=loader()("lib/images.ts");
const fixtures=[];
for(const width of [480,640,828,1280,1920,2560]) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width*1.5}" viewBox="0 0 400 600"><defs><pattern id="lines" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#302332"/><path d="M0 0H20V20" fill="none" stroke="#e8b04b" stroke-width="1"/></pattern></defs><rect width="400" height="600" fill="url(#lines)"/><circle cx="200" cy="280" r="90" fill="#e8b04b"/><path d="M120 280H280M200 200V360" stroke="#302332" stroke-width="2"/></svg>`;
  const bytes=await sharp(Buffer.from(svg)).webp({quality:90}).toBuffer();
  fixtures.push({width,url:`http://127.0.0.1:3000/__qa_art/${width}.webp`,body:bytes.toString("base64")});
}
socket.addEventListener('message',({data})=>{
  const event=JSON.parse(data);
  if(event.method==='Fetch.requestPaused') {
    const fixture=fixtures.find(f=>f.url===event.params.request.url);
    void send('Fetch.fulfillRequest',{requestId:event.params.requestId,responseCode:fixture?200:404,responseHeaders:[{name:'Content-Type',value:'image/webp'},{name:'Cache-Control',value:'no-store'}],body:fixture?.body??''});
  }
});
await send('Fetch.enable',{patterns:[{urlPattern:'http://127.0.0.1:3000/__qa_art/*'}]});
try {
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height,dpr] of [[390,844,3],[768,1024,2],[1440,900,2],[1440,900,1]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:3000/work'});
    await waitFor(`document.readyState==='complete' && document.querySelector('main a[href^="/work/"]') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
    await evaluate('document.fonts.ready.then(()=>true)');
    await pause(1500);
    await evaluate(`(()=>{const card=document.querySelector('main a[href^="/work/"]');card.parentElement.style.setProperty('--cols','repeat(2,minmax(0,1fr))');const frame=card.firstElementChild;frame.replaceChildren();const img=new Image();img.id='qa-art';Object.assign(img.style,{position:'absolute',width:'100%',height:'100%',inset:'0'});img.sizes=${JSON.stringify(galleryImageSizes('2'))};img.srcset=${JSON.stringify(fixtures.map(f=>`${f.url} ${f.width}w`).join(', '))};img.src=${JSON.stringify(fixtures[0].url)};frame.append(img);card.scrollIntoView({block:'center',behavior:'instant'});return true})()`);
    await evaluate(`document.getElementById('qa-art').decode().then(()=>true)`);
    const info=await evaluate(`(()=>{const i=document.getElementById('qa-art');const r=i.getBoundingClientRect();return {chosen:Number(i.currentSrc.split('/').pop().split('.')[0]),width:i.clientWidth,left:r.left,right:r.right,dpr:devicePixelRatio}})()`);
    assert.ok(info.chosen>=info.width*dpr,JSON.stringify(info));
    assert.ok(info.chosen<=info.width*dpr*1.6,'Avoid downloading oversized candidates: '+JSON.stringify(info));
    assert.ok(info.left>=0&&info.right<=width+1,JSON.stringify(info));
    console.log('PASS density and placement',JSON.stringify(info));
    if(width===1440&&dpr===1){
      await evaluate(`(()=>{const i=document.getElementById('qa-art');i.style.objectPosition='20% 80%';i.style.transformOrigin='20% 80%';i.style.transform='scale(1.2)';const r=i.parentElement.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+100}})()`);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await evaluate(`document.getElementById('qa-art').closest('a').focus()`);await pause(800);
      const crop=await evaluate(`(()=>{const s=getComputedStyle(document.getElementById('qa-art'));return {position:s.objectPosition,transform:s.transform,scale:s.scale}})()`);
      assert.equal(crop.position,'20% 80%');assert.match(crop.transform,/1.2/);assert.equal(crop.scale,'1.05');
      console.log('PASS: interactive zoom preserves saved crop position and zoom');
      await screenshot('quality-art-desktop');
    }
  }
  for(const [width,height] of [[280,720],[390,844],[768,1024],[1440,900]]) {
    await viewport(width,height);
    await send('Page.navigate',{url:'http://127.0.0.1:3000/work/premante'});
    await waitFor(`document.readyState==='complete' && document.querySelector('article') && getComputedStyle(document.querySelector('main')).opacity==='1'`);
    await evaluate('document.fonts.ready.then(()=>true)');
    const outside=await evaluate(`Array.from(document.querySelectorAll('article .container, article h1, article a, article [class*="creditRow"]')).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+2}).map(e=>({tag:e.tagName,text:e.textContent.slice(0,70)}))`);
    assert.deepEqual(outside,[],`Project content overflow at ${width}`);
    if(width===390)await screenshot('quality-project-phone');
    console.log('PASS project-page placements',width);
  }
  assert.deepEqual(errors,[]);
} finally {await send('Fetch.disable');socket.close();}

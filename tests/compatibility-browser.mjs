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

const records=[];
const sizes=[[280,720],[320,740],[390,844],[768,1024],[844,390],[900,700],[1024,768],[1280,800],[1440,900],[1920,1080],[2560,1440]];
try {
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 for(const route of ['/?compatibility#agency','/work','/work/dacoit','/process/sketchboards','/process/photoshoot-bts','/breakdowns','/portal']) {
  await viewport(390,844);await send('Page.navigate',{url:'http://localhost:3000'+route});
  await waitFor('document.readyState==="complete" && (location.pathname==="/portal" || (!!document.querySelector("main") && getComputedStyle(document.querySelector("main")).opacity==="1" && !document.querySelector(".intro-curtain")))');
  await evaluate('document.fonts.ready.then(()=>true)');
  for(const [width,height] of sizes) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=600});
   await send('Emulation.setTouchEmulationEnabled',{enabled:width<=1024,maxTouchPoints:5});
   await evaluate('scrollTo({top:0,behavior:"instant"})');await pause(350);
   const metrics=await evaluate('('+function(){
    const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!el.closest('[aria-hidden="true"],[data-marquee],.sr-only');};
    const details=el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,cls:typeof el.className==='string'?el.className:'',text:el.textContent?.trim().slice(0,65),left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:el.clientWidth,scroll:el.scrollWidth};};
    const candidates=[...document.querySelectorAll('main .container, main h1,main h2,main h3,main p, main form, main input:not([type=hidden]):not([type=checkbox]),main select,main textarea, header nav a,header button, footer .container')].filter(visible);
    const overflow=candidates.map(details).filter(r=>r.left < -1 || r.right>innerWidth+1 || (r.width>0&&r.scroll>r.width+2));
    const sections=[...document.querySelectorAll('main>section')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),c=el.querySelector('.container')?.getBoundingClientRect();return {id:el.id,top:Math.round(r.top+scrollY),height:Math.round(r.height),padTop:parseFloat(s.paddingTop),padBottom:parseFloat(s.paddingBottom),contentLeft:c?.left,contentRight:c?.right};});
    const header=document.querySelector('header'),brand=header?.querySelector('a'),nav=header?.querySelector('nav');
    const b=brand?.getBoundingClientRect(),n=nav?.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.textContent,overflow,sections,navOverlap:!!(b&&n&&visible(brand)&&visible(nav)&&b.right>n.left&&b.left<n.right)};
   }+')()');
   records.push({route,...metrics});
   if(metrics.overflow.length||metrics.navOverlap||metrics.scrollWidth>width+1)console.log(JSON.stringify({route,width,overflow:metrics.overflow,navOverlap:metrics.navOverlap,scrollWidth:metrics.scrollWidth}));
   if([390,900,1440].includes(width))await screenshot('compat-'+route.split('?')[0].replaceAll('/','_')+'-'+width);
   if(route.startsWith('/?')&&[390,1440].includes(width))for(const id of ['collaborations','process','contact']){await evaluate('document.getElementById('+JSON.stringify(id)+').scrollIntoView()');await pause(350);await screenshot('compat-home-'+id+'-'+width);}
  }
  console.log('AUDITED '+route);
 }
 await writeFile(path.join(output,'compatibility-report.json'),JSON.stringify({records,errors},null,2));
 assert.deepEqual(errors, [], 'Browser runtime exceptions');
 for (const record of records) {
  assert.ok(record.scrollWidth <= record.width + 1, `Page overflow: ${record.route} at ${record.width}`);
  assert.deepEqual(record.overflow, [], `Content overflow: ${record.route} at ${record.width}`);
  assert.equal(record.navOverlap, false, `Navigation overlap: ${record.route} at ${record.width}`);
  assert.notEqual(record.title, '404', `Missing page: ${record.route}`);
  const sections = record.route.startsWith('/?') ? record.sections.filter(section => section.id !== 'top') : [];
  const aligned = sections.filter(section => section.contentLeft !== undefined);
  for (const section of sections) {
   assert.ok(section.padTop <= 41 && section.padBottom <= 41, `Excess section padding: ${section.id}`);
  }
  for (const section of aligned) {
   assert.ok(Math.abs(section.contentLeft - aligned[0].contentLeft) <= 1, `Left alignment: ${section.id}`);
   assert.ok(Math.abs(section.contentRight - aligned[0].contentRight) <= 1, `Right alignment: ${section.id}`);
  }
 }
 console.log('Completed '+records.length+' viewport/page combinations. Runtime exceptions: '+errors.length);
}finally{socket.close();}

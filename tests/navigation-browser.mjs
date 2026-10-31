// Read-only local browser checks. Uses an isolated Chromium with --remote-debugging-port=9227.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const targets = await (await fetch("http://127.0.0.1:9227/json/list")).json();
const target = targets.find(t => t.type === "page" && (t.url === "about:blank" || t.url.startsWith("http://localhost:3000")));
assert.ok(target);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map(), errors = []; let id = 0;
socket.onmessage = ({data}) => {
  const msg = JSON.parse(data);
  if (msg.id) { const job = pending.get(msg.id); pending.delete(msg.id); if (msg.error) job.reject(new Error(msg.error.message)); else job.resolve(msg.result); }
  else if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map(a => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id, timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 45000);
  pending.set(next, {resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
  socket.send(JSON.stringify({id:next,method,params}));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", {expression,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Evaluation failed");
  return r.result.value;
};
const delay = ms => new Promise(r=>setTimeout(r,ms));
const wait = async expression => { const start=Date.now();while(Date.now()-start<45000){if(await evaluate(expression))return;await delay(250)}throw new Error(`Timeout: ${expression}`); };
const nav = async url => { await send("Page.navigate",{url:`http://localhost:3000${url}`});await wait("!!document.querySelector('main') && getComputedStyle(document.querySelector('main')).opacity==='1' && !!history.state?.ddsNavigationTrail"); };
const crumbs = () => evaluate("[...document.querySelectorAll('[data-navigation-trail] ol li')].map(e=>({text:e.textContent.replace('›','').trim(),href:e.querySelector('a')?.getAttribute('href')??null}))");
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const output=path.join(os.tmpdir(),"dds-navigation-qa");await mkdir(output,{recursive:true});
try {
  await send("Page.enable");await send("Runtime.enable");await send("Page.bringToFront");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await nav("/work");await wait("!!document.querySelector('[data-navigation-trail]')");
  assert.deepEqual((await crumbs()).map(c=>c.text),["Home","All work"]);
  await click("main a[href^='/work/']");await wait("location.pathname.startsWith('/work/') && !!document.querySelector('[data-navigation-trail] [aria-current=page]')");await delay(500);
  const projectPath = await evaluate("location.pathname");
  assert.equal((await crumbs())[1].href,"/work");
  assert.equal(await evaluate("document.querySelector('[data-navigation-trail] > a').getAttribute('href')"),"/work");
  await send("Page.reload");await wait("!!document.querySelector('[data-navigation-trail]') && !!history.state?.ddsNavigationTrail");
  assert.equal((await crumbs()).at(-1).href,null);
  for (const width of [1440,1024,820,390,320]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:false});await delay(300);
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    assert.ok(await evaluate("(()=>{const r=document.querySelector('[data-navigation-trail]').getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth})()"));
    assert.ok(await evaluate("(()=>{const t=document.querySelector('[data-navigation-trail]'),r=t.getBoundingClientRect(),h=document.querySelector('header[data-chrome]').getBoundingClientRect(),n=t.nextElementSibling.getBoundingClientRect();return r.top>=h.bottom+16&&n.top>=r.bottom+16})()"),"Breadcrumb has clear space below the header and above page content");
    const image = await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(output,`breadcrumbs-${width}.png`),Buffer.from(image.data,"base64"));
  }
  // Stress only the test DOM, never saved project content: six steps, long unbroken titles and double-size text.
  await evaluate("(()=>{const t=document.querySelector('[data-navigation-trail]');window.__trailMarkup=t.innerHTML;window.__trailStyle=t.getAttribute('style');const ol=t.querySelector('ol'),last=ol.lastElementChild;for(let i=0;i<3;i++)ol.append(last.cloneNode(true));for(const e of ol.querySelectorAll('li:nth-child(n+3) [aria-current]'))e.textContent='VeryLongFilmTitleWithoutSpaces'.repeat(4);t.style.fontSize='22px';})()");
  assert.ok(await evaluate("(()=>{const t=document.querySelector('[data-navigation-trail]'),r=t.getBoundingClientRect(),n=t.nextElementSibling.getBoundingClientRect(),back=t.firstElementChild.getBoundingClientRect(),items=[...t.querySelectorAll('ol a,ol [aria-current]')].map(e=>e.getBoundingClientRect());return document.documentElement.scrollWidth<=innerWidth&&t.scrollWidth<=t.clientWidth+1&&n.top>=r.bottom+16&&items.every(a=>a.left>=back.right+4&&a.right<=r.right-4)&&items.every((a,i)=>items.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))})()"),"Long labels and larger text wrap without overlapping Back, other steps or content");
  const stress = await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(output,"breadcrumbs-long-text-320.png"),Buffer.from(stress.data,"base64"));
  await evaluate("(()=>{const t=document.querySelector('[data-navigation-trail]');t.innerHTML=window.__trailMarkup;if(window.__trailStyle)t.setAttribute('style',window.__trailStyle);else t.removeAttribute('style');delete window.__trailMarkup;delete window.__trailStyle})()");
  // Reload after temporary DOM stress so React retains ownership of every link.
  await send("Page.reload");await wait("!!document.querySelector('[data-navigation-trail]') && !!history.state?.ddsNavigationTrail");await delay(300);
  await click("[data-navigation-trail] > a");await wait("location.pathname==='/work'");
  await evaluate("history.back()");await wait(`location.pathname===${JSON.stringify(projectPath)}`);await delay(400);
  assert.equal((await crumbs())[1].href,"/work","Browser Back restores the entry's parent trail");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await nav("/?navigation-check#collaborations");await wait("!!document.querySelector('#collaborations')");
  await evaluate("document.querySelector('#collaborations').scrollIntoView()");await wait("document.querySelector('[data-disc-state]')?.dataset.discState==='ready'");
  await evaluate("document.querySelector('#collaborations details').open=true");
  await click("#collaborations button[aria-label^='Preview ']");await wait("!!document.querySelector('dialog[open]')");
  await click("dialog a[href^='/work/']");await wait("location.pathname.startsWith('/work/') && !!document.querySelector('[data-navigation-trail]')");await delay(600);
  assert.equal((await crumbs()).at(-2).href,"/#collaborations","Disc entry returns to the disc, not the full gallery");
  await click("[data-navigation-trail] > a");await wait("location.pathname==='/' && location.hash==='#collaborations'");await delay(1100);
  assert.ok(await evaluate("(()=>{const r=document.querySelector('#collaborations').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()"));
  await nav("/breakdowns");await wait("!!document.querySelector('[data-navigation-trail]')");
  assert.deepEqual((await crumbs()).map(c=>c.text),["Home","How we work","Breakdowns"]);
  await nav("/?navigation-check#process");await wait("!!document.querySelector('#process [data-opens=true]')");
  await click("#process [data-opens=true]");await wait("location.pathname.startsWith('/process/') && !!document.querySelector('[data-navigation-trail]')");await delay(300);
  assert.equal((await crumbs()).at(-2).href,"/#process","Button-driven process navigation retains its entry section");
  assert.ok(await evaluate("[...document.querySelectorAll('header a')].some(a=>a.getAttribute('href')?.includes('#process') && a.getAttribute('aria-current'))"),"How we work menu stays active inside process pages");
  await nav(projectPath+"?portal-preview");await wait("!!document.querySelector('[data-navigation-trail]') && !!history.state?.ddsNavigationTrail");await delay(500);
  assert.ok((await crumbs()).filter(c=>c.href).every(c=>c.href.includes("portal-preview")));
  await click("[data-navigation-trail] > a");await wait("location.pathname==='/work' && location.search.includes('portal-preview')");
  assert.deepEqual(errors,[]);
  console.log("PASS: navigation history and preview preserved; no breadcrumb/header/content overlap at 1440/1024/820/390/320, including six long labels with double-size text.");
} finally {
  if(process.env.DDS_QA_CLOSE==="1")await send("Browser.close");
  socket.close();
}

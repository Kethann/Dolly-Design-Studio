// Local-only rendering checks. Use an isolated Chromium on port 9227 and next dev on 3000.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";
import os from "node:os";
import path from "node:path";
const tabs = await (await fetch("http://127.0.0.1:9227/json/list")).json();
const tab = tabs.find(t => t.type === "page" && /^(about:blank|http:\/\/(localhost|127\.0\.0\.1):3000)/.test(t.url));
assert.ok(tab, "An isolated local test tab is required");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const jobs = new Map(), errors = [], samples = new Map(), imageRequests = new Map();
ws.onmessage = ({ data }) => {
  const e = JSON.parse(data);
  if (e.id) { const job = jobs.get(e.id); jobs.delete(e.id); if (e.error) job?.reject(new Error(e.error.message)); else job?.resolve(e.result); }
  if (e.method === "Runtime.exceptionThrown") errors.push(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
  if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") errors.push(e.params.args.map(x => x.value ?? x.description).join(" "));
  if (e.method === "Fetch.requestPaused") {
    const pathname=new URL(e.params.request.url).pathname, parent=pathname==='/__glass-test';
    if (samples.has(pathname)) imageRequests.set(pathname,(imageRequests.get(pathname)??0)+1);
    const body=parent?Buffer.from('<!doctype html><html><head><title>Local glass QA</title></head><body></body></html>').toString('base64'):samples.get(pathname);
    void send(body ? "Fetch.fulfillRequest" : "Fetch.continueRequest", body
      ? {requestId:e.params.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:parent?'text/html':'image/png'}],body}
      : {requestId:e.params.requestId}).catch(error=>{
        // Navigation can cancel an in-flight fixture image before fulfillment reaches Chromium.
        if(!error.message.includes('Invalid InterceptionId'))errors.push(error.message);
      });
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { jobs.delete(id); reject(new Error(method + " timeout")); }, 45000);
    jobs.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Evaluation failed");
  return r.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(300); }
  throw new Error("Timed out: " + expression + "\n" + errors.join("\n"));
}
const output = path.join(os.tmpdir(), "dds-glass-qa");
const appearanceOnly = process.argv.includes('--appearance-only');
await mkdir(output, { recursive: true });
async function screenshot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(path.join(output, name + ".png"), Buffer.from(shot.data, "base64"));
}
try {
  await send("Page.enable");
  await send("Page.navigate", {url:"about:blank"});
  await send("Runtime.enable");
  await until('location.href === "about:blank"');
  await send('Runtime.discardConsoleEntries');
  errors.length=0;
  const instrumentation = await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__glass={draws:0,arrival:0,exit:0,frames:0,artwork:false,opacity:0,entranceSamples:[]};
    const gl=WebGL2RenderingContext.prototype, names=new WeakMap(), programs=new WeakMap(), titlePrograms=new WeakSet(), glassPrograms=new WeakSet(), locate=gl.getUniformLocation, scalar=gl.uniform1f, matrix=gl.uniformMatrix4fv, triple=gl.uniform3f;
    gl.uniform3f=function(u,r,g,b){if(names.get(u)==='glassTint')window.__glass.tint=[r,g,b];return triple.call(this,u,r,g,b);};
    gl.getUniformLocation=function(...a){const u=locate.apply(this,a);if(u){names.set(u,a[1]);programs.set(u,a[0]);if(a[1]==='imageAspect')titlePrograms.add(a[0]);if(a[1]==='glassOpacity')glassPrograms.add(a[0]);}return u;};
    gl.uniform1f=function(u,v){if(names.get(u)==='arrival'){window.__glass.arrival=v;window.__glass.frames++;}if(names.get(u)==='entranceOpacity'){window.__glass.opacity=v;if(window.__glass.entranceSamples.length<120)window.__glass.entranceSamples.push(v);}if(names.get(u)==='scrollExit')window.__glass.exit=v;if(names.get(u)==='beamWidth')window.__glass.beamWidth=v;if(names.get(u)==='imageAspect'&&v>1.5)window.__glass.artwork=true;return scalar.call(this,u,v);};
    gl.uniformMatrix4fv=function(u,t,v,...rest){if(names.get(u)==='modelMatrix'&&this.canvas.closest('#collaborations')){if(titlePrograms.has(programs.get(u)))window.__glass.titleMatrix=Array.from(v);if(glassPrograms.has(programs.get(u)))window.__glass.glassMatrix=Array.from(v);}return matrix.call(this,u,t,v,...rest);};
    for(const method of ['drawElements','drawArrays']){const draw=gl[method];gl[method]=function(...a){window.__glass.draws++;return draw.apply(this,a);};}
  })();` });
  for (const [width, height, name] of process.argv.includes('--artwork-only') || appearanceOnly ? [] : [[1440,900,"desktop"],[820,1180,"tablet"],[390,844,"mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await send("Page.navigate", { url: `http://localhost:3000/?glass-check=${name}#collaborations` });
    await until(`location.search==='?glass-check=${name}' && !!document.querySelector("#collaborations") && (!document.querySelector(".intro-curtain") || getComputedStyle(document.querySelector(".intro-curtain")).display==='none')`);
    await evaluate('document.querySelector("#collaborations").scrollIntoView({behavior:"instant"})');
    await until('document.querySelector("#collaborations [data-disc-state]")?.dataset.discState === "ready"');
    await until('!!window.__glass.glassMatrix');
    const basis = matrix => { const length=Math.hypot(...matrix.slice(0,3)); return matrix.slice(0,3).map(v=>v/length); };
    const arriving = await evaluate('window.__glass.glassMatrix');
    // Wait for an actual rendered rotation update: first-use shader compilation on
    // software/low-power GPUs can outlast a fixed 400 ms wall-clock delay.
    await until(`(()=>{const m=window.__glass.glassMatrix,n=Math.hypot(...m.slice(0,3));return JSON.stringify(m.slice(0,3).map(v=>v/n))!==${JSON.stringify(JSON.stringify(basis(arriving)))}})()`);
    assert.notDeepEqual(basis(await evaluate('window.__glass.glassMatrix')),basis(arriving),'Glass rotates during its approach');
    await screenshot(name + "-arrival");
    await until('window.__glass.arrival > .999');
    const entranceSamples = await evaluate('window.__glass.entranceSamples');
    assert.ok(entranceSamples[0] < .1, 'First rendered glass frame fades in instead of flashing');
    assert.ok(entranceSamples.some(v => v > 0 && v < 1), 'Entrance includes intermediate opacity');
    assert.equal(await evaluate('window.__glass.opacity'), 1);
    assert.ok(entranceSamples.every((v,i) => v >= 0 && v <= 1 && (!i || v >= entranceSamples[i-1])), 'Entrance opacity never pulses or overshoots');
    await screenshot(name + "-settled");
    const settled = await evaluate('window.__glass.glassMatrix');
    await pause(500);
    assert.notDeepEqual(basis(await evaluate('window.__glass.glassMatrix')),basis(settled),'Rotation continues after position settles');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), name + " horizontal overflow");
    assert.equal(await evaluate('document.querySelectorAll("#collaborations details").length'), 0);
    await evaluate('document.querySelector("#collaborations button").click()');
    await pause(1400);
    // Other sections also have WebGL effects; only the local uniform proves the circle is settled.
    assert.equal(await evaluate('window.__glass.arrival'), 1);
    const frames=await evaluate('window.__glass.frames');
    await pause(500);
    assert.equal(await evaluate('window.__glass.frames'),frames,'Paused scene must stop rendering when settled');
    await evaluate('document.querySelector("#collaborations button").click()');
    await pause(150);
    const resumed=await evaluate('window.__glass.glassMatrix');
    await pause(400);
    assert.notDeepEqual(await evaluate('window.__glass.glassMatrix'),resumed,'Resume continues rotating');
    await evaluate('document.querySelector("#collaborations button").click()');
    await evaluate('window.scrollBy({top:300,behavior:"instant"})'); await pause(1300);
    assert.ok(await evaluate('window.__glass.exit > .1'), "Scroll must feather the glass even when paused");
    await screenshot(name + "-scroll-fade");
    await evaluate('document.querySelector("#collaborations").scrollIntoView({behavior:"instant"})');
    await until('window.__glass.exit === 0');
    assert.equal(await evaluate('window.__glass.arrival'), 1, 'Returning restores visibility without replaying the zoom');
    console.log(name + ": ready, entrance completed, responsive bounds and scroll fade passed");
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url: "http://localhost:3000/?glass-reduced#collaborations" });
  await until('!!document.querySelector("#collaborations") && (!document.querySelector(".intro-curtain") || getComputedStyle(document.querySelector(".intro-curtain")).display==="none")');
  await evaluate('document.querySelector("#collaborations").scrollIntoView({behavior:"instant"})');
  await until('window.__glass.arrival === 1');
  assert.equal(await evaluate('window.__glass.opacity'), 1, 'Reduced-motion view is immediately visible');
  // In-memory preview fixture: no saved content, uploads or credentials are modified.
  const settings=JSON.parse(await readFile(new URL('../content/intro-settings.json',import.meta.url),'utf8'));
  const titles=['AFTERLIGHT','MONSOON','SOLSTICE','NOCTURNE','THE RETURN','FIRST LIGHT','ECHO','HORIZON'];
  const colours=['#ffb34f','#60d9ba','#f6915e','#8fafff','#d89ded','#f9dc7d','#7dc9ed','#d9a4ff'];
  for(let i=0;i<8;i++){
    const src='/images/qa/title-'+i+'.png';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="256"><text x="384" y="158" text-anchor="middle" fill="${colours[i]}" font-family="Arial" font-weight="bold" font-size="88">${titles[i]}</text></svg>`;
    samples.set(src,(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'));
    settings.proofTable.items[i]={...settings.proofTable.items[i],src,film:titles[i]};
  }
  settings.proofTable.items=settings.proofTable.items.slice(0,8);
  await send('Fetch.enable',{patterns:[{urlPattern:'*://localhost:3000/images/qa/*'},{urlPattern:'*://localhost:3000/__glass-test'}]});
  for(const [width,height,name] of appearanceOnly ? [[1100,760,'desktop'],[820,1000,'tablet'],[390,844,'mobile']] : [[1440,900,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await send('Page.navigate',{url:'http://localhost:3000/__glass-test'});
    await until('document.readyState === "complete" && document.title === "Local glass QA"');
    await evaluate(`(() => {
      window.fixtureSettings=${JSON.stringify(settings)};
      window.fixtureReady=false;
      window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.source==='dds-site'&&e.data.type==='ready'){
        e.source.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin);
        e.source.postMessage({source:'dds-portal',type:'run',run:{key:1,at:30,paused:true,seed:1}},location.origin);
        window.fixtureReady=true;
      }});
      document.body.innerHTML='<iframe id="fixture" src="/?portal-preview" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>';
    })()`);
    await until('window.fixtureReady && !!document.querySelector("#fixture").contentDocument.querySelector("#collaborations")');
    await pause(800);
    await evaluate('document.querySelector("#fixture").contentDocument.querySelector("#collaborations").scrollIntoView({behavior:"instant"})');
    await until('document.querySelector("#fixture").contentDocument.querySelector("#collaborations [data-disc-state]")?.dataset.discState === "ready"');
    await until('document.querySelector("#fixture").contentWindow.__glass?.artwork');
    await pause(600);
    assert.equal(await evaluate(`Number(document.querySelector('#fixture').contentWindow.getComputedStyle(document.querySelector('#fixture').contentDocument.querySelector('#collaborations'),'::before').opacity)`),0,'Default glass has no dark backdrop');
    await screenshot(name+'-artwork');
    if (name === 'desktop') {
      const firstTitle = '/images/qa/title-0.png';
      const before = imageRequests.get(firstTitle) ?? 0;
      assert.ok(before > 0, 'First title was decoded before a live reorder');
      await evaluate(`(() => {
        const f=document.querySelector('#fixture'), items=window.fixtureSettings.proofTable.items;
        window.fixtureSettings.proofTable.items=[...items.slice(1),items[0]];
        f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin);
      })()`);
      await pause(800);
      assert.equal(imageRequests.get(firstTitle), before, 'Reordering retains decoded title artwork instead of fetching it again');
      assert.equal(await evaluate('document.querySelector("#fixture").contentDocument.querySelector("#collaborations [data-disc-state]")?.dataset.discState'), 'ready');
    }
    // Exercise live settings through the same protocol as the portal, without saving.
    const stablePose=await evaluate('document.querySelector("#fixture").contentWindow.__glass.glassMatrix');
    await evaluate(`(() => {const f=document.querySelector('#fixture');window.fixtureSettings.proofTable.disc??={};window.originalDisc=structuredClone(window.fixtureSettings.proofTable.disc);window.fixtureSettings.proofTable.disc.beamWidth=.25;f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin)})()`);
    await until(`Math.abs(document.querySelector('#fixture').contentWindow.__glass.beamWidth-.25)<.01`);
    await screenshot(name+'-beam-slim');
    await evaluate(`(() => {const f=document.querySelector('#fixture');window.fixtureSettings.proofTable.disc.beamWidth=2;f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin)})()`);
    await until(`Math.abs(document.querySelector('#fixture').contentWindow.__glass.beamWidth-2)<.01`);
    await screenshot(name+'-beam-broad');
    assert.deepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.glassMatrix'),stablePose,'Beam width changes never reset the circle pose');
    await evaluate(`(() => {const f=document.querySelector('#fixture');Object.assign(window.fixtureSettings.proofTable.disc,{beamWidth:window.originalDisc.beamWidth??1,glassTintColor:'#224466',glassOpacity:.4,shadowColor:'#443322',shadowOpacity:.35,shadowSpread:1.3});f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin)})()`);
    await until(`(()=>{const w=document.querySelector('#fixture').contentWindow,s=w.getComputedStyle(w.document.querySelector('#collaborations'),'::before');return w.__glass.tint?.[2]>.12 && w.__glass.tint?.[2]<.15 && s.backgroundColor==='rgb(68, 51, 34)' && Math.abs(Number(s.opacity)-.35)<.001})()`);
    assert.deepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.glassMatrix'),stablePose,'Appearance changes never reset the circle pose');
    assert.ok(await evaluate(`document.querySelector('#fixture').contentDocument.querySelector('#collaborations').style.getPropertyValue('--glass-shadow-spread')==='1.3'`));
    await screenshot(name+'-tint-controls');
    await evaluate(`(()=>{const f=document.querySelector('#fixture');window.fixtureSettings.proofTable.disc.shadowOpacity=0;f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin)})()`);
    await until(`Number(document.querySelector('#fixture').contentWindow.getComputedStyle(document.querySelector('#fixture').contentDocument.querySelector('#collaborations'),'::before').opacity)===0`);
    await evaluate(`(()=>{const f=document.querySelector('#fixture');window.fixtureSettings.proofTable.disc=window.originalDisc;f.contentWindow.postMessage({source:'dds-portal',type:'settings',settings:window.fixtureSettings},location.origin)})()`);
    await until(`document.querySelector('#fixture').contentWindow.__glass.tint?.[2]>.8`);
    if (appearanceOnly) {
      // A patterned backing exposes milky fills that a plain dark page hides.
      // This is a local fixture only; no saved backdrop or content is changed.
      await evaluate(`(()=>{const c=document.querySelector('#fixture').contentDocument.querySelector('#collaborations canvas');c.parentElement.style.background='repeating-linear-gradient(90deg,#301943 0 12px,#6a3f7c 12px 24px)'})()`);
      await pause(300);
      await screenshot(name+'-transmission');
      const visible=await sharp(await readFile(path.join(output,name+'-transmission.png'))).removeAlpha().raw().toBuffer();
      await evaluate(`document.querySelector('#fixture').contentDocument.querySelector('#collaborations canvas').style.visibility='hidden'`);
      const baselineShot=await send('Page.captureScreenshot',{format:'png'});
      const baseline=await sharp(Buffer.from(baselineShot.data,'base64')).removeAlpha().raw().toBuffer();
      const errors=[];
      for(let i=0;i<baseline.length;i+=3){
        if((baseline[i]===48&&baseline[i+1]===25&&baseline[i+2]===67)||(baseline[i]===106&&baseline[i+1]===63&&baseline[i+2]===124))
          errors.push((Math.abs(visible[i]-baseline[i])+Math.abs(visible[i+1]-baseline[i+1])+Math.abs(visible[i+2]-baseline[i+2]))/3);
      }
      errors.sort((a,b)=>a-b);
      assert.ok(errors.length>1000,'Patterned backing is visible in the fixture');
      assert.ok(errors[Math.floor(errors.length*.7)]<12,name+' glass transmits the backing without a dense fill');
      await evaluate(`(()=>{const c=document.querySelector('#fixture').contentDocument.querySelector('#collaborations canvas');c.style.visibility='';c.parentElement.style.background=''})()`);
    }
    console.log(name+': independent tint/shadow colours, spread, zero opacity and reset preview passed');
    assert.ok(await evaluate('document.querySelector("#fixture").contentDocument.documentElement.scrollWidth <= innerWidth+1'),name+' artwork bounds');
    if (appearanceOnly) continue;
    // Find an actual hit through canvas pointer events, then exercise the retained popup and Escape.
    const point=await evaluate(`(() => {
      const doc=document.querySelector('#fixture').contentDocument, win=doc.defaultView;
      const canvas=doc.querySelector('#collaborations canvas'), b=canvas.getBoundingClientRect();
      for(let y=Math.max(b.top,130);y<Math.min(innerHeight-30,b.bottom);y+=16)for(let x=Math.max(b.left+16,innerWidth*.35);x<Math.min(innerWidth-20,b.right);x+=16){
        if(doc.elementFromPoint(x,y)!==canvas)continue;
        const hit=(dx,dy)=>{canvas.dispatchEvent(new win.PointerEvent('pointermove',{clientX:x+dx,clientY:y+dy,pointerType:'mouse'}));return canvas.style.cursor==='pointer';};
        if(hit(0,0)&&hit(-10,0)&&hit(10,0)&&hit(0,-10)&&hit(0,10)&&hit(0,0))return {x,y};
      }return null;
    })()`);
    assert.ok(point,name+' has a visible interactive title');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    await until('!!document.querySelector("#fixture").contentDocument.querySelector("dialog[open]")');
    await screenshot(name+'-popup');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until('!document.querySelector("#fixture").contentDocument.querySelector("dialog[open]")');
    await pause(250);
    const matrixBefore=await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix');
    assert.ok(matrixBefore?.length===16,'Title transform is observable');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    for(let step=1;step<=10;step++){
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x-12*step,y:point.y,button:'left',buttons:1});
      await pause(25);
    }
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x-120,y:point.y,button:'left',clickCount:1});
    await pause(250);
    assert.equal(await evaluate('!!document.querySelector("#fixture").contentDocument.querySelector("dialog[open]")'),false,'Dragging never opens the detail card');
    const matrixAfter=await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix');
    assert.notDeepEqual(matrixAfter,matrixBefore,'Dragging rotates the title artwork even with reduced motion');
    await pause(300);
    assert.deepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix'),matrixAfter,'Reduced motion does not auto-resume after a drag');
    await screenshot(name+'-dragged');
    if(name==='desktop'){
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await pause(300);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await pause(300);
      const held=await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix');
      await pause(350);
      assert.deepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix'),held,'Holding takes control of auto rotation');
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x-25,y:point.y,button:'left',buttons:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x-25,y:point.y,button:'left',clickCount:1});
      await pause(250);
      const released=await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix');
      await pause(700);
      assert.notDeepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix'),released,'Automatic rotation resumes after releasing the circle');
      console.log('Desktop hold and automatic resume passed');
    }
    if(name==='mobile'){
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      const beforeTouch=await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
      for(let step=1;step<=10;step++){
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-step*10,y:point.y,id:0}]});
        await pause(25);
      }
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await pause(250);
      assert.notDeepEqual(await evaluate('document.querySelector("#fixture").contentWindow.__glass.titleMatrix'),beforeTouch,'A sideways touch swipe rotates the glass');
      assert.equal(await evaluate('!!document.querySelector("#fixture").contentDocument.querySelector("dialog[open]")'),false);
      const scrollBefore=await evaluate('document.querySelector("#fixture").contentWindow.scrollY');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
      for(let step=1;step<=10;step++){
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-step*12,id:0}]});
        await pause(25);
      }
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await pause(500);
      assert.ok(await evaluate('document.querySelector("#fixture").contentWindow.scrollY')>scrollBefore+20,'Vertical touch gestures still scroll the page');
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
      console.log('Mobile touch rotation and native vertical scrolling passed');
    }
    console.log(name+': sample PNG rendering, title click, popup, Escape and drag rotation passed');
  }
  await evaluate(`document.querySelector('#fixture').contentDocument.querySelector('#collaborations canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`);
  await until('document.querySelector("#fixture").contentDocument.querySelector("#collaborations [data-disc-state]")?.dataset.discState === "fallback"');
  assert.ok(await evaluate('document.querySelector("#fixture").contentDocument.querySelectorAll("#collaborations details a").length > 0'),'Context-loss fallback preserves project links');
  console.log('Context-loss fallback passed');
  await send('Fetch.disable');
  assert.deepEqual(errors.filter(e => !e.includes("Failed to load resource")), [], "Browser/shader errors");
  console.log("Reduced motion passed. Screenshots: " + output);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:instrumentation.identifier});
} finally { ws.close(); }

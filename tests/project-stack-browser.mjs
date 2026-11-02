// Local visual and interaction check: isolated Chromium on port 9227, Next on port 3000.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const target = (await (await fetch("http://127.0.0.1:9227/json/list")).json())
  .find((tab) => tab.type === "page" && /^(about:blank|http:\/\/localhost:3000)/.test(tab.url));
assert.ok(target, "An isolated local Chromium tab is required");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const pending = new Map();
const errors = [];
let sequence = 0;
socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.id) {
    const job = pending.get(event.id);
    pending.delete(event.id);
    if (event.error) job.reject(new Error(`${job.method}: ${event.error.message}`)); else job.resolve(event.result);
  }
  if (event.method === "Runtime.exceptionThrown") errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 45000);
  pending.set(id, { method, resolve: (result) => { clearTimeout(timeout); resolve(result); }, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); break; }
    catch (error) {
      if (!error.message.includes("Object reference chain is too long") || attempt === 2) throw new Error(`${error.message} in ${expression.slice(0, 110)}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "Evaluation failed");
  return result.result.value;
};
const waitFor = async (expression) => {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${expression}`);
};
const output = path.join(os.tmpdir(), "dds-project-stack-qa");
await mkdir(output, { recursive: true });
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

try {
  for (const [width, height, name] of [[1440, 900, "desktop"], [768, 1024, "tablet"], [390, 844, "mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Page.navigate", { url: "http://localhost:3000/work/dacoit" });
    await waitFor(`document.readyState==="complete" && !!document.querySelector('[aria-label="Project artwork gallery"] button[data-depth]')`);
    await evaluate(`document.querySelector('[aria-label="Project artwork gallery"]').scrollIntoView({block:'center',behavior:'instant'})`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const positions = await evaluate(`(() => {
      const cards=[...document.querySelectorAll('[aria-label="Project artwork gallery"] button[data-depth]')];
      return { count:cards.length, active:cards.findIndex(c=>c.getAttribute('aria-current')==='true'),
        cards:cards.map(c=>{const r=c.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,depth:Number(c.dataset.depth),visible:getComputedStyle(c).display!=='none',transform:getComputedStyle(c).transform}}),
        scrollWidth:document.documentElement.scrollWidth };
    })()`);
    assert.ok(positions.count >= 2, "Fixture needs multiple artwork cards");
    assert.equal(positions.scrollWidth <= width + 1, true, `${name}: no horizontal overflow`);
    const front = positions.cards[positions.active];
    assert.ok(Math.abs((front.left + front.right) / 2 - width / 2) < width * .1, `${name}: active card centered`);
    assert.ok(positions.cards.some((card) => card.depth === 1 && card.visible && card.left < front.left), `${name}: left card peeks out`);
    assert.ok(positions.cards.some((card) => card.depth === 1 && card.visible && card.right > front.right), `${name}: right card peeks out`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, "base64"));
    await evaluate(`document.querySelector('[aria-label="Next project image"]').click()`);
    await waitFor(`document.querySelector('[aria-label="Project artwork gallery"] button[aria-current="true"]') !== null`);
    const next = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Project artwork gallery"] button[data-depth]')).findIndex(c=>c.getAttribute('aria-current')==='true')`);
    assert.equal(next, (positions.active + 1) % positions.count, `${name}: next control rotates the stack`);
    await evaluate(`(() => { const card=document.querySelector('[aria-label="Project artwork gallery"] button[aria-current="true"]');card.focus();card.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})); })()`);
    const returned = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Project artwork gallery"] button[data-depth]')).findIndex(c=>c.getAttribute('aria-current')==='true')`);
    assert.equal(returned, positions.active, `${name}: keyboard arrows rotate the stack`);
    if(name==='mobile') {
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      const scroll=await evaluate('scrollY');
      const touch=await evaluate(`(()=>{const r=document.querySelector('[aria-label="Project artwork gallery"] [aria-current="true"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:0}]});
      for(let step=1;step<=8;step++) {
        await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x,y:touch.y-step*15,id:0}]});
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await waitFor(`scrollY > ${scroll + 20}`);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Project artwork gallery"] button[data-depth]')).findIndex(c=>c.getAttribute('aria-current')==='true')`),returned,'Vertical swipe preserves the selected artwork');
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
      console.log('Mobile vertical scrolling remains native');
    }
    console.log(`${name}: ${positions.count} artwork cards, centered fan and navigation passed`);
  }
  for (const [width,height,name] of [[1440,900,'desktop'],[768,1024,'tablet'],[390,844,'mobile'],[320,568,'small-phone'],[844,390,'landscape']]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Emulation.setTouchEmulationEnabled',{enabled:width<600,maxTouchPoints:1});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:name==='desktop'?'no-preference':'reduce'}]});
    await send('Page.navigate',{url:'http://localhost:3000/work'});
    await waitFor(`document.readyState==='complete' && !!document.querySelector('[data-project-poster="dacoit"]')`);
    await evaluate('document.fonts.ready.then(()=>true)');
    await evaluate(`document.querySelector('[data-project-poster="dacoit"]').scrollIntoView({block:'center',behavior:'instant'})`);
    await new Promise(resolve=>setTimeout(resolve,800));
    const point=await evaluate(`(()=>{const r=document.querySelector('[data-project-poster="dacoit"] [data-poster-frame]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    if(name==='desktop') {
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
      await new Promise(resolve=>setTimeout(resolve,800));
      const hover=await evaluate(`(()=>{const c=document.querySelector('[data-project-poster="dacoit"]'),t=c.querySelector('[data-poster-frame]').firstElementChild;return {transform:getComputedStyle(t).transform,hover:c.matches(':hover'),fine:matchMedia('(hover:hover) and (pointer:fine)').matches}})()`);
      assert.ok(hover.transform.startsWith('matrix3d(-1')||hover.transform.startsWith('matrix(-1'),'Hover flips the poster: '+JSON.stringify(hover));
      const shot=await send('Page.captureScreenshot',{format:'png'});
      await writeFile(path.join(output,'poster-back.png'),Buffer.from(shot.data,'base64'));
    }
    if(width<600) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    }
    await waitFor(`!!document.querySelector('dialog[data-project-gallery][open]')`);
    await new Promise(resolve=>setTimeout(resolve,800));
    assert.equal(await evaluate('location.pathname'),'/work','Click opens the gallery without navigating away');
    assert.equal(await evaluate('document.documentElement.style.overflow'),'hidden','Background scrolling is locked');
    const bounds=await evaluate(`(()=>{const d=document.querySelector('dialog[data-project-gallery]'),c=d.querySelector('[aria-current="true"]'),r=c.getBoundingClientRect(),close=d.querySelector('[aria-label="Close project gallery"]').getBoundingClientRect();return {center:r.left+r.width/2,count:d.querySelectorAll('[data-depth]').length,closeTop:close.top,closeBottom:close.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
    assert.ok(Math.abs(bounds.center-width/2)<3,name+': selected poster is centered');
    assert.ok(bounds.count>1,name+': project artwork appears as a stack');
    assert.ok(bounds.closeTop>=0&&bounds.closeBottom<=height,name+': close button stays reachable');
    assert.equal(bounds.overflow,false,name+': no page overflow');
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(path.join(output,'poster-gallery-'+name+'.png'),Buffer.from(shot.data,'base64'));
    await evaluate(`document.querySelector('dialog [data-depth="1"]').click()`);
    await waitFor(`document.querySelector('dialog [aria-current="true"]').getAttribute('aria-label').includes('(2 of')`);
    await evaluate(`(()=>{const c=document.querySelector('dialog [aria-current="true"]');c.focus();c.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))})()`);
    assert.ok(await evaluate(`document.querySelector('dialog [aria-current="true"]').getAttribute('aria-label').includes('(1 of')`),'Arrow key returns cover to center');
    await waitFor(`document.activeElement===document.querySelector('dialog [aria-current="true"]')`);
    assert.equal(await evaluate(`document.querySelectorAll('dialog [data-depth][tabindex="0"]').length`),1,'Only the active card is tabbable');
    if(name==='desktop'||name==='mobile') {
      await new Promise(resolve=>setTimeout(resolve,600));
      const swipe=await evaluate(`(()=>{const r=document.querySelector('dialog [aria-current="true"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      if(name==='mobile') await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...swipe,id:0}]});
      else await send('Input.dispatchMouseEvent',{type:'mousePressed',...swipe,button:'left',clickCount:1});
      for(let step=1;step<=8;step++) {
        const position={x:swipe.x-step*12,y:swipe.y};
        if(name==='mobile') await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...position,id:0}]});
        else await send('Input.dispatchMouseEvent',{type:'mouseMoved',...position,button:'left',buttons:1});
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      if(name==='mobile') await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:swipe.x-96,y:swipe.y,button:'left',clickCount:1});
      await waitFor(`document.querySelector('dialog [aria-current="true"]').getAttribute('aria-label').includes('(2 of')`);
      assert.equal(await evaluate(`!!document.querySelector('dialog [data-dragging]')`),false,'Drag releases cleanly');
      assert.ok(await evaluate(`!!document.querySelector('dialog[open]')`),'Swipe release does not close the gallery');
      console.log(name+': horizontal swipe/drag and click suppression passed');
    }
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor(`!document.querySelector('dialog[data-project-gallery]')`);
    assert.equal(await evaluate('document.activeElement?.dataset.projectPoster'),'dacoit','Closing restores poster focus');
    assert.notEqual(await evaluate('document.documentElement.style.overflow'),'hidden','Scroll lock is released');
    console.log(name+': poster opens centered stack, selection, keyboard, Escape and focus passed');
  }
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  // Exercise the real preview capture listener and its independent edit overlays.
  await evaluate(`(()=>{window.previewEvents=[];window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.source==='dds-site')window.previewEvents.push(e.data)});const f=document.createElement('iframe');f.id='poster-preview';f.src='/work?portal-preview';f.style='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647';document.body.append(f)})()`);
  await waitFor(`!!document.querySelector('#poster-preview').contentDocument.querySelector('[data-project-poster="dacoit"]')`);
  await waitFor(`window.previewEvents.some(e=>e.type==='ready')`);
  await evaluate(`(()=>{const f=document.querySelector('#poster-preview');f.contentDocument.querySelector('[data-project-poster="dacoit"]').scrollIntoView({block:'center',behavior:'instant'});f.contentWindow.postMessage({source:'dds-portal',type:'edit-mode',on:true},location.origin)})()`);
  await waitFor(`!!Array.from(document.querySelector('#poster-preview').contentDocument.querySelectorAll('button[aria-label]')).find(b=>b.getAttribute('aria-label').toLowerCase()==='edit dacoit')`);
  await evaluate(`Array.from(document.querySelector('#poster-preview').contentDocument.querySelectorAll('button[aria-label]')).find(b=>b.getAttribute('aria-label').toLowerCase()==='edit dacoit').click()`);
  await waitFor(`window.previewEvents.some(e=>e.type==='edit-open')`);
  assert.equal(await evaluate(`!!document.querySelector('#poster-preview').contentDocument.querySelector('dialog[data-project-gallery]')`),false,'Edit does not open the artwork gallery');
  await evaluate(`document.querySelector('#poster-preview').contentDocument.querySelector('[data-project-poster="dacoit"]').click()`);
  await waitFor(`!!document.querySelector('#poster-preview').contentDocument.querySelector('dialog[data-project-gallery][open]')`);
  assert.equal(await evaluate(`document.querySelector('#poster-preview').contentWindow.location.pathname`),'/work','Preview capture does not navigate instead of opening the stack');
  console.log('Portal edit button and ordinary poster click remain independent');
  assert.deepEqual(errors, [], "No browser runtime errors");
} catch (error) {
  console.error(await evaluate(`JSON.stringify({url:location.href,width:innerWidth,height:innerHeight,preview:window.previewEvents?.map(e=>e.type),edit:document.querySelector('#poster-preview')?.contentDocument.documentElement.dataset.ddsEdit,buttons:document.querySelector('#poster-preview')?Array.from(document.querySelector('#poster-preview').contentDocument.querySelectorAll('[data-ed-ui] button')).map(b=>b.getAttribute('aria-label')):[]})`));
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile(path.join(output,'failure.png'),Buffer.from(shot.data,'base64'));
  throw error;
} finally {
  socket.close();
}

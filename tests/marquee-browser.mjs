// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Optional DDS_QA_USERNAME / DDS_QA_PASSWORD enable portal checks. No content is saved.
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
const inside = (code) => evaluate(`(() => {const w=document.querySelector('iframe').contentWindow;const d=w.document;return (${code});})()`);
try {
  await viewport(1440,1000);
  await send("Page.navigate",{url:"http://127.0.0.1:3000/portal"});
  await waitFor("document.readyState==='complete'");
  const credentials = JSON.stringify({username:process.env.DDS_QA_USERNAME,password:process.env.DDS_QA_PASSWORD});
  assert.equal(await evaluate(`fetch('/api/portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.ok)`),true);
  await send("Page.navigate",{url:"http://127.0.0.1:3000/portal"});
  await waitFor(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-ed-item="clients.0"]')`);
  await pause(1500);
  await waitFor(`(()=>{const w=document.querySelector('iframe').contentWindow;const d=w.document;return !d.querySelector('.intro-curtain')&&w.getComputedStyle(d.querySelector('main')).opacity==='1';})()`);
  const row = (list) => inside(`(()=>{const row=d.querySelector('[data-marquee="${list}"]'),r=row.getBoundingClientRect(),f=document.querySelector('iframe').getBoundingClientRect();let point;for(const y of [r.bottom-8,r.top+8,r.top+r.height/2]){for(const part of [.7,.5,.3,.9]){const x=r.left+r.width*part,hit=d.elementFromPoint(x,y);if(hit&&row.contains(hit)&&!hit.closest('[data-ed-ui]')){point={x:f.x+x,y:f.y+y};break;}}if(point)break;}return {...point,offset:new w.DOMMatrixReadOnly(w.getComputedStyle(row.firstElementChild).transform).m41,min:Math.min(0,row.clientWidth-row.firstElementChild.scrollWidth),drag:row.dataset.drag,width:row.clientWidth,screen:w.innerWidth,scroll:w.scrollY};})()`);
  const key = (value) => send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:{Home:36,End:35,ArrowRight:39,ArrowLeft:37}[value]});
  const drag = async (list, dx, touch=false, dy=0) => {
    const point=await row(list);
    if(touch) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
      for(let i=1;i<=10;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+dx*i/10,y:point.y+dy*i/10,id:1}]});await pause(20);}
      await pause(130);
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
      for(let i=1;i<=10;i++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*i/10,y:point.y,buttons:1});await pause(20);}
      await pause(130);
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y,button:'left',clickCount:1});
    }
    await pause(350);
    return row(list);
  };

  for(const width of [1440,390]) {
    await viewport(width,1000);
    await send('Emulation.setTouchEmulationEnabled',{enabled:width===390,maxTouchPoints:1});
    for(const list of ['clients','collaborators']) {
      await inside(`(d.querySelector('[data-marquee="${list}"]').scrollIntoView({block:'center',behavior:'instant'}),d.querySelector('[data-marquee="${list}"]').focus({preventScroll:true}),true)`);
      await key('Home'); await pause(400);
      const before=await row(list);
      assert.ok(before.width<=before.screen,'Row extends beyond viewport');
      const moved=await drag(list,-200,width===390);
      if (!(moved.offset<before.offset-150)) console.log({before,moved,hit:await inside(`(()=>{const r=d.querySelector('[data-marquee="${list}"]').getBoundingClientRect();return d.elementFromPoint(r.width*.7,r.bottom-12)?.outerHTML.slice(0,500);})()`)});
      assert.ok(moved.offset<before.offset-150,`${list} did not drag at ${width}px`);
      const reversed=await drag(list,100,width===390);
      assert.ok(reversed.offset>moved.offset+60,'Reverse dragging failed');
      assert.equal(reversed.drag,undefined,'Drag state remained active');
      await pause(400);
      assert.ok(Math.abs((await row(list)).offset-reversed.offset)<1,'Editor row moved while idle');
      assert.equal(await evaluate(`!!document.querySelector('[role="dialog"][aria-modal="true"]')`),false,'Scroll opened an editor');
      await inside(`(d.querySelector('[data-marquee="${list}"]').focus({preventScroll:true}),true)`);
      await key('End');await pause(250);
      const end=await row(list);assert.ok(Math.abs(end.offset-end.min)<1,'End boundary failed');
      await key('Home');await pause(250);assert.ok(Math.abs((await row(list)).offset)<1,'Home boundary failed');
      if(width===390) {
        const verticalBefore=await row(list);
        const verticalAfter=await drag(list,0,true,-130);
        assert.ok(Math.abs(verticalAfter.offset-verticalBefore.offset)<1,'Vertical swipe moved row sideways');
        assert.ok(verticalAfter.scroll>verticalBefore.scroll+30,'Vertical touch scrolling was blocked');
      }
      await screenshot(`marquee-${list}-${width}`);
    }
    console.log(`${width}px: both rows drag, reverse, stop, respect boundaries, and preserve navigation`);
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await inside(`(d.querySelector('[data-marquee="clients"]').scrollIntoView({block:'center',behavior:'instant'}),true)`);
  assert.ok((await drag('clients',-180,true)).offset < -100,'Reduced-motion dragging failed');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await inside(`(d.querySelector('[data-marquee="clients"]').focus(),true)`);await key('Home');await pause(300);
  const editLabel=await inside(`'Edit '+d.querySelector('[data-ed-item="clients.0"]').dataset.edLabel`);
  await inside(`(Array.from(d.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(editLabel)}).click(),true)`);
  await waitFor(`!!document.querySelector('[role="dialog"][aria-modal="true"]')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cancel')?.click()`);
  await viewport(1440,1000);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Edit controls on')).click()`);
  await waitFor(`!document.querySelector('iframe').contentDocument.documentElement.hasAttribute('data-dds-edit')`);
  await inside(`(d.querySelector('[data-marquee="clients"]').scrollIntoView({block:'center',behavior:'instant'}),true)`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:8,y:8});
  await pause(500);
  const drifting=await row('clients');await pause(600);
  assert.ok(Math.abs((await row('clients')).offset-drifting.offset)>1,'Preview-only drift did not resume');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await pause(250);
  const still=await row('clients');await pause(400);
  assert.ok(Math.abs((await row('clients')).offset-still.offset)<1,'Reduced-motion preview kept drifting');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Preview only').click()`);
  assert.deepEqual(errors,[],'Browser runtime errors');
  console.log('Touch vertical scrolling, reduced motion, preview-only drift, and Edit after dragging passed. Nothing published.');
} finally {socket.close();}

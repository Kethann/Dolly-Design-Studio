// Local visual smoke check. Start an isolated headless Chromium with --remote-debugging-port=9227.
// Optional DDS_QA_USERNAME / DDS_QA_PASSWORD enable portal checks. No content is saved.
import { writeFile, mkdir, unlink } from "node:fs/promises";
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
  else if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") errors.push(event.params.args.map(arg=>arg.value ?? arg.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  if (process.env.DDS_QA_TRACE && ["Page.navigate", "Page.enable", "Runtime.enable", "Page.bringToFront"].includes(method)) console.log(method);
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timed out: ${method}`)); }, 45_000);
  pending.set(next, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
  socket.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
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
const uploaded=[];
const editorOnly=process.argv.includes('--editor-only');
const button = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
try {
  assert.ok(process.env.DDS_QA_USERNAME && process.env.DDS_QA_PASSWORD);
  await viewport(1440,1000);
  await send('Page.navigate',{url:'http://127.0.0.1:3000/portal'});
  await waitFor("document.readyState==='complete'");
  const credentials=JSON.stringify({username:process.env.DDS_QA_USERNAME,password:process.env.DDS_QA_PASSWORD});
  assert.equal(await evaluate(`fetch('/api/portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.ok)`),true);
  await send('Page.navigate',{url:'http://127.0.0.1:3000/portal'});
  await waitFor(`!!document.querySelector('[aria-label="Portal tools"]')`);
  await evaluate(`(()=>{window.__qaUploaded=[];const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...rest){if(url==='/api/portal/videos')this.addEventListener('load',()=>{try{const d=JSON.parse(this.responseText);if(d.src)window.__qaUploaded.push(d.src)}catch{}});return open.call(this,method,url,...rest)}})()`);
  // Tiny original clips generated locally: no third-party assets or saved content edits.
  await evaluate(`(async()=>{window.__qaClips=[];for(const [width,height] of [[320,180],[180,320]]){const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.fillStyle='#512238';g.fillRect(0,0,width,height);const stream=c.captureStream(12);const recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1.42E01E',videoBitsPerSecond:180000});const chunks=[];const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;recorder.onerror=reject});recorder.start();let frame=0;const timer=setInterval(()=>{g.fillStyle=frame++%2?'#512238':'#806328';g.fillRect(0,0,width,height);g.fillStyle='white';g.font='20px sans-serif';g.fillText('BTS test clip',10,50)},80);await new Promise(r=>setTimeout(r,1500));recorder.stop();await finished;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());window.__qaClips.push(new File(chunks,'bts-'+width+'.mp4',{type:'video/mp4'}));c.width=c.height=0;}return window.__qaClips.map(f=>f.size);})()`);
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Choose a page to edit"]');s.value='step';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!!document.querySelector('select[aria-label="Which card"]')`);
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Which card"]');s.value=Array.from(s.options).find(o=>/Photoshoot|BTS/i.test(o.text)).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!!document.querySelector('iframe')?.contentDocument?.querySelector('h1')?.textContent.includes('BTS')`);
  await pause(1000);
  for(let i=0;i<(editorOnly?1:2);i++) {
    await inside(`(Array.from(d.querySelectorAll('button')).find(b=>b.textContent.includes('Add a card')).click(),true)`);
    await waitFor(`!!document.querySelector('[aria-label="Card media type"]')`);
    await button('Video');
    await waitFor(`!!document.querySelector('input[accept*=".mkv"]')`);
    await evaluate(`(()=>{const t=new DataTransfer();t.items.add(window.__qaClips[${i}]);const input=document.querySelector('input[accept*=".mkv"]');input.files=t.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`window.__qaUploaded.length===${i+1} && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Replace video')`);
    uploaded.push(...(await evaluate('window.__qaUploaded')).filter(u=>!uploaded.includes(u)));
    await evaluate(`(()=>{for(const [label,value] of [['Title','BTS ${i===0?'landscape':'portrait'}'],['Small text under it','A longer caption that must wrap below the video without covering the playback controls.']]){const el=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await screenshot('video-editor-'+i);
    if(editorOnly) {
      await viewport(390,1000);await pause(400);
      const actions=await evaluate(`Array.from(document.querySelectorAll('[class*="mediaActions"] button')).map(b=>({width:b.clientWidth,scroll:b.scrollWidth,height:b.getBoundingClientRect().height,right:b.getBoundingClientRect().right,screen:innerWidth}))`);
      assert.ok(actions.length>=4&&actions.every(b=>b.height>=44&&b.scroll<=b.width+2&&b.right<=b.screen),'Media buttons must stay readable and fit on a phone');
      await screenshot('video-editor-390');
    }
    await button('Keep changes');
    await waitFor(`!document.querySelector('[aria-label="Card media type"]')`);
  }
  if (!editorOnly) {
  await waitFor(`document.querySelector('iframe').contentDocument.querySelectorAll('[data-video-player]').length===2`);
  assert.equal(await inside(`d.querySelectorAll('video').length`),0,'No video should preload before Play');
  for(const width of [1440,768,390]) {
    await viewport(width,1000);await pause(400);
    const boxes=await inside(`Array.from(d.querySelectorAll('[data-media="video"]')).map(el=>{const p=el.querySelector('[data-video-player]'),r=p.getBoundingClientRect(),text=el.lastElementChild.lastElementChild.getBoundingClientRect();return {left:r.left,right:r.right,width:w.innerWidth,captionTop:text.top,bottom:r.bottom,ratio:w.getComputedStyle(p).aspectRatio,overflow:d.documentElement.scrollWidth>w.innerWidth+1}})`);
    assert.ok(boxes.every(b=>b.left>=0&&b.right<=b.width+1&&!b.overflow&&b.captionTop>=b.bottom),'Video or caption overflows');
    assert.ok(boxes[0].ratio.startsWith('1.777')&&boxes[1].ratio.startsWith('0.5625'));
    await inside(`(d.querySelector('[data-media="video"]').scrollIntoView({block:'start',behavior:'instant'}),true)`);
    await screenshot('video-cards-'+width);
  }
  await viewport(1440,1000);await pause(400);
  await inside(`(d.querySelector('[data-media="video"]').scrollIntoView({block:'center',behavior:'instant'}),d.querySelector('[data-video-player] button').click(),true)`);
  await waitFor(`(()=>{const v=document.querySelector('iframe').contentDocument.querySelector('video');return v&&v.videoWidth===320&&v.currentTime>0;})()`);
  await screenshot('video-playing');
  await inside(`(d.querySelectorAll('[data-video-player]')[1].querySelector('button').click(),true)`);
  await waitFor(`(()=>{const v=document.querySelector('iframe').contentDocument.querySelectorAll('video');return v.length===1&&v[0].videoHeight===320;})()`);
  await inside(`(()=>{const spacer=d.createElement('div');spacer.style.height='200vh';d.body.append(spacer);w.scrollTo({top:d.documentElement.scrollHeight,behavior:'instant'});return true;})()`);
  await waitFor(`document.querySelector('iframe').contentDocument.querySelectorAll('video').length===0`);
  await inside(`(d.querySelector('[data-media="video"]').scrollIntoView({block:'center',behavior:'instant'}),d.querySelector('[data-video-player] button').click(),true)`);
  await waitFor(`!!document.querySelector('iframe').contentDocument.querySelector('video')`);
  await inside(`(()=>{const v=d.querySelector('video');v.src='data:video/x-matroska;base64,AA==';v.load();return true;})()`);
  await waitFor(`document.querySelector('iframe').contentDocument.body.textContent.includes('cannot play in this browser')`);
  assert.equal(await inside(`!!d.querySelector('[data-video-player] a[download]')`),true);
  const response=await fetch('http://127.0.0.1:3000'+uploaded[0],{headers:{Range:'bytes=0-31'}});
  assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,32);
  assert.deepEqual(errors,[]);
  console.log('PASS: MP4 uploads, natural landscape/portrait cards, captions, responsive layouts, playback, one active player, off-screen release and range streaming.');
  } else console.log('PASS: phone editor media controls fit, wrap, and meet the 44px touch target.');
} finally {
  const seen=await evaluate('window.__qaUploaded||[]').catch(()=>[]);
  for(const src of new Set([...uploaded,...seen])) {
    if(/^\/media\/videos\/[a-z0-9-]+\.mp4$/.test(src)) await unlink(path.join(process.cwd(),'.media','videos',src.split('/').at(-1))).catch(()=>{});
  }
  // Leave no unsaved QA cards in the editor and never publish them.
  await send('Page.navigate',{url:'http://127.0.0.1:3000/portal'}).catch(()=>{});
  socket.close();
}

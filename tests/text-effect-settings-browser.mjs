// Local unsaved-draft QA. Requires DDS_QA_USERNAME/PASSWORD and Chromium CDP on port 9227.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const base = process.env.DDS_QA_URL ?? 'http://localhost:3000';
assert.ok(/^http:\/\/localhost:\d+$/.test(base), 'Only test a local portal');
assert.ok(process.env.DDS_QA_USERNAME && process.env.DDS_QA_PASSWORD);
const target = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', {method:'PUT'})).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => { socket.onopen = resolve; });
let id = 0;
const pending = new Map(), errors = [];
socket.onmessage = ({data}) => {
  const event = JSON.parse(data);
  if (event.id) { const job=pending.get(event.id);pending.delete(event.id);if(event.error)job.reject(new Error(event.error.message));else job.resolve(event.result); }
  else if(event.method==='Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
  else if(event.method==='Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog',{accept:true});
};
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const next=++id,timer=setTimeout(()=>reject(new Error('Timeout: '+method)),45000);
  pending.set(next,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  socket.send(JSON.stringify({id:next,method,params}));
});
const evaluate=async expression=>{
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result.value;
};
const wait=async expression=>{for(let n=0;n<180;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw new Error('Not ready: '+expression);};
const group='[aria-label="Text effects for Number"]';
const frame=`document.querySelector('iframe').contentDocument`;
const valueSelector='[data-ed-item="home.stats.0"] [data-t="home.stats.value"]';
const field=(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(group)}).querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const choose=effect=>evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('[data-effect-value="${effect}"]').click()`);
try {
  await send('Page.enable');await send('Runtime.enable');
  // Keep the original-number snapshot stable instead of sampling mid count-up.
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/portal'});
  await wait(`location.origin===${JSON.stringify(base)} && document.readyState==='complete'`);
  const credentials=JSON.stringify({username:process.env.DDS_QA_USERNAME,password:process.env.DDS_QA_PASSWORD});
  assert.equal(await evaluate(`fetch('/api/portal/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${credentials})}).then(r=>r.ok)`),true,'Local sign-in');
  await send('Page.navigate',{url:base+'/portal'});
  await wait(`!!document.querySelector('[aria-label="Portal tools"]')`);
  await wait(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[aria-label="Edit Number"]')`);
  await evaluate(`${frame}.querySelector('[data-ed-item="home.stats.0"]').scrollIntoView()`);
  await evaluate(`${frame}.querySelector('[aria-label="Edit Number"]').click()`);
  await wait(`!!document.querySelector(${JSON.stringify(group)})`);
  const original=await evaluate(`${frame}.querySelector(${JSON.stringify(valueSelector)}).textContent`);
  await choose('glow');
  await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('details').open=true`);
  await field('[aria-label="Text colour"]','#12abcd');
  await field('[aria-label="Glow colour"]','#ef3456');
  await field('input[type="range"][max="100"]','45');
  await field('input[type="range"][max="32"]','18');
  await evaluate(`Array.from(document.querySelector(${JSON.stringify(group)}).querySelectorAll('button')).find(b=>b.textContent==='Always').click()`);
  await wait(`${frame}.querySelector(${JSON.stringify(valueSelector+' [data-text-effect="glow"]')})?.style.color==='rgb(18, 171, 205)'`);
  await wait(`${frame}.querySelector(${JSON.stringify(valueSelector+' [data-text-effect="glow"]')})?.dataset.fxTrigger==='always'`);
  const rendered=await evaluate(`(()=>{const el=${frame}.querySelector(${JSON.stringify(valueSelector+' [data-text-effect="glow"]')});const s=el.ownerDocument.defaultView.getComputedStyle(el);return {color:s.color,shadow:s.textShadow,opacity:el.style.getPropertyValue('--fx-glow-opacity'),radius:el.style.getPropertyValue('--fx-glow-radius'),mode:el.dataset.fxTrigger};})()`);
  assert.equal(rendered.opacity,'45%');assert.equal(rendered.radius,'18px');assert.equal(rendered.mode,'always');assert.notEqual(rendered.shadow,'none');
  assert.equal(await evaluate(`!!${frame}.querySelector('[data-ed-item="home.stats.1"] [style*="--fx-glow"]')`),false,'Settings leaked to another card');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).parentElement.querySelector('input[aria-label="Number"]').value.includes('glow;')`),false,'Internal settings leaked into text');
  await choose('outline');await choose('glow');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('[aria-label="Text colour"]').value`),'#12abcd');
  console.log('Number preview colour, glow, and field independence passed.');
  for(const width of [1440,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector(${JSON.stringify(group)}).scrollIntoView({block:'center'})`);
    const bounds=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(group)}),r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};})()`);
    assert.ok(bounds.left>=0&&bounds.right<=width+1&&!bounds.overflow,`Settings overflow at ${width}`);
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),`dds-glow-settings-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await evaluate(`Array.from(document.querySelector(${JSON.stringify(group)}).querySelectorAll('button')).find(b=>b.textContent==='Reset colour & glow').click()`);
  await wait(`!${frame}.querySelector(${JSON.stringify(valueSelector+' [data-text-effect="glow"]')})?.getAttribute('style')`);
  console.log('Responsive controls and reset passed.');
  await choose('particles');
  await field('[aria-label="Dot colour"]','#00aaee');
  await field('input[type="range"][max="1.6"]','1.3');
  await field('input[type="range"][max="8"]','6');
  await field('input[type="range"][max="2"]','1.5');
  await field('input[type="range"][max="1"]','0.75');
  await evaluate(`Array.from(document.querySelector(${JSON.stringify(group)}).querySelectorAll('button')).find(b=>b.textContent==='Nano').click()`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('[aria-label="Dot colour"]').value`),'#00aaee','Preset keeps chosen dot colour');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('input[type="range"][max="1.6"]').value`),'0.7');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('input[type="range"][max="8"]').value`),'2');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate(`${frame}.querySelector(${JSON.stringify(valueSelector)}).scrollIntoView({block:'center'})`);
  await wait(`${frame}.querySelector(${JSON.stringify(valueSelector+' canvas')})?.width>0`);
  const particles=await evaluate(`(()=>{const cv=${frame}.querySelector(${JSON.stringify(valueSelector+' canvas')}),ctx=cv.getContext('2d'),rgba=ctx.getImageData(0,0,cv.width,cv.height).data;let blue=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>20&&rgba[i+2]>rgba[i]+70&&rgba[i+1]>rgba[i]+40)blue++;return {blue,pixels:cv.width*cv.height};})()`);
  assert.ok(particles.blue>0,'Actual particle cores use the selected blue, not a hardcoded white');
  assert.ok(particles.pixels<=2000000,'Canvas budget remains bounded');
  for(const width of [1440,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector(${JSON.stringify(group)}).scrollIntoView({block:'center'})`);
    const bounds=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(group)}),r=el.getBoundingClientRect();return {left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth+1};})()`);
    assert.ok(bounds.left>=0&&bounds.right<=width+1&&!bounds.overflow,`Particle settings overflow at ${width}`);
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),`dds-particle-settings-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await wait(`${frame}.querySelector(${JSON.stringify(valueSelector+' canvas')})?.width===0`);
  await evaluate(`Array.from(document.querySelector(${JSON.stringify(group)}).querySelectorAll('button')).find(b=>b.textContent==='Reset colour & dots').click()`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(group)}).querySelector('input[type="range"][max="8"]').value`),'4');
  console.log('Particle presets, actual dot colour, bounded canvas, responsive settings and reduced motion passed.');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cancel').click()`);
  await wait(`!document.querySelector(${JSON.stringify(group)})`);
  await wait(`${frame}.querySelector(${JSON.stringify(valueSelector)}).textContent===${JSON.stringify(original)}`);
  assert.deepEqual(errors,[]);
  console.log('Number colour, glow settings, independent cards, reset, Cancel and responsive controls passed. Nothing saved or published.');
} finally {
  if (process.env.DDS_QA_CLOSE === '1') await send('Browser.close');
  socket.close();
  if (process.env.DDS_QA_CLOSE !== '1') await fetch(`http://127.0.0.1:9227/json/close/${target.id}`);
}

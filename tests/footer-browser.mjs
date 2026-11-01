// Isolated local Chromium :9227; no portal content is saved.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const tabs=await(await fetch('http://127.0.0.1:9227/json/list')).json();
const target=tabs.find(t=>t.type==='page'&&/^(about:blank|http:\/\/(localhost|127\.0\.0\.1):3000)/.test(t.url));
assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const jobs=new Map(),errors=[];
socket.onmessage=({data})=>{const e=JSON.parse(data);if(e.id){const j=jobs.get(e.id);jobs.delete(e.id);if(e.error)j?.reject(new Error(e.error.message));else j?.resolve(e.result);}if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{jobs.delete(id);reject(new Error(method+' timed out'));},30000);jobs.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url:'http://localhost:3000/work?footer-qa'});
  let ready=false;for(let i=0;i<120;i++){if(await evaluate(`!!document.querySelector('[data-creator-credit]')&&!document.querySelector('.intro-curtain')`)){ready=true;break;}await wait(250);}assert.ok(ready);
  await evaluate('document.fonts.ready.then(()=>true)');
  for(const width of [280,390,720,820,1440,2560]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'})`);await wait(250);
    const metrics=await evaluate(`(()=>{const f=document.querySelector('footer'),c=f.querySelector('[data-creator-credit]'),s=f.querySelector('[data-ed-section]'),a=c.getBoundingClientRect(),b=s.getBoundingClientRect();return {name:c.textContent,editable:!!c.closest('[data-ed-section],[data-ed-item],[data-t]'),studio:s.dataset.edSection,fit:a.left>=0&&a.right<=innerWidth&&b.left>=0&&b.right<=innerWidth,noOverlap:innerWidth<=720?a.top>=b.bottom:a.left>=b.right,overflow:document.documentElement.scrollWidth>innerWidth,colour:getComputedStyle(c).color}})()`);
    assert.match(metrics.name,/Kethan/);assert.equal(metrics.editable,false);assert.equal(metrics.studio,'site:menu');assert.ok(metrics.fit);assert.ok(metrics.noOverlap);assert.equal(metrics.overflow,false);
    assert.equal(metrics.colour,'rgb(214, 198, 182)');
    if(width===390||width===1440){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),`dds-footer-${width}.png`),Buffer.from(shot.data,'base64'));}
    console.log(width+': credit alignment, independent edit scope and no overflow passed');
  }
  await evaluate(`document.querySelector('footer [data-ed-section]').textContent='A VERY LONG STUDIO NAME '.repeat(20);document.documentElement.style.setProperty('--ivory','#ff00ff')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-creator-credit]')).color`),'rgb(214, 198, 182)');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  assert.deepEqual(errors,[]);
}finally{socket.close();}

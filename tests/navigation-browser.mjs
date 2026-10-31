// Local-only responsive navigation and intro timing checks, using an isolated Chromium :9227.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const tabs = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const tab = tabs.find(t => t.type === 'page' && /^(about:blank|http:\/\/(localhost|127\.0\.0\.1):3000)/.test(t.url));
assert.ok(tab, 'Use an isolated local browser');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
let introScript;
const jobs = new Map(), errors = [];
ws.onmessage = ({ data }) => {
  const e = JSON.parse(data);
  if (e.id) { const job = jobs.get(e.id); jobs.delete(e.id); if (e.error) job?.reject(new Error(e.error.message)); else job?.resolve(e.result); }
  if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { jobs.delete(id); reject(new Error(method + ' timeout')); },45000);
    jobs.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description ?? 'Evaluation failed');
  return r.result.value;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression) {
  for(let i=0;i<150;i++){if(await evaluate(expression))return;await wait(200);}
  throw new Error('Timed out: '+expression);
}
async function click(selector) {
  const point=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
const output=path.join(os.tmpdir(),'dds-navigation-qa');
await mkdir(output,{recursive:true});
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  if(!process.argv.includes('--intro-only'))for(const [width,height,name] of [[820,1180,'tablet-portrait'],[1024,768,'tablet-landscape'],[1180,600,'tablet-short'],[1440,900,'desktop'],[1920,1080,'desktop-wide']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://localhost:3000/?navigation-check#clients'});
    await until(`!!document.querySelector('header button[aria-label="Open menu"]') && !document.querySelector('.intro-curtain')`);
    await evaluate(`document.querySelector('#clients').scrollIntoView({behavior:'instant'})`); await wait(250);
    await click('header button[aria-label="Open menu"]');
    await until(`document.querySelector('#mobile-navigation')?.getAttribute('aria-label') === 'Section navigation'`);
    assert.equal(await evaluate('document.documentElement.style.overflow'),'','Tablet menu does not lock page scrolling');
    assert.equal(await evaluate('location.hash'),'#clients','Opening hamburger does not navigate');
    assert.ok(await evaluate(`(()=>{const b=document.querySelector('#mobile-navigation').getBoundingClientRect();return b.width<=241&&b.left>innerWidth*.55&&b.right<=innerWidth&&b.bottom<=innerHeight})()`),'Compact right-edge rail fits screen');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('#mobile-navigation a span')).filter(e=>getComputedStyle(e).visibility==='visible').length`),1,'Only active/focused label appears');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('#mobile-navigation a')).every(e=>e.getAttribute('aria-label')&&e.getBoundingClientRect().height>=44)`),'All icons have accessible names and touch targets');
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
    await click('#mobile-navigation a[href="/#services"]');
    await until(`location.hash==='#services' && document.querySelector('#mobile-navigation a[aria-current="page"]')?.getAttribute('href')==='/#services'`);
    assert.equal(await evaluate('document.documentElement.style.overflow'),'');
    await click('#mobile-navigation a[href="/work"]');
    await until(`location.pathname==='/work' && document.querySelector('#mobile-navigation a[aria-current="page"]')?.getAttribute('href')==='/work'`);
    await evaluate('history.back()');
    await until(`location.pathname==='/' && location.hash==='#services'`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(`!document.querySelector('#mobile-navigation')`);
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`),'Open menu');
    await click('header button[aria-label="Open menu"]');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await until(`!!document.querySelector('#mobile-navigation')`);
    assert.equal(await evaluate('document.documentElement.style.overflow'),'','Growing to desktop keeps the non-modal rail usable');
    assert.ok(await evaluate(`document.querySelector('header button[aria-label="Close menu"]').getBoundingClientRect().width>=44`));
    assert.equal(await evaluate(`document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect().width`),0);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(`!document.querySelector('#mobile-navigation')`);
    console.log(name+': rail placement, labels, section links, work route, Back, Escape and resize passed');
  }
  if(!process.argv.includes('--intro-only')){
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://localhost:3000/?navigation-phone#clients'});
    await until(`!!document.querySelector('header button[aria-label="Open menu"]') && !document.querySelector('.intro-curtain')`);
    await click('header button[aria-label="Open menu"]');await until(`!!document.querySelector('#mobile-navigation')`);
    assert.equal(await evaluate('document.documentElement.style.overflow'),'hidden','Phone retains modal scroll lock');
    await click('#mobile-navigation a[href="/#services"]');
    await until(`!document.querySelector('#mobile-navigation') && location.hash==='#services'`);
    assert.equal(await evaluate('document.documentElement.style.overflow'),'');
    console.log('Phone menu and desktop navigation remain functional');
  }
  if(process.argv.includes('--intro') || process.argv.includes('--intro-only')){
    // Measure the actual intro callback (not PMREM warm-up draws or the loader fade).
    // Delay only that callback in the slow case; no saved settings are changed.
    introScript=(await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
      window.__introQA={first:0,end:0};
      const observer=new MutationObserver(()=>{if(window.__introQA.first&&!document.querySelector('[data-intro-scene]')&&!window.__introQA.end)window.__introQA.end=performance.now();});
      observer.observe(document,{subtree:true,childList:true});
      const raf=window.requestAnimationFrame.bind(window), cancel=window.cancelAnimationFrame.bind(window), pending=new Map();let id=-1;
      window.requestAnimationFrame=callback=>{
        const intro=callback.toString().includes('clock.step(');
        if(!intro)return raf(callback);
        const run=now=>{if(!window.__introQA.first)window.__introQA.first=performance.now();callback(now);};
        if(!location.search.includes('slow-intro'))return raf(run);
        const token=id--,timer=setTimeout(()=>{pending.delete(token);run(performance.now());},320);pending.set(token,timer);return token;
      };
      window.cancelAnimationFrame=token=>{if(pending.has(token)){clearTimeout(pending.get(token));pending.delete(token);}else cancel(token);};
    })();`})).identifier;
    for(const [width,height,name] of [[1440,900,'desktop'],[390,844,'phone'],[820,1180,'tablet-slow-intro']]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setTouchEmulationEnabled',{enabled:name!=='desktop',maxTouchPoints:1});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await send('Page.navigate',{url:'http://localhost:3000/?'+name});
      await until('window.__introQA?.end>0');
      const timing=await evaluate('window.__introQA');
      const seconds=(timing.end-timing.first)/1000;
      assert.ok(seconds>7.5&&seconds<9.2,name+' intro visible duration '+seconds.toFixed(2));
      assert.equal(await evaluate('document.documentElement.style.overflow'),'');
      console.log(name+': intro visible duration '+seconds.toFixed(2)+'s');
    }
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  }
  assert.deepEqual(errors,[],'Browser exceptions');
  console.log('Screenshots: '+output);
}finally{if(introScript)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:introScript});ws.close();}

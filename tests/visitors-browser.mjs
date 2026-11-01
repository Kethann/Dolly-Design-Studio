// Isolated local Chromium :9227. Analytics responses are mocked; no visitor data or emails are sent.
import assert from 'node:assert/strict';
const tabs = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const tab = tabs.find(t => t.type === 'page' && /^(about:blank|http:\/\/(localhost|127\.0\.0\.1):3000)/.test(t.url));
assert.ok(tab);
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
let id=0; const jobs=new Map(), errors=[];
socket.onmessage=({data})=>{const e=JSON.parse(data); if(e.id){const job=jobs.get(e.id);jobs.delete(e.id);if(e.error)job?.reject(new Error(e.error.message));else job?.resolve(e.result);}if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{jobs.delete(next);reject(new Error(method+' timeout'));},30000);jobs.set(next,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:next,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description ?? 'Evaluation failed');return r.result.value;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await wait(250);}throw new Error('Timeout: '+expression);}
let script;
try {
  await send('Page.enable'); await send('Runtime.enable');
  script=(await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    try{localStorage.removeItem('dds-visitor-consent-v1')}catch{}
    window.__visitorEvents=[];
    navigator.sendBeacon=(url,blob)=>{if(String(url)==='/api/visits'){void blob.text().then(text=>window.__visitorEvents.push({method:'POST',data:JSON.parse(text)}));return true;}return false;};
    const original=window.fetch.bind(window);
    window.fetch=(url,options={})=>{
      if(String(url)==='/api/visits'){
        if(options.method==='POST'||options.method==='DELETE') window.__visitorEvents.push({method:options.method,data:JSON.parse(options.body)});
        return Promise.resolve(options.method ? new Response(null,{status:204}) : Response.json({enabled:true}));
      }
      return original(url,options);
    };
  })();`})).identifier;
  for(const [width,height] of [[390,844],[820,1180],[1440,900]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await send('Page.navigate',{url:`http://localhost:3000/?visitor-qa=${width}#clients`});
    await until(`!!document.querySelector('aside[aria-label="Optional visitor analytics"]')`);
    assert.equal(await evaluate('window.__visitorEvents.length'),0,'No collection before consent');
    assert.ok(await evaluate(`(()=>{const b=document.querySelector('aside[aria-label="Optional visitor analytics"]').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight})()`),'Consent panel fits device');
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent.includes('Decline')).click()`);
    await until(`!document.querySelector('aside[aria-label="Optional visitor analytics"]')`);
    assert.equal(await evaluate('window.__visitorEvents.length'),0,'Declining does not create a visit');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Visitor privacy settings').click()`);
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='Allow analytics').click()`);
    await until(`window.__visitorEvents.some(e=>e.method==='POST')`);
    assert.equal(await evaluate('window.__visitorEvents[0].data.consent'),true);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Visitor privacy settings').click()`);
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent.includes('Decline')).click()`);
    await until(`window.__visitorEvents.some(e=>e.method==='DELETE')`);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('dds-visitor-consent-v1')).choice`),'deny');
    console.log(width+': notice bounds, opt-in, decline and withdrawal passed');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await send('Page.navigate',{url:'http://localhost:3000/?fade-qa#clients'});
  await until(`document.querySelector('#mobile-navigation')?.dataset.open==='true'`);
  await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent.includes('Decline'))?.click()`);
  await wait(800);
  assert.ok(await evaluate(`(()=>{const active=document.querySelector('#mobile-navigation a[aria-current]'),idle=[...document.querySelectorAll('#mobile-navigation a:not([aria-current]) svg')];return getComputedStyle(active).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(active).boxShadow==='none'&&new Set(idle.map(i=>getComputedStyle(i).color)).size===1&&getComputedStyle(idle[0]).color==='rgb(244, 244, 244)'})()`),'Only the active underline glows; no square and all idle icons are white');
  await evaluate(`window.__railTransitions=[]; document.querySelector('#mobile-navigation').addEventListener('transitionrun',e=>{if(e.target.id==='mobile-navigation')window.__railTransitions.push({property:e.propertyName,inert:e.target.inert,open:e.target.dataset.open})});document.querySelector('header button[aria-label="Close menu"]').click()`);
  await until(`window.__railTransitions.some(e=>e.property==='opacity'&&e.inert&&e.open==='false')`);
  await wait(600);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#mobile-navigation')).visibility`),'hidden');
  await evaluate(`document.querySelector('header button[aria-label="Open menu"]').click()`);
  await until(`window.__railTransitions.some(e=>e.property==='opacity'&&!e.inert&&e.open==='true')`);
  await wait(600);
  assert.deepEqual(errors,[]);
  console.log('Neutral icons, no tile background, fade-in/out and inert hidden controls passed');
} finally { if(script)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script});socket.close(); }

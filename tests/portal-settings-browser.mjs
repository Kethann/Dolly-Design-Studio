// Isolated component QA: uses the real portal components/CSS, no account, API calls or saved-content writes.
// Start a disposable Chromium on CDP port 9227, then run: node tests/portal-settings-browser.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const bundle = await build({
  stdin: { contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {Choice, Slider, Toggle, Dial, Section} from './app/portal/controls';
    import {Spotlight} from './app/portal/Spotlight'; import {Glyph} from './app/portal/mac';
    import styles from './app/portal/portal.module.css';
    const entries=[{label:'Glass title circle',sub:'Artwork, glass tint and projector',keywords:'shadow colour mobile origin',glyph:'slate',tab:'slate'},
      {label:'Visitor analytics',sub:'Consenting visits and approximate location',keywords:'device traffic',glyph:'visitors',tab:'visitors'}];
    function App(){const [value,setValue]=useState('left'),[angle,setAngle]=useState(0),[glow,setGlow]=useState(.5),[on,setOn]=useState(true),[search,setSearch]=useState(false);
      return <main className={styles.shell} style={{padding:16,minHeight:'100vh'}}><div style={{maxWidth:540,margin:'auto'}}>
        <h1>Portal settings</h1><button id="search" onClick={()=>setSearch(true)}>Search settings</button>
        <Section title="Glass title circle" hint="Adjust the artwork, projector and glass without changing other sections.">
          <div style={{display:'flex',gap:20}}>{['slate','visitors','projects'].map(name=><span key={name} style={{width:28,height:28}}><Glyph name={name}/></span>)}</div>
          <Choice label="Projector style" hint="Choose how the light spreads." value={value} onChange={setValue} options={[{value:'left',label:'Cinema projector'},{value:'right',label:'Prismatic fan — reference'},{value:'soft',label:'Soft light fan'}]}/>
          <Slider label="Artwork glow intensity" hint="Changes the illuminated artwork only." min={0} max={1} step={.1} value={glow} format={v=>Math.round(v*100)+'%'} onChange={setGlow}/>
          <Toggle label="Show glass" hint="Keep the rotating glass visible." checked={on} onChange={setOn}/>
          <Dial label="Glass angle" value={angle} onChange={setAngle}/>
        </Section>
        {search&&<Spotlight entries={entries} onPick={entry=>{window.__picked=entry.tab;setSearch(false);}} onClose={()=>setSearch(false)}/>}
      </div></main>;
    } createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, outfile: "fixture.js", loader: { ".css": "local-css" }, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
});
const js = bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents;
const css = bundle.outputFiles.find(file=>file.path.endsWith('.css')).contents;
const server = createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}
  else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}:root{--font-body:Arial,sans-serif}body{margin:0;background:#181318;color:#f4ede1;font-family:Arial,sans-serif}button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}h1{font-size:22px}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const targets = await(await fetch('http://127.0.0.1:9227/json/list')).json();
const target=targets.find(target=>target.type==='page'&&(target.url==='about:blank'||target.url.startsWith('http://127.0.0.1:')));
assert.ok(target,'Use an isolated about:blank test tab');
const socket=new WebSocket(target.webSocketDebuggerUrl), pending=new Map(), errors=[];let id=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=({data})=>{const event=JSON.parse(data);if(event.id){const job=pending.get(event.id);pending.delete(event.id);if(event.error)job.reject(Error(event.error.message));else job.resolve(event.result);}else if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await pause(100);}throw Error(expression);};
const key=async(key,code=key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
try{
  await send('Page.enable');await send('Runtime.enable');
  for(const width of [320,390,820,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await wait(`!!document.querySelector('[role="radio"]')`);
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'controls fit '+width);
    await evaluate(`document.querySelector('[role="radio"]').focus()`);await key('ArrowRight');
    assert.equal(await evaluate(`document.activeElement.textContent`),'Prismatic fan — reference');
    assert.equal(await evaluate(`document.querySelector('[role="radio"][aria-checked="true"]').textContent`),'Prismatic fan — reference');
    await evaluate(`document.querySelector('[role="slider"]').focus()`);await key('ArrowLeft');
    assert.equal(await evaluate(`document.querySelector('[role="slider"]').getAttribute('aria-valuenow')`),'355');
    await evaluate(`document.querySelector('#search').click()`);
    await wait(`document.activeElement.getAttribute('role')==='combobox'`);
    await send('Input.insertText',{text:'shadow color'});
    await wait(`document.querySelectorAll('[role="option"]').length===1`);
    assert.equal(await evaluate(`document.querySelector('[role="option"] strong').textContent`),'Glass title circle');
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('[role="dialog"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()`),'search fits '+width);
    if(width===390){await pause(250);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),'dds-portal-search-390.png'),Buffer.from(shot.data,'base64'));}
    await key('Tab');assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Close settings search');
    await key('Tab');assert.equal(await evaluate(`document.activeElement.getAttribute('role')`),'combobox');
    await key('Enter');await wait(`!document.querySelector('[role="dialog"]')`);
    assert.equal(await evaluate('window.__picked'),'slate');
    if(width===390||width===1440){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),`dds-portal-settings-${width}.png`),Buffer.from(shot.data,'base64'));}
    console.log('PASS portal controls and search:',width);
  }
  assert.deepEqual(errors,[]);console.log('No runtime exceptions. No application data was accessed or changed.');
}finally{socket.close();server.close();}

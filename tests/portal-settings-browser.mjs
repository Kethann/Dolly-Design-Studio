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
    import {ProofTableEditor} from './app/portal/ProofTableEditor';
    const entries=[{label:'Glass title circle',sub:'Artwork, glass tint and projector',keywords:'shadow colour mobile origin',glyph:'slate',tab:'slate'},
      {label:'Visitor analytics',sub:'Consenting visits and approximate location',keywords:'device traffic',glyph:'visitors',tab:'visitors'}];
    function App(){const [value,setValue]=useState('left'),[angle,setAngle]=useState(0),[glow,setGlow]=useState(.5),[on,setOn]=useState(true),[search,setSearch]=useState(false);
      const [circle,setCircle]=useState(false),[proof,setProof]=useState({enabled:true,items:[{film:'First title',tag:'Film',year:2026,slug:'first',src:''},{film:'Second title with a longer name',tag:'Music',year:2025,slug:'second',src:''}],disc:{}});window.__proof=proof;
      if(circle)return <main className={styles.shell} style={{padding:16,minHeight:'100vh'}}><div style={{maxWidth:540,margin:'auto'}}><ProofTableEditor value={proof} projects={[]} onChange={patch=>setProof(previous=>({...previous,...patch}))} onShow={()=>{}} previewWidth={innerWidth}/></div></main>;
      return <main className={styles.shell} style={{padding:16,minHeight:'100vh'}}><div style={{maxWidth:540,margin:'auto'}}>
        <h1>Portal settings</h1><button id="search" onClick={()=>setSearch(true)}>Search settings</button><button id="circle" onClick={()=>setCircle(true)}>Open circle controls</button>
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
  plugins:[{name:'local-media-stub',setup(build){
    build.onResolve({filter:/^\.\/ContentEditor$/},()=>({path:'media',namespace:'local-stub'}));
    build.onLoad({filter:/.*/,namespace:'local-stub'},()=>({contents:'export const useMedia=()=>({add(){}}); export const useEditor=()=>({content:{},media:{removable:[]}}); export const ImagePicker=()=>null;',loader:'js'}));
  }}],
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
const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw Error(expression);};
const key=async(key,code=key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,...(key==='Enter'?{text:'\r',windowsVirtualKeyCode:13}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
try{
  await send('Page.enable');await send('Page.navigate',{url:'about:blank'});await send('Runtime.enable');
  await wait(`location.href==='about:blank'`);await send('Runtime.discardConsoleEntries');errors.length=0;
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
    await evaluate(`document.querySelector('#circle').click()`);
    await wait(`!!document.querySelector('input[placeholder^="Try:"]')`);
    await evaluate(`document.querySelector('input[placeholder^="Try:"]').focus()`);
    await send('Input.insertText',{text:'beam width'});
    await wait(`!!document.querySelector('input[aria-label="Beam width — exact value (%)"]')`);
    await evaluate(`document.querySelector('details[data-disc-group] summary').click()`);
    await wait(`document.querySelectorAll('details[data-disc-group][open]').length===1`);
    await evaluate(`(()=>{const e=document.querySelector('input[aria-label="Beam width — exact value (%)"]');e.focus();e.select()})()`);
    await send('Input.insertText',{text:'65'});await key('Enter');
    await wait(`window.__proof.disc.beamWidth===.65`);
    assert.equal(await evaluate('window.__proof.items.length'),2,'Settings do not mutate the title collection');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Exact values fit '+width);
    await evaluate(`(()=>{const e=document.querySelector('input[placeholder^="Try:"]');e.focus();e.select()})()`);
    await send('Input.insertText',{text:'no-such-setting'});
    await wait(`document.querySelectorAll('details[data-disc-group]').length===0`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Clear search').click()`);
    await wait(`document.querySelectorAll('details[data-disc-group]').length>8`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Beam position ·')).click()`);
    const profile=width<=640?'Mobile':width<=1024?'Tablet':'Desktop';
    await wait(`document.querySelector('details[data-disc-group][open]')?.dataset.discGroup.startsWith('${profile} beam')`);
    assert.equal(await evaluate('window.__proof.disc.beamWidth'),.65,'Navigation never resets settings');
    await evaluate(`document.querySelector('details[data-disc-group="Glass tint"] summary').click()`);
    await wait(`document.querySelectorAll('details[data-disc-group][open]').length===1 && document.querySelector('details[open]').dataset.discGroup==='Glass tint'`);
    await evaluate(`document.querySelector('[data-title-block="0"] button[aria-expanded]').focus()`);await key('Enter');
    await wait(`document.querySelector('[data-title-block="0"] button[aria-expanded="true"]')`);
    await evaluate(`(()=>{const e=document.querySelector('[data-title-block="0"] input[aria-label="This title — size — exact value (%)"]');e.focus();e.select()})()`);
    await send('Input.insertText',{text:'72'});await key('Enter');
    await wait(`window.__proof.items[0].titleScale===.72`);
    await evaluate(`document.querySelector('[data-title-block="1"] button[aria-expanded]').click()`);
    await wait(`document.querySelectorAll('[data-title-block] button[aria-expanded="true"]').length===1 && document.querySelector('[data-title-block="0"] button[aria-expanded]').getAttribute('aria-expanded')==='false'`);
    assert.equal(await evaluate(`window.__proof.items[0].titleScale`),.72,'Switching title blocks preserves edits');
    await evaluate(`document.querySelector('input[placeholder="Search title, category or year"]').focus()`);
    await send('Input.insertText',{text:'2025'});
    await wait(`document.querySelectorAll('[data-title-block]:not([hidden])').length===1`);
    assert.equal(await evaluate(`document.querySelector('[data-title-block]:not([hidden])').dataset.titleBlock`),'1');
    await evaluate(`document.querySelector('[data-title-block="1"] button[aria-expanded]').click()`);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Expanded title fits '+width);
    assert.ok(await evaluate(`document.querySelector('input[placeholder="Search title, category or year"]').parentElement.getBoundingClientRect().height<90`),'Title search stays compact '+width);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Clear title search').click()`);
    await wait(`document.querySelectorAll('[data-title-block]:not([hidden])').length===2`);
    await evaluate(`document.querySelector('[data-title-block="1"] [role="button"]').focus()`);await key('ArrowUp');
    await wait(`window.__proof.items[0].film.startsWith('Second')`);
    assert.equal(await evaluate(`document.querySelector('[data-title-block="0"] button[aria-expanded]').getAttribute('aria-expanded')`),'true','Selection follows reordered artwork');
    assert.equal(await evaluate('window.__proof.items[1].titleScale'),.72);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='+ Add title').click()`);
    await wait(`window.__proof.items.length===3 && document.querySelector('[data-title-block="2"] button[aria-expanded="true"]')`);
    assert.equal(await evaluate(`document.querySelectorAll('[data-title-block] button[aria-expanded="true"]').length`),1);
    if(width===390){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(os.tmpdir(),'dds-circle-settings-390.png'),Buffer.from(shot.data,'base64'));}
    console.log('PASS circle search, exclusive blocks, title filtering/editing/reordering and device shortcut:',width);
  }
  assert.deepEqual(errors,[]);console.log('No runtime exceptions. No application data was accessed or changed.');
}finally{socket.close();server.close();}

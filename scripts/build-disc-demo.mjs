// Rebuild the self-contained demo from the same renderer used by the website.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import ts from "typescript";
const root = new URL("../", import.meta.url);
const math = await readFile(new URL("lib/content/disc.ts", root), "utf8");
const scene = (await readFile(new URL("components/disc-hero/scene.ts", root), "utf8"))
  .replace(/^import .* from "\.\.\/\.\.\/lib\/content\/disc";\r?\n/m, "");
const js = ts.transpileModule(math + "\n" + scene, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dolly · Silver title disc</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#000;color:#edf0f6;font-family:Arial,sans-serif}main{min-height:100svh;position:relative;overflow:hidden}
canvas{display:block;width:100%;height:100svh;touch-action:pan-y}.caption{position:absolute;left:5vw;top:7vh;pointer-events:none}.caption small{font-size:10px;letter-spacing:.3em;color:#9da8b8}.caption h1{font-size:clamp(24px,4vw,54px);font-weight:500;letter-spacing:-.04em;margin:16px 0}.caption p{color:#8f99a8;font-size:12px;max-width:260px;line-height:1.6}
footer{position:absolute;left:5vw;bottom:5vh;color:#8f99a8;font-size:11px;letter-spacing:.1em}button{background:#171a21;border:1px solid #414853;border-radius:30px;color:#edf0f6;padding:10px 18px;cursor:pointer;margin-right:18px}button:focus-visible{outline:2px solid #fff}.fallback{display:none;position:absolute;inset:35% 10%;text-align:center;line-height:1.7;color:#aeb8c7}.failed .fallback{display:block}.failed canvas{visibility:hidden}
.caption h1{max-width:280px}.lil-gui{--background-color:#12151b;--widget-color:#252a34;--focus-color:#3d4659;--text-color:#ccd5e3;--title-background-color:#1b2029;--font-size:11px} @media(max-width:600px){.caption{top:5vh}.caption h1{max-width:200px}footer{right:5vw;font-size:9px}.lil-gui.root{max-width:calc(100vw - 24px)}}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/","lil-gui":"https://cdn.jsdelivr.net/npm/lil-gui@0.20.0/dist/lil-gui.esm.js"}}</script>
</head><body><main id="hero"><canvas id="scene" aria-label="Silver CD with rotating artwork and a fixed projector beam"></canvas>
<div class="caption"><small>DOLLY DESIGN STUDIO / EXPERIMENT 01</small><h1>Stories in rotation.</h1><p>Silver, glass, and a single pool of light.<br>Each title takes its turn.</p></div>
<p class="fallback" role="status">The interactive disc is unavailable on this browser. Enable WebGL and check your connection to load the demo.</p>
<footer><button id="pause" type="button" aria-pressed="false">Pause disc</button>CHROME / GLASS / LIGHT</footer></main>
<script type="module">
import GUI from "lil-gui";
${js}
// Replace or extend this array with your own image URLs. Remote servers must permit CORS.
// Built-in data URLs keep the example reliable without a separate asset directory.
const placeholder = (label, a, b) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="'+a+'"/><stop offset="1" stop-color="'+b+'"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="240" r="140" fill="none" stroke="white" stroke-opacity=".25"/><path d="M0 470L210 220 360 400 600 130V600H0Z" fill="black" opacity=".22"/><text x="300" y="470" fill="white" text-anchor="middle" font-family="sans-serif" font-size="40" letter-spacing="6">'+label+'</text><text x="300" y="520" fill="white" text-anchor="middle" font-family="sans-serif" font-size="14" letter-spacing="5">DOLLY / TITLE COLLECTION</text></svg>');
const images = [
  placeholder('AFTERLIGHT','#233d5b','#b89b66'),
  placeholder('CHAPTER 02','#4b2437','#b86b44'),
  placeholder('MONSOON','#193d40','#8fa89b'),
  placeholder('SOLSTICE','#6c4323','#d0ab62'),
  placeholder('NOCTURNE','#20203c','#8377ae'),
  placeholder('THE RETURN','#244c64','#899ca2'),
  placeholder('FIRST LIGHT','#704328','#ba9470'),
  placeholder('EIGHTH FRAME','#293e62','#887aa1'),
];
const controls = { ...DISC_DEFAULTS };
const host=document.querySelector('#hero'), canvas=document.querySelector('#scene');
let demo, gui, observer, resizeObserver;
const fail=()=>{host.classList.add('failed');document.querySelector('#pause').disabled=true;demo?.dispose();};
try {
  demo=createDiscScene(canvas,images.map((src,i)=>({src,label:'TITLE '+(i+1)})),controls,fail);
  gui=new GUI({title:'Light & motion',width:270});
  for(const [key,range] of Object.entries(DISC_RANGES)) {
    const input=key==='projectorSide'?gui.add(controls,key,{'Left':-1,'Right':1}):key==='rayStyle'?gui.add(controls,key,{'Cinema projector':0,'Prismatic fan':1,'Soft light fan':2}):gui.add(controls,key,...range);
    input.onChange(()=>demo.invalidate());
  }
  gui.close();
  canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;const bounds=canvas.getBoundingClientRect();const index=demo.hit(event.clientX-bounds.left,event.clientY-bounds.top);demo.setHover(index);canvas.style.cursor=index<0?'default':'pointer';},{passive:true});
  canvas.addEventListener('pointerleave',()=>demo.setHover(-1));
  const pause=document.querySelector('#pause');
  pause.onclick=()=>{const on=pause.getAttribute('aria-pressed')!=='true';pause.setAttribute('aria-pressed',String(on));pause.textContent=on?'Resume disc':'Pause disc';demo.setPaused(on);};
  resizeObserver=new ResizeObserver(()=>demo.resize(canvas.clientWidth,canvas.clientHeight));resizeObserver.observe(canvas);
  observer=new IntersectionObserver(([entry])=>demo.setActive(entry.isIntersecting));observer.observe(canvas);
  addEventListener('pagehide',event=>{if(!event.persisted){observer.disconnect();resizeObserver.disconnect();gui.destroy();demo.dispose();}});
} catch(error){console.error(error);fail();}
</script>
<script>addEventListener('error',function(e){if(e.target.tagName==='SCRIPT'){document.querySelector('#hero').classList.add('failed')}},true);</script>
</body></html>`;
await mkdir(new URL("public/disc-hero/", root), { recursive: true });
await writeFile(new URL("public/disc-hero/index.html", root), html);
console.log("Built public/disc-hero/index.html (single file, pinned CDN modules).");

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const json = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const clone = (value) => structuredClone(value);

test("exact slider values use familiar units, clamp safely, and preserve untouched values", () => {
  const { Slider } = loader({ react: { useId: () => "exact-slider" }, "./portal.module.css": {} })("app/portal/controls.tsx");
  const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  let changed;
  const render = (value=.08) => nodes(Slider({ label:"Arc edge thickness", value, min:.01, max:1, step:.01, editable:true, inputScale:100, inputUnit:"%", format:v=>`${v*100}%`, onChange:next=>{changed=next;} }));
  const input = render().find(node=>node.props?.type==='number');
  assert.equal(input.props.defaultValue,8); assert.equal(input.props.min,1); assert.equal(input.props.max,100);
  for (const [raw,expected] of [["15",.15],["999",1],["-4",.01],["15.6",.16]]) {
    changed=undefined;input.props.onBlur({currentTarget:{value:raw}});assert.equal(changed,expected);
  }
  for(const raw of ["","8","NaN"]) {changed=undefined;input.props.onBlur({currentTarget:{value:raw}});assert.equal(changed,undefined);}
  const untouched=render(.08333333).find(node=>node.props?.type==='number');changed=undefined;
  untouched.props.onBlur({currentTarget:{value:String(untouched.props.defaultValue)}});assert.equal(changed,undefined,"Focus/blur must not round saved custom values");
  let prevented=false,stopped=false;
  const target={value:"99",blur(){input.props.onBlur({currentTarget:this});}};changed=undefined;
  input.props.onKeyDown({key:"Escape",currentTarget:target,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(changed,undefined);assert.ok(prevented&&stopped);assert.equal(target.value,"8");
});

test("project poster fit keeps the full image inside a fixed frame and never creates a zoom-out gap", () => {
  const { workImageStyle } = loader()("lib/content/adjust.ts");
  assert.equal(workImageStyle({ src: "/images/a.jpg", alt: "A" }).objectFit, "contain");
  assert.equal(workImageStyle({ src: "/images/a.jpg", alt: "A", srcZoom: .93 }).transform, undefined);
  assert.equal(workImageStyle({ src: "/images/a.jpg", alt: "A", fit: "fill", srcZoom: 1.4 }).objectFit, "cover");
  assert.equal(workImageStyle({ src: "/images/a.jpg", alt: "A", fit: "fill", srcZoom: 1.4 }).transform, "scale(1.4)");
  const { sanitizeContent } = loader()("lib/content/sanitize.ts");
  const content = json("content/site-content.json");
  content.projects[0].images[0].fit = "fill";
  assert.equal(sanitizeContent(content).projects[0].images[0].fit, "fill");
  content.projects[0].images[0].fit = "unknown";
  assert.equal(sanitizeContent(content).projects[0].images[0].fit, undefined);
});

test("project artwork stacks keep exact images, empty/single cases, navigation and editor indices", (t) => {
  // The fan's live motion needs these browser pieces; reduced motion settles at once, so state stays deterministic here.
  Object.assign(globalThis, { requestAnimationFrame: () => 0, cancelAnimationFrame() {}, window: { matchMedia: () => ({ matches: true }) } });
  t.after(() => { delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame; delete globalThis.window; });
  for (const count of [0, 1, 2, 4, 8]) {
    let active, refIndex = 0;
    const refs = []; // Like React, a ref survives from one render to the next.
    const { ProjectImageStack } = loader({
      react: { useState: initial => [active ?? initial, value => { active = typeof value === "function" ? value(active ?? initial) : value; }], useRef: initial => (refs[refIndex++] ??= { current: initial }), useEffect() {}, useLayoutEffect() {} },
      "next/image": () => null,
      "@/app/work/[slug]/page.module.css": {},
      "@/lib/images": { placeholderProps: () => ({}), versionedSrc: src => src },
      "./MediaPlaceholder": { MediaPlaceholder: () => null },
    })("components/ProjectImageStack.tsx");
    const images = Array.from({ length: count }, (_, i) => ({ src: `/image-${i}.png`, alt: `Image ${i}` }));
    const render = () => {
      const nodes = [];
      const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== "object") return; nodes.push(node); walk(node.props?.children); };
      refIndex = 0;
      walk(ProjectImageStack({ images, projectIndex: 3, initialIndex: 0 }));
      return nodes;
    };
    let nodes = render();
    assert.equal(nodes.filter(node => node.props?.["data-depth"] !== undefined).length, count, "Never duplicates or invents artwork");
    if (!count) { assert.equal(nodes.length, 0); continue; }
    assert.equal(nodes.find(node => node.props?.["aria-current"] === "true").props["data-ed-item"], "projects.3.images.1");
    const next = nodes.find(node => node.props?.["aria-label"] === "Next project image");
    assert.equal(!!next, count > 1);
    if (!next) continue;
    next.props.onClick(); nodes = render();
    assert.equal(nodes.find(node => node.props?.["aria-current"] === "true").props["data-ed-item"], "projects.3.images.2");
    const last = nodes.filter(node => node.props?.["data-depth"] !== undefined).at(-1);
    last.props.onClick(); nodes = render();
    nodes.find(node => node.props?.["aria-label"] === "Next project image").props.onClick();
    assert.equal(render().find(node => node.props?.["aria-current"] === "true").props["data-ed-item"], "projects.3.images.1", "Wraps from last to first");
    nodes = render();
    const rapidNext = nodes.find(node => node.props?.["aria-label"] === "Next project image").props.onClick;
    rapidNext(); rapidNext();
    assert.equal(active, 2 % count, "Rapid navigation accumulates without stale state");
    assert.equal(render().filter(node => node.props?.["data-depth"] !== undefined && node.props.tabIndex === 0).length, 1, "Only the active artwork is in the tab order");
    const stage = render().find(node => node.props?.["data-stack-stage"] !== undefined);
    const captured = new Set();
    const element = { dataset: {}, style: { setProperty() {}, removeProperty() {} }, removeAttribute() {}, setAttribute() {}, querySelectorAll: () => [], clientWidth: 0,
      setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) };
    stage.props.ref.current = element;
    let clock = 0; // Each pointer event arrives 50ms after the last, so drag speed is realistic.
    const pointer = (x, y) => ({ currentTarget: element, isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, timeStamp: clock += 50, preventDefault() {} });
    const beforeSwipe = active;
    stage.props.onPointerDown(pointer(100, 100));
    stage.props.onPointerMove(pointer(30, 100));
    assert.ok(captured.has(1), "Only a committed horizontal drag captures the pointer");
    stage.props.onLostPointerCapture({ target: {}, currentTarget: element });
    stage.props.onPointerUp(pointer(30, 100));
    assert.equal(active, (beforeSwipe + 1) % count);
    assert.equal(captured.size, 0, "Release does not leave pointer capture behind");
    let suppressed = false;
    stage.props.onClickCapture({ detail: 1, timeStamp: clock, preventDefault() { suppressed = true; }, stopPropagation() {} });
    assert.ok(suppressed, "The click synthesized after dragging cannot select another card");
    const afterSwipe = active;
    stage.props.onPointerDown(pointer(100, 100));
    stage.props.onPointerMove(pointer(105, 30));
    stage.props.onPointerUp(pointer(105, 30));
    assert.equal(active, afterSwipe, "Vertical scrolling never changes the image");
    stage.props.onPointerDown(pointer(100, 100));
    stage.props.onPointerMove(pointer(30, 100));
    stage.props.onPointerCancel();
    stage.props.onPointerUp(pointer(30, 100));
    assert.equal(active, afterSwipe, "A canceled gesture does not commit a selection");
  }
});

test("portal window geometry stays visible at every edge, minimum size and viewport", () => {
  const {constrainWindow,resizeWindow}=loader()("app/portal/window-geometry.ts");
  for(const bounds of [{x:8,y:8,width:1184,height:784},{x:8,y:35,width:304,height:410},{x:0,y:0,width:240,height:150}]) {
    const valid=rect=>{
      assert.ok(rect.x>=bounds.x && rect.y>=bounds.y);
      assert.ok(rect.width>=Math.min(320,bounds.width) && rect.height>=Math.min(180,bounds.height));
      assert.ok(rect.x+rect.width<=bounds.x+bounds.width && rect.y+rect.height<=bounds.y+bounds.height);
    };
    for(const x of [-10000,0,200,10000]) for(const y of [-10000,0,200,10000]) {
      const rect=constrainWindow({x,y,width:760,height:560},bounds);valid(rect);
      for(const edge of ["n","s","e","w","ne","nw","se","sw"]) for(const delta of [-10000,-50,0,50,10000]) valid(resizeWindow(rect,edge,delta,-delta,bounds));
    }
  }
  const bounds={x:0,y:0,width:1200,height:800}, rect={x:300,y:200,width:600,height:400};
  assert.deepEqual(resizeWindow(rect,"nw",100,50,bounds),{x:400,y:250,width:500,height:350});
  assert.deepEqual(resizeWindow(rect,"se",100,50,bounds),{x:300,y:200,width:700,height:450});
  const leftOutside={x:-80,y:100,width:600,height:400};
  assert.deepEqual(resizeWindow(leftOutside,"e",10,0,bounds),{...leftOutside,x:0,width:610},"Resizing first recovers a partly off-screen window");
  const rightOutside={x:700,y:100,width:600,height:400};
  assert.deepEqual(resizeWindow(rightOutside,"w",-10,0,bounds),{...rightOutside,x:590,width:610},"The opposite edge stays anchored after recovery");
  for(const outside of [leftOutside,rightOutside]) for(const edge of ["w","e"]) for(const delta of [-10000,10000]) {
    assert.ok(resizeWindow(outside,edge,delta,0,bounds).width<=bounds.width,"A partly off-screen resize cannot grow beyond the viewport");
  }
});

test("wide portal windows can move right and left while retaining a reachable title bar", () => {
  const { moveWindow, constrainWindow } = loader()("app/portal/window-geometry.ts");
  for (const width of [240, 320, 390, 729, 1024, 1920]) {
    const bounds = { x: 8, y: 28, width: width - 16, height: 484 };
    const original = { x: 8, y: 28, width: bounds.width, height: 460 };
    assert.equal(moveWindow({ ...original, x: 108 }, bounds).x, 8);
    for (const x of [-10000, -100, 0, 100, 10000]) {
      const moved = moveWindow({ ...original, x, y: 10000 }, bounds);
      const visible = Math.min(moved.x + moved.width, bounds.x + bounds.width) - Math.max(moved.x, bounds.x);
      assert.ok(visible >= moved.width-1e-9, "The entire window remains visible");
      assert.ok(moved.y >= bounds.y && moved.y + moved.height <= bounds.y + bounds.height);
      const recovered = constrainWindow(moved, bounds);
      assert.ok(recovered.x >= bounds.x && recovered.x + recovered.width <= bounds.x + bounds.width);
    }
  }
});

test("portal windows move, resize, restore, cancel, and release pointer capture without remounting content", () => {
  const originals=new Map(["window","document","Element","HTMLElement"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  class Node extends EventTarget {
    constructor(kind,parent=null) {super();this.kind=kind;this.parent=parent;this.dataset={};this.attrs=new Map();this.style={removeProperty:key=>delete this.style[key]};this.captured=new Set();}
    setAttribute(key,value){this.attrs.set(key,value);}
    getAttribute(key){return this.attrs.get(key)??null;}
    hasAttribute(key){return this.attrs.has(key);}
    removeAttribute(key){this.attrs.delete(key);}
    toggleAttribute(key,on){if(on)this.setAttribute(key,"");else this.removeAttribute(key);}
    closest(selector){
      if(selector==="[data-window-titlebar]" && this.kind==="header")return this;
      if(selector==="[data-window-resize]" && this.kind==="resize")return this;
      if(selector==="[data-window-action]" && this.dataset.windowAction)return this;
      if(selector.startsWith("button,") && ["action","resize","input"].includes(this.kind))return this;
      return this.parent?.closest(selector)??null;
    }
    focus(){this.focused=true;}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);}
    getBoundingClientRect(){return {left:parseFloat(this.style.left??100),top:parseFloat(this.style.top??120),width:parseFloat(this.style.width??600),height:parseFloat(this.style.height??300)};}
  }
  const viewport=Object.assign(new EventTarget(),{width:1200,height:800,offsetLeft:0,offsetTop:0});
  const win=Object.assign(new EventTarget(),{innerWidth:1200,innerHeight:800,visualViewport:viewport});
  const root=new Node("root"), box=new Node("box"), header=new Node("header",box), input=new Node("input",header);
  header.setAttribute("data-window-titlebar","");
  const maximize=new Node("action",header), reset=new Node("action",header), handle=new Node("resize",box), icon={textContent:"□"};
  maximize.dataset.windowAction="maximize";reset.dataset.windowAction="reset";handle.dataset.windowResize="se";
  box.querySelector=()=>maximize;maximize.querySelector=()=>icon;
  const values={window:win,document:{documentElement:root},Element:Node,HTMLElement:Node};
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const fire=(target,type,source,props={})=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,"target",{value:source});Object.assign(e,{isPrimary:true,button:0,buttons:1,pointerId:1,clientX:100,clientY:100},props);target.dispatchEvent(e);return e;};
  let cleanup;
  try {
    cleanup=loader()("app/portal/panel-window.ts").bindPanelWindow(box);
    assert.equal(box.hasAttribute("data-window-custom"),false,"Initial CSS layout remains unchanged");
    viewport.height=260;viewport.offsetTop=40;viewport.dispatchEvent(new Event("resize"));
    let defaultFit=box.getBoundingClientRect();
    assert.ok(defaultFit.top>=48 && defaultFit.top+defaultFit.height<=292,"An untouched window also fits above the mobile keyboard");
    viewport.height=800;viewport.offsetTop=0;viewport.dispatchEvent(new Event("scroll"));
    assert.equal(box.hasAttribute("data-window-custom"),false,"Closing the keyboard restores the original default auto-height");
    assert.equal(box.style.height,undefined);
    fire(box,"pointerdown",input);assert.equal(root.hasAttribute("data-portal-window-drag"),false,"Inputs cannot drag the window");
    fire(box,"pointerdown",header);fire(win,"pointerup",header);
    assert.equal(box.hasAttribute("data-window-custom"),false,"A title click alone does not fix the default auto-height");
    fire(box,"pointerdown",header);assert.equal(header.hasPointerCapture(1),true);
    assert.equal(root.hasAttribute("data-portal-window-drag"),true,"The preview is shielded from the first drag movement");
    fire(win,"pointermove",header,{clientX:200,clientY:150});fire(win,"pointerup",header,{clientX:200,clientY:150});
    assert.equal(box.style.left,"200px");assert.equal(box.style.top,"170px");assert.equal(header.hasPointerCapture(1),false);
    assert.equal(root.hasAttribute("data-portal-window-drag"),false);
    fire(box,"pointerdown",handle);fire(win,"pointerup",handle,{clientX:250,clientY:200});
    assert.equal(box.style.width,"750px");assert.equal(box.style.height,"400px");
    fire(box,"click",maximize);assert.equal(box.style.width,"1200px");assert.equal(box.style.height,"800px");
    assert.equal(maximize.getAttribute("aria-pressed"),"true");assert.equal(icon.textContent,"❐");
    const escape=fire(box,"keydown",input,{key:"Escape"});assert.equal(escape.defaultPrevented,true);
    assert.equal(box.style.left,"200px");assert.equal(box.style.width,"750px");
    fire(box,"keydown",header,{key:"ArrowLeft",shiftKey:true});assert.equal(box.style.left,"160px");
    fire(box,"keydown",handle,{key:"ArrowDown"});assert.equal(box.style.height,"410px");
    fire(box,"pointerdown",header);fire(win,"pointermove",header,{clientX:350,clientY:300});fire(box,"keydown",header,{key:"Escape"});
    assert.equal(box.style.left,"160px","Explicit Escape restores the pre-drag geometry");
    fire(box,"pointerdown",header,{clientX:300,clientY:180});
    fire(win,"pointerup",header,{clientX:1100,clientY:180});
    assert.equal(box.style.left,"442px", "Rightward travel keeps the full window visible");
    fire(box,"keydown",header,{key:"ArrowRight",shiftKey:true});
    assert.equal(box.style.left,"442px", "Keyboard movement uses the same safe limit");
    fire(box,"click",maximize);
    fire(box,"pointerdown",header,{clientX:600,clientY:20});fire(win,"pointerup",header,{clientX:600,clientY:20});
    assert.equal(box.hasAttribute("data-window-fullscreen"),true,"A maximized title click does not restore the window");
    fire(box,"pointerdown",header,{clientX:600,clientY:20});
    fire(win,"pointermove",header,{clientX:700,clientY:80});
    assert.equal(box.hasAttribute("data-window-fullscreen"),false);
    assert.equal(box.style.width,"750px");assert.equal(box.style.left,"325px");assert.equal(box.style.top,"60px");
    fire(box,"keydown",header,{key:"Escape"});
    assert.equal(box.hasAttribute("data-window-fullscreen"),true,"Cancelled restore-drag returns to maximized state");
    fire(box,"pointerdown",header,{clientX:600,clientY:20});
    fire(win,"pointermove",header,{clientX:700,clientY:80});
    fire(win,"pointerup",header,{clientX:740,clientY:90});
    assert.equal(box.style.left,"365px");assert.equal(box.style.top,"70px");
    assert.equal(box.hasAttribute("data-window-fullscreen"),false);
    win.innerWidth=390;win.innerHeight=300;viewport.width=390;viewport.height=300;win.dispatchEvent(new Event("resize"));
    const rect=box.getBoundingClientRect();assert.ok(rect.left+rect.width<=382 && rect.top+rect.height<=292);
    win.innerWidth=1200;win.innerHeight=800;viewport.width=1200;viewport.height=800;viewport.dispatchEvent(new Event("resize"));
    assert.equal(box.style.width,"750px");assert.equal(box.style.height,"410px");assert.equal(box.style.left,"365px","Keyboard/rotation fitting does not discard the user's chosen geometry");
    win.innerWidth=390;win.innerHeight=300;viewport.width=390;viewport.height=300;win.dispatchEvent(new Event("resize"));
    fire(box,"click",reset);
    defaultFit=box.getBoundingClientRect();
    assert.ok(defaultFit.left>=8 && defaultFit.left+defaultFit.width<=382 && defaultFit.top+defaultFit.height<=292,"Reset remains visible in a short viewport");
    fire(box,"click",maximize);fire(box,"click",maximize);
    assert.deepEqual(box.getBoundingClientRect(),defaultFit,"Restore returns to the fitted default layout");
    fire(box,"keydown",header,{key:"ArrowDown"});
    viewport.width=360;viewport.height=240;viewport.offsetLeft=20;viewport.offsetTop=30;viewport.dispatchEvent(new Event("resize"));
    const visible=box.getBoundingClientRect();assert.ok(visible.left>=28 && visible.top>=38 && visible.top+visible.height<=262,"On-screen keyboards and zoom keep controls in the visible viewport");
    fire(box,"click",maximize);assert.equal(box.style.left,"20px");assert.equal(box.style.top,"30px");assert.equal(box.style.height,"240px");
    fire(box,"click",reset);
    win.visualViewport = undefined; win.innerWidth = 729; win.innerHeight = 500;
    win.dispatchEvent(new Event("resize"));
    const capturePointer = header.setPointerCapture;
    header.setPointerCapture = () => { throw new Error("Capture unavailable"); };
    fire(box,"pointerdown",header);
    fire(win,"pointermove",header,{clientX:300,clientY:100,pointerId:2});
    assert.equal(box.hasAttribute("data-window-custom"),false,"Another pointer cannot move the window");
    fire(win,"pointerup",header,{clientX:300,clientY:100});
    assert.equal(box.style.left,"121px","Dragging works without visualViewport or pointer capture and stays fully visible");
    assert.equal(root.hasAttribute("data-portal-window-drag"),false);
    header.setPointerCapture = capturePointer;
    fire(box,"click",reset);
    fire(box,"pointerdown",header);
    fire(win,"pointermove",header,{clientX:10000,clientY:100});
    const boundaryLeft=parseFloat(box.style.left);
    fire(win,"pointermove",header,{clientX:9990,clientY:100});
    assert.equal(parseFloat(box.style.left),boundaryLeft-10,"Reverse immediately after reaching a drag boundary");
    fire(win,"pointerup",header,{clientX:0,clientY:0});
    assert.equal(parseFloat(box.style.left),boundaryLeft-10,"A zero-coordinate release cannot teleport the window");
    fire(box,"pointerdown",header);
    fire(win,"pointermove",header,{clientX:90,clientY:110});
    const cancelledRect=box.getBoundingClientRect();
    fire(win,"pointercancel",header);
    assert.deepEqual(box.getBoundingClientRect(),cancelledRect,"Browser cancellation keeps the last valid position");
    fire(box,"pointerdown",header);
    fire(win,"pointermove",header,{clientX:300,clientY:100,buttons:0});
    assert.deepEqual(box.getBoundingClientRect(),cancelledRect,"A missed release must not drag on hover");
    assert.equal(root.hasAttribute("data-portal-window-drag"),false);
    fire(box,"pointerdown",header);cleanup();cleanup=undefined;
    assert.equal(header.hasPointerCapture(1),false);assert.equal(root.hasAttribute("data-portal-window-drag"),false);
    fire(box,"click",maximize);assert.equal(box.hasAttribute("data-window-fullscreen"),false,"Unmount removes all listeners");
  } finally {cleanup?.();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test("glass image cleanup works with native bitmaps and HTML-image fallbacks", () => {
  const { releaseDiscImage } = loader()("lib/content/disc.ts");
  let closed = 0;
  releaseDiscImage({ close() { closed++; } });
  assert.equal(closed, 1);
  const image = { src: "blob:decoded-artwork" };
  releaseDiscImage(image);
  assert.equal(image.src, "");
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.doesNotMatch(scene, /instanceof ImageBitmap/);
  assert.match(scene, /releaseDiscImage\(bitmap\)/);
});

test("responsive form, touch controls and long service copy are scoped to their available space", () => {
  const contact = readFileSync(path.join(root, "components/sections/Contact.module.css"), "utf8");
  assert.match(contact, /\.row2\s*\{[^}]*repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/);
  assert.doesNotMatch(contact, /@media \(min-width: 560px\)/, "A wide viewport can still contain a narrow form column");
  assert.match(contact, /\.projectChoices\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/, "Long service choices receive the full form column");
  assert.match(contact, /@media \(pointer: coarse\)[\s\S]*?font-size: 16px;\s*min-height: 48px/);
  const windowCss = readFileSync(path.join(root, "app/portal/window.module.css"), "utf8");
  assert.match(windowCss, /\.actions button, \.titlebar > button \{ width: 44px; height: 44px; \}/);
  assert.match(windowCss, /\.window select, \.window textarea \{ font-size: 16px; min-height: 44px; \}/);
  const portal = readFileSync(path.join(root, "app/portal/portal.module.css"), "utf8");
  assert.match(portal, /@media \(pointer: coarse\)\s*\{\s*\.range \{ height: 44px; \}/);
  const services = readFileSync(path.join(root, "components/sections/Services.module.css"), "utf8");
  for (const selector of ["dialogTitle", "dialogStory", "dialogList li"]) {
    assert.match(services, new RegExp(`\\.${selector}\\s*\\{[^}]*overflow-wrap: anywhere`));
  }
  assert.match(services, /\.dialogClose, \.dialogStep button \{ width: 44px; height: 44px; \}/);
  assert.match(services, /\.card:hover, \.card:focus-visible, \.card:hover \.moreArrow svg, \.card:focus-visible \.moreArrow svg \{ transform: none; \}/);
});

test("service categories stay spacious, icon-led and keyboard operable without losing saved details", () => {
  const css=new Proxy({}, {get:(_target,key)=>key==="__esModule"?false:key});
  const services=clone(json("content/site-content.json").services);
  const original=clone(services);
  let selected=null;
  const Dialog=()=>null, Icon=()=>null;
  const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
  const {Services}=loader({
    react:{useState:()=>[selected,next=>{selected=next;}]},
    "@/lib/content/context":{useContent:()=>({home:{services:{label:"Services",title:"Our services"}},services}),tx:path=>({"data-t":path})},
    "@/components/fx/render-fx":{renderFx:value=>value},
    "@/components/PreviewControls":{AddContent:()=>null},
    "./ServiceDialog":{ServiceDialog:Dialog},"./ServiceIcon":{ServiceIcon:Icon},"./Services.module.css":css,
  })("components/sections/Services.tsx");
  const tree=nodes(Services()), cards=tree.filter(node=>node.type==="article");
  assert.equal(cards.length,8);
  assert.equal(tree.filter(node=>node.type===Icon).length,8);
  assert.equal(tree.filter(node=>node.type==="img"||node.props?.className==="media"||node.props?.className==="chips").length,0);
  cards.forEach((card,i)=>{
    assert.equal(card.props.role,"button");assert.equal(card.props.tabIndex,0);
    assert.equal(card.props["data-ed-item"],`services.${i}`);
    assert.equal(card.props["data-glow-card"],true);
    assert.equal(card.props.children.at(-1).props.className,"more","The action has its own row outside the icon/text region");
    card.props.onClick();assert.equal(selected,i);
    selected=null;
    let prevented=false;
    card.props.onKeyDown({key:"Enter",target:card,currentTarget:card,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(selected,i);
    const dialog=nodes(Services()).find(node=>node.type===Dialog);
    assert.equal(dialog.props.index,i);assert.deepEqual(dialog.props.services,services);
    dialog.props.onClose();assert.equal(selected,null);
  });
  assert.deepEqual(services,original,"Simplifying the cards must not rewrite names, descriptions or images");
  const stylesheet=readFileSync(path.join(root,"components/sections/Services.module.css"),"utf8");
  assert.match(stylesheet,/\.cards\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(stylesheet,/grid-template-areas: "icon body" "action action"/);
  assert.match(stylesheet,/@media \(max-width: 600px\)\s*\{[^}]*grid-template-areas: "icon" "body" "action"/s);
  assert.match(stylesheet,/\.badge\.badge\s*\{[^}]*width: 116px/);
  assert.ok(tree.filter(node=>node.type==="p"&&node.props?.["data-t"]==="services.description").length===8);
  assert.doesNotMatch(stylesheet,/\.media\s*\{|\.chips\s*\{/);
  assert.match(stylesheet,/\.card:focus-visible \.badge/);
  assert.match(stylesheet,/\.card:hover \.badge:not\(\[data-tap\]\)/,"Touch hover does not leave the icon permanently lit");
});

test("service dialogs omit empty media but preserve galleries, editing and next/previous actions", () => {
  const originalDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
  Object.defineProperty(globalThis,"document",{configurable:true,value:{body:{}}});
  const css=new Proxy({}, {get:(_target,key)=>key==="__esModule"?false:key});
  const Image=()=>null, Icon=()=>null;
  let shot=0, selected=0, closed=false;
  const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
  try {
    const {ServiceDialog}=loader({
      react:{useState:()=>[shot,next=>{shot=next;}],useRef:()=>({current:null}),useEffect(){}},
      "react-dom":{createPortal:node=>node},"next/image":Image,
      "@/components/fx/render-fx":{renderFx:value=>value,plainFx:value=>value},
      "@/lib/images":{placeholderProps:()=>({}),versionedSrc:src=>src},
      "@/lib/content/adjust":{adjustStyle:()=>({})},
      "@/lib/smooth-scroll":{freezeScroll(){},releaseScroll(){}},"@/lib/section-nav":{goToSection(){}},
      "@/components/PreviewControls":{AddContent:()=>null,EditContent:()=>null},
      "./ServiceIcon":{ServiceIcon:Icon},"./Services.module.css":css,
    })("components/sections/ServiceDialog.tsx");
    const services=clone(json("content/site-content.json").services);
    const render=()=>nodes(ServiceDialog({services,index:0,onIndex:value=>{selected=value;},onClose:()=>{closed=true;}}));
    let tree=render();
    assert.equal(tree.find(node=>node.props?.role==="dialog").props["data-has-media"],false);
    assert.equal(tree.filter(node=>node.props?.className==="dialogMedia").length,0);
    assert.equal(tree.filter(node=>node.type===Icon).length,1);
    assert.equal(tree.find(node=>node.props?.className==="dialogStory").props.children,services[0].description);
    tree.find(node=>node.props?.["aria-label"]==="Previous service").props.onClick();assert.equal(selected,services.length-1);
    tree.find(node=>node.props?.["aria-label"]==="Next service").props.onClick();assert.equal(selected,1);
    tree.find(node=>node.props?.["aria-label"]==="Close").props.onClick();assert.equal(closed,true);
    services[0].sample="/images/sample.png";
    services[0].gallery=[{src:"/images/gallery.png",alt:"Gallery artwork"}];
    tree=render();
    assert.equal(tree.find(node=>node.props?.role==="dialog").props["data-has-media"],true);
    assert.equal(tree.find(node=>node.type===Image).props.src,"/images/sample.png");
    tree.find(node=>node.props?.["aria-label"]==="Picture 2 of 2").props.onClick();
    assert.equal(render().find(node=>node.type===Image).props.src,"/images/gallery.png");
    services[0].sample="";shot=0;
    assert.equal(render().find(node=>node.type===Image).props.src,"/images/gallery.png","Gallery-only services retain their artwork");
  } finally {if(originalDocument)Object.defineProperty(globalThis,"document",originalDocument);else delete globalThis.document;}
  const icon=readFileSync(path.join(root,"components/sections/ServiceIcon.tsx"),"utf8");
  assert.match(icon,/import glow from "\.\/Process.module.css"/);
  assert.match(icon,/className=\{glow.icon\}/);
  assert.match(icon,/glass-glow/);
  assert.ok(icon.indexOf('n.includes("tour")')<icon.indexOf('n.includes("music")'),"Tours have a distinct mark from music videos");
});

test("glass title angle, colour and glow controls form independent responsive groups", () => {
  const css = new Proxy({}, { get: (_target, key) => key === "__esModule" ? false : key });
  const app = loader({
    react: { useId: () => "title-test", useState: value => [typeof value === "function" ? value() : value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
    "./DeleteDialog": { useConfirmDelete: () => ({ ask() {}, dialog: null }) },
    "./ContentEditor": { useMedia: () => ({}), ImagePicker: () => null },
    "./reorder": { useReorder: () => ({ attach() {}, item: () => ({}), grip: () => null }) },
    "./portal.module.css": css,
  });
  const { ProofTableEditor } = app("app/portal/ProofTableEditor.tsx");
  const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  let patch;
  const item = { film: "Sample", tag: "Title", year: 2026, slug: "sample", src: "", titleColor: "#123456", titleGlowColor: "#abcdef", titleGlowIntensity: .5 };
  const tree = nodes(ProofTableEditor({ value: { enabled: true, items: [item], disc: {} }, projects: [{ slug: "sample", title: "Sample" }], onChange: value => { patch = value; }, onShow() {} }));
  const groups = tree.filter(node => node.props?.className === "slotTintGroup");
  assert.equal(groups.length, 6);
  assert.deepEqual(groups.map(group => nodes(group).find(node => node.props?.label)?.props.label), ["This title — rotation angle", "This title — size", "This title — blend opacity", "Title colour", "Title glow colour", "Title glow intensity"]);
  const edge = tree.find(node => node.props?.label === "Arc edge thickness");
  assert.equal(edge.props.min, .01); assert.equal(edge.props.max, 1); assert.equal(edge.props.value, .08);
  edge.props.onChange(.15);
  assert.equal(patch.disc.edgeThickness, .15);
  const thinEdge = tree.find(node => node.type === "button" && node.props.children === "Use ultra-thin edge");
  thinEdge.props.onClick(); assert.equal(patch.disc.edgeThickness,.08);
  const resetLight = tree.find(node => node.type === "button" && node.props.children === "Reset lighting only");
  resetLight.props.onClick(); assert.equal(patch.disc.lightIntensity,1); assert.equal(patch.disc.rayIntensity,1);
  for(const [previewWidth, expected] of [[390,"mobile"],[820,"tablet"],[1440,"desktop"]]) {
    const previewTree=nodes(ProofTableEditor({value:{enabled:true,items:[],disc:{}},projects:[],onChange(){},onShow(){},previewWidth}));
    const status=previewTree.find(node=>node.props?.role==="status");
    assert.ok(status.props.children.includes(expected),"The editor identifies the actual active beam profile");
  }
  const titleSize = nodes(groups[1]).find(node => node.props?.label === "This title — size");
  assert.equal(titleSize.props.value, 1);
  titleSize.props.onChange(.55); assert.equal(patch.items[0].titleScale, .55);
  const titleOpacity = nodes(groups[2]).find(node => node.props?.label === "This title — blend opacity");
  assert.equal(titleOpacity.props.value, 1);
  titleOpacity.props.onChange(0); assert.equal(patch.items[0].titleOpacity, 0);
  const blend = nodes(groups[2]).find(node => node.type === "select");
  assert.equal(blend.props.value, "normal");
  blend.props.onChange({ target: { value: "screen" } }); assert.equal(patch.items[0].titleBlend, "screen");
  const appearance = tree.find(node => node.props?.label === "Title appearance");
  appearance.props.onChange("original");
  assert.equal(patch.items[0].titleAppearance, "original");
  const originalModeTree = nodes(ProofTableEditor({ value: { enabled: true, items: patch.items, disc: {} }, projects: [], onChange: value => { patch = value; }, onShow() {} }));
  const impact = originalModeTree.find(node => node.props?.label === "Original title impact");
  assert.equal(impact.props.value, 0);
  impact.props.onChange(.5);
  assert.equal(patch.items[0].titleImpact, .5);
  const shared = tree.find(node => node.props?.label === "Title rotation angle");
  assert.equal(shared.props.format(35), "35°");
  shared.props.onChange(35);
  assert.equal(patch.disc.slotRotation, 35);
  assert.ok(tree.some(node => node.props?.label === "Gap between titles"));
  const angle = nodes(groups[0]).find(node => node.props?.label === "This title — rotation angle");
  assert.equal(angle.props.value, 0);
  angle.props.onChange(-45);
  assert.equal(patch.items[0].titleRotation, -45);
  assert.equal(patch.items[0].titleColor, "#123456");
  assert.equal(nodes(groups[0]).find(node => node.type === "button").props.disabled, true);
  const customTree = nodes(ProofTableEditor({ value: { enabled: true, items: [{ ...item, titleRotation: 0 }], disc: { slotRotation: 35 } }, projects: [], onChange: value => { patch = value; }, onShow() {} }));
  assert.equal(customTree.find(node => node.props?.label === "This title — rotation angle").props.value, 0, "An explicit zero overrides the shared angle");
  const resetAngle = customTree.find(node => node.type === "button" && node.props.children === "Use shared title angle");
  assert.equal(resetAngle.props.disabled, false);
  resetAngle.props.onClick();
  assert.equal(patch.items[0].titleRotation, undefined);
  const inheritedTree = nodes(ProofTableEditor({ value: { enabled: true, items: patch.items, disc: { slotRotation: 35 } }, projects: [], onChange() {}, onShow() {} }));
  assert.equal(inheritedTree.find(node => node.props?.label === "This title — rotation angle").props.value, 35);
  nodes(groups[3]).find(node => node.type === "button").props.onClick();
  assert.equal(patch.items[0].titleColor, undefined);
  assert.equal(patch.items[0].titleGlowColor, "#abcdef");
  const originalColour = nodes(groups[3]).find(node => node.type === "button" && node.props.children === "Original colour (no grading)");
  assert.equal(originalColour.props["aria-pressed"], false);
  originalColour.props.onClick();
  assert.equal(patch.items[0].titleColor, undefined);
  assert.equal(patch.items[0].titleOriginalColor, true);
  assert.equal(patch.items[0].titleGlowColor, "#abcdef", "Changing title colour does not reset its glow");
  const originalTree = nodes(ProofTableEditor({ value: { enabled: true, items: patch.items, disc: {} }, projects: [], onChange: value => { patch = value; }, onShow() {} }));
  originalTree.find(node => node.type === "button" && node.props.children === "Use uploaded title colour").props.onClick();
  assert.equal(patch.items[0].titleOriginalColor, undefined);
  const eightTitles = Array.from({ length: 8 }, (_, index) => ({ ...item, film: `Title ${index + 1}`, src: `/images/proof-table/${index}.png` }));
  const growingTree = nodes(ProofTableEditor({ value: { enabled: true, items: eightTitles, disc: {} }, projects: [], onChange: value => { patch = value; }, onShow() {} }));
  growingTree.find(node => node.type === "button" && node.props.children === "+ Add title").props.onClick();
  assert.equal(patch.items.length, 9);
  assert.equal(app("lib/content/disc.ts").visibleDiscItems(patch.items).length, 9, "The ninth title immediately gets a disc slot");
  nodes(groups[5]).find(node => node.props?.label === "Title glow intensity").props.onChange(1.5);
  assert.equal(patch.items[0].titleGlowIntensity, 1.5);
  const source = readFileSync(path.join(root, "app/portal/portal.module.css"), "utf8");
  assert.match(source, /\.slotTint\s*\{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/);
  assert.match(source, /\.slotGrid\s*\{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/);
  assert.match(source, /\.controlRow\s*\{[^}]*flex-wrap: wrap/);
  assert.match(source, /\.controlLabel\s*\{[^}]*flex: 1 1 140px/);
  assert.match(source, /\.slotGrid > label\s*\{/);
});

test("every toolbar sheet and Studio editor exposes the same window controls without changing default sizes", () => {
  const source=readFileSync(path.join(root,"app/portal/PortalEditor.tsx"),"utf8");
  assert.match(source,/<PanelWindow key=\{tab\}/,"Each newly opened tool starts with the original layout");
  const modal=readFileSync(path.join(root,"app/portal/EditModal.tsx"),"utf8");
  assert.match(modal,/usePanelWindow\(box\)/);assert.match(modal,/<WindowActions \/>/);assert.match(modal,/<WindowHandles \/>/);
  assert.match(modal,/useDialogFocus\(box, cancel\)/,"Modal focus and unsaved-change confirmation remain in place");
  const css=readFileSync(path.join(root,"app/portal/edit.module.css"),"utf8");
  assert.match(css,/width: min\(760px, calc\(100vw - 24px\)\)/);
  assert.match(css,/bottom: var\(--portal-sheet-bottom, 132px\)/);
});

test("portal search accepts colour variants, ranks names and bounds results", () => {
  const { searchSettings } = loader()("app/portal/search-settings.ts");
  const entries = [
    { label: "Glass title circle", sub: "Projector settings", keywords: "shadow colour mobile origin rotation" },
    { label: "Brand colours & navigation", sub: "Site appearance", keywords: "glow" },
  ];
  assert.equal(searchSettings(entries, "shadow color")[0], entries[0]);
  assert.equal(searchSettings(entries, "brand-colour")[0], entries[1]);
  assert.equal(searchSettings(entries, "mobile origin")[0], entries[0]);
  assert.equal(searchSettings(entries, "password").length, 0);
  assert.equal(searchSettings(Array(60).fill(entries[0]), "").length, 40);
  assert.equal(searchSettings(entries, "colour")[0], entries[1]);
});

test("portal tools keep owner analytics out of editor and setup navigation", () => {
  const { canOpenPortalTool: can } = loader()("app/portal/tool-access.ts");
  assert.equal(can({role:"owner"}, "visitors"), true);
  assert.equal(can({role:"editor"}, "visitors"), false);
  assert.equal(can({role:"owner", setup:true}, "visitors"), false);
  assert.equal(can({role:"owner", setup:true}, "account"), true);
  assert.equal(can({role:"editor"}, "media"), true);
});

test("portal choices support keyboard selection and angle keys prevent page scrolling", () => {
  const { Choice, Dial, Slider, Toggle } = loader({ react: { useId: () => "setting-test" }, "./portal.module.css": {} })("app/portal/controls.tsx");
  let selected, focused, prevented = false;
  const tree = Choice({label:"Direction", value:"left", options:[{value:"left",label:"Left"},{value:"right",label:"Right"}], onChange:v => {selected=v;}});
  const group = tree.props.children[1];
  assert.deepEqual(group.props.children.map(child=>child.props.tabIndex), [0,-1]);
  const buttons = [0,1].map(i=>({focus(){focused=i;}}));
  group.props.onKeyDown({key:"ArrowLeft", target:buttons[0], currentTarget:{querySelectorAll:()=>buttons}, preventDefault(){prevented=true;}});
  assert.equal(selected,"right"); assert.equal(focused,1); assert.ok(prevented);
  const dial = Dial({label:"Angle",value:0,onChange:v=>{selected=v;}}).props.children[1].props.children[0];
  prevented=false;
  dial.props.onKeyDown({key:"ArrowLeft",preventDefault(){prevented=true;}});
  assert.equal(selected,355); assert.ok(prevented);
  const slider = Slider({label:"Glow",hint:"Artwork only",value:0.5,min:0,max:1,step:0.1,format:v=>`${v*100}%`,onChange(){}});
  assert.equal(slider.props.children[1].props["aria-valuetext"],"50%");
  assert.equal(slider.props.children[1].props["aria-describedby"], slider.props.children[2].props.id);
  const toggle = Toggle({label:"Show glass",hint:"On this page",checked:true,onChange(){}});
  assert.equal(toggle.props.children[0].props.children[1].props["aria-label"],"Show glass");
});

test("footer keeps the creator credit outside portal-editable content and the studio edit boundary", () => {
  const content = loader()("lib/content/defaults.ts").defaultContent();
  content.site.name = "Custom Studio";
  content.footer.rights = "Custom rights";
  content.footer.creatorCredit = { name: "Replacement" };
  content.creatorCredit = { name: "Replacement" };
  const clean = loader()("lib/content/sanitize.ts").sanitizeContent(content);
  assert.equal(clean.creatorCredit, undefined);
  assert.equal(clean.footer.creatorCredit, undefined);
  const { Footer } = loader({
    "@/lib/content/context": { useContent: () => clean },
    "./Footer.module.css": { footer: "footer", row: "row", studio: "studio", label: "label" },
    "./CreatorCredit.module.css": { credit: "credit", name: "credit-name" },
  })("components/Footer.tsx");
  const tree = Footer();
  assert.equal(tree.props["data-ed-section"], undefined);
  const [studio, credit] = tree.props.children.props.children;
  assert.equal(studio.props["data-ed-section"], "site:menu");
  assert.equal(credit.props["data-ed-section"], undefined);
  const markup = nativeRequire("react-dom/server").renderToStaticMarkup(tree);
  assert.match(markup, /Custom Studio/); assert.match(markup, /Custom rights/);
  assert.match(markup, /Kethan/); assert.doesNotMatch(markup, /Replacement|Bangalore/);
  const schema = readFileSync(path.join(root, "app/portal/content-schema.ts"), "utf8");
  assert.doesNotMatch(schema, /path: "(?:creatorCredit|footer\.creator)/);
});

test("creator watermark supports text, protected logo and both, with a text fallback on image failure", () => {
  const { creditLogoSource } = loader()("config/creator-credit.ts");
  const config = { name: "Kethan", mode: "text", logo: { src: "/images/brand/creator/signature.svg", width: 120, height: 40 } };
  let failed = "";
  const { CreatorCredit } = loader({
    react: { useState: () => [failed, next => { failed = next; }] },
    "@/config/creator-credit": { creatorCredit: config, creditLogoSource },
    "./CreatorCredit.module.css": {},
  })("components/CreatorCredit.tsx");
  const children = () => CreatorCredit().props.children.filter(Boolean);
  assert.equal(children().filter(c => c.type === "img").length, 0);
  config.mode = "both";
  let nodes = children();
  assert.equal(nodes.find(c => c.type === "img").props.alt, "");
  assert.equal(nodes.at(-1).props.children, "Kethan");
  config.mode = "logo";
  nodes = children(); assert.equal(nodes.at(-1).type, "img"); assert.equal(nodes.at(-1).props.alt, "Kethan");
  nodes.at(-1).props.onError();
  assert.equal(children().at(-1).props.children, "Kethan", "A broken logo never removes the credit");
  for (const value of ["", "/images/uploads/changeable.png", "/images/brand/logo.png", "https://example.com/logo.svg", "/images/brand/creator/../logo.svg"]) assert.equal(creditLogoSource(value), "");
  assert.equal(creditLogoSource(config.logo.src), config.logo.src);
});

test("visitor payloads require consent, strip queries, exclude private paths and bound engagement", () => {
  const { parseVisit, publicVisitPath, timedVisit } = loader()("lib/visitors/model.ts");
  const input = { consent: true, id: crypto.randomUUID(), sequence: 1, current: "/work", pages: [{ path: "/work", views: 1, seconds: 999, depth: 80 }] };
  assert.ok(parseVisit(input));
  assert.equal(parseVisit({ ...input, consent: false }), null);
  for (const value of ["/portal", "/api/contact", "//evil.test", "https://evil.test", "/#email@example.com", "/work/%2e%2e"]) assert.equal(publicVisitPath(value), null);
  assert.equal(publicVisitPath("/work?email=private@example.com"), "/work");
  assert.equal(parseVisit({ ...input, pages: Array(51).fill(input.pages[0]) }), null);
  assert.equal(parseVisit({ ...input, pages: [{ ...input.pages[0], depth: 101 }] }), null);
  assert.equal(timedVisit(parseVisit(input), null, 1000).pages[0].seconds, 0);
  assert.equal(timedVisit(parseVisit(input), { firstSeen: 0 }, 15000).pages[0].seconds, 15);
});

function visitorDatabase() {
  const { DatabaseSync } = nativeRequire("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(path.join(root, "migrations/visitors/0001_sessions.sql"), "utf8"));
  return { sqlite, db: { prepare(sql) { let values = []; return {
    bind(...next) { values = next; return this; },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { return sqlite.prepare(sql).run(...values); },
  }; } } };
}

test("visitor SQL keeps concurrent sessions distinct, rejects stale heartbeats and tombstones withdrawals", async () => {
  const { sqlite, db } = visitorDatabase();
  const api = loader()("lib/visitors/server.ts");
  const runtime = { db, cf: { country: "IN" }, enabled: true, local: false, key: "", geoLimit: 0 };
  const now = Date.now();
  const make = () => ({ id: crypto.randomUUID(), sequence: 1, current: "/work", pages: [{ path: "/work", views: 1, seconds: 0, depth: 20 }] });
  const first = make(), second = make();
  try {
    await Promise.all([api.recordVisit(runtime, first, new Headers({ "user-agent": "Chrome/1 Windows", "cf-connecting-ip": "8.8.8.8" }), now), api.recordVisit(runtime, second, new Headers(), now)]);
    let report = await api.readVisitors(runtime, 1, null);
    assert.equal(report.total, 2); assert.equal(report.live, 2);
    assert.equal(report.visits[0].locationSource, "Cloudflare");
    assert.ok(!JSON.stringify(report).includes("8.8.8.8"));
    await api.recordVisit(runtime, { ...first, sequence: 3 }, new Headers(), now + 60000);
    await api.recordVisit(runtime, { ...first, sequence: 2, current: "/" }, new Headers(), now + 120000);
    assert.equal(sqlite.prepare("SELECT sequence FROM visitor_sessions WHERE id=?").get(first.id).sequence, 3);
    await api.forgetVisit(runtime, first.id);
    await api.recordVisit(runtime, { ...first, sequence: 4 }, new Headers(), now + 180000);
    report = await api.readVisitors(runtime, 1, null);
    assert.equal(report.total, 1); assert.equal(report.visits[0].id, second.id);
    assert.equal(sqlite.prepare("SELECT data FROM visitor_sessions WHERE id=?").get(first.id).data, "{}");
    await api.recordVisit(runtime, { ...second, sequence: 2, ended: true }, new Headers(), now + 1000);
    report = await api.readVisitors(runtime, 1, null);
    assert.equal(report.total, 1); assert.equal(report.live, 0, "A final short-visit beacon closes presence without losing its history");
  } finally { sqlite.close(); }
});

test("IPstack uses HTTPS, a shared monthly quota and coarse fallback without exposing the key", async () => {
  const { sqlite, db } = visitorDatabase();
  const { visitLocation, publicIp } = loader()("lib/visitors/server.ts");
  const oldFetch = globalThis.fetch; let calls = 0;
  const runtime = { db, cf: { country: "IN", city: "Fallback" }, local: false, key: "private-test-key", geoLimit: 1 };
  globalThis.fetch = async url => { calls++; assert.equal(url.protocol, "https:"); assert.equal(url.hostname, "api.ipstack.com"); return Response.json({ city: "City", country_name: "India" }); };
  try {
    for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "::1", "fc00::1", "::ffff:127.0.0.1", "not-an-ip"]) assert.equal(publicIp(ip), false);
    assert.equal((await visitLocation(runtime, "8.8.8.8")).locationSource, "IPstack");
    const fallback = await visitLocation(runtime, "1.1.1.1");
    assert.equal(fallback.locationSource, "Cloudflare"); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(fallback).includes(runtime.key));
    await visitLocation({ ...runtime, local: true }, "8.8.8.8"); assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; sqlite.close(); }
});

test("visitor API rejects absent consent, privacy signals, cross-origin and oversized payloads", async () => {
  let writes = 0;
  const api = loader({
    "@/lib/request-origin": { requestOriginMatches: req => req.headers.get("origin") === "https://studio.test" },
    "@/lib/visitors/server": { visitorRuntime: async () => ({ enabled: true, local: true }), visitorRateLimited: () => false, recordVisit: async () => writes++ },
  })("app/api/visits/route.ts");
  const valid = { consent: true, id: crypto.randomUUID(), sequence: 1, current: "/work", pages: [{ path: "/work", views: 1, seconds: 0, depth: 20 }] };
  const request = (body, headers = {}) => new Request("https://studio.test/api/visits", { method: "POST", headers: { origin: "https://studio.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await api.POST(request({ ...valid, consent: false }))).status, 400);
  assert.equal((await api.POST(request(valid, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await api.POST(request(valid, { "sec-gpc": "1" }))).status, 204);
  assert.equal((await api.POST(request({ ...valid, extra: "x".repeat(17000) }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await api.POST(request(valid))).status, 204); assert.equal(writes, 1);
});

test("visitor dashboard is owner-only, never available to signed-out or editor accounts", async () => {
  let user = null, reads = 0;
  const api = loader({
    "@/lib/portal/auth": { getPortalUser: async () => user },
    "@/lib/visitors/server": { visitorRuntime: async () => ({}), readVisitors: async () => { reads++; return { visits: [] }; } },
  })("app/api/portal/visitors/route.ts");
  const req = { nextUrl: new URL("https://studio.test/api/portal/visitors") };
  assert.equal((await api.GET(req)).status, 401);
  user = { role: "editor" }; assert.equal((await api.GET(req)).status, 403);
  user = { role: "owner", setup: true }; assert.equal((await api.GET(req)).status, 403);
  assert.equal(reads, 0);
  user = { role: "owner", setup: false }; assert.equal((await api.GET(req)).status, 200); assert.equal(reads, 1);
});

test("contact budgets migrate without losing custom choices and stay with renamed/reordered types", () => {
  const app = loader();
  const { sanitizeContent } = app("lib/content/sanitize.ts");
  const legacy = json("content/site-content.json");
  delete legacy.home.contact.form.projectOptions;
  legacy.home.contact.form.projectTypes = ["Film", "Logo"];
  legacy.home.contact.form.budgets = ["Under ₹50K", "Let's discuss"];
  const migrated = sanitizeContent(legacy);
  const options = migrated.home.contact.form.projectOptions;
  assert.deepEqual(options, [
    { name: "Film", budgets: ["Under ₹50K", "Let's discuss"] },
    { name: "Logo", budgets: ["Under ₹50K", "Let's discuss"] },
  ]);
  options[1].budgets = ["₹10K–₹20K", "Custom quote"];
  options[1].name = "Title logo";
  options.reverse();
  const saved = sanitizeContent(migrated);
  assert.deepEqual(saved.home.contact.form.projectOptions, options);
  assert.deepEqual(sanitizeContent(saved), saved);
  assert.deepEqual(saved.home.contact.form.projectTypes, ["Title logo", "Film"]);
  assert.deepEqual(app("lib/contact/options.ts").budgetsForProject(options, "missing"), []);
});

test("contact options are bounded, sanitized and checked in the portal", () => {
  const app = loader();
  const { contactProjects } = app("lib/contact/options.ts");
  assert.deepEqual(contactProjects({ projectOptions: [null, {}, { name: " Film ", budgets: [" A ", "a", null, ""] }, { name: "film", budgets: ["B"] }] }), [{ name: "Film", budgets: ["A"] }]);
  assert.equal(contactProjects({ projectOptions: Array.from({ length: 80 }, (_, i) => ({ name: `Type ${i}`, budgets: Array.from({ length: 50 }, (_, n) => `Budget ${n}`) })) }).length, 50);
  assert.equal(contactProjects({ projectOptions: [{ name: "Long", budgets: ["a".repeat(150)] }] })[0].budgets[0].length, 100);
  const content = app("lib/content/defaults.ts").defaultContent();
  assert.equal(app("app/portal/validate.ts").contentProblems(content).filter(p => p.path.includes("projectOptions")).length, 0);
  content.home.contact.form.projectOptions = [{ name: "Film", budgets: ["", "A", "a"] }, { name: "film", budgets: [] }];
  const errors = app("app/portal/validate.ts").contentProblems(content);
  for (const path of ["0.budgets", "1.name", "1.budgets"]) assert.ok(errors.some(p => p.path === `home.contact.form.projectOptions.${path}`));
});

const contactEnquiry = { name: "Test Person", email: "test@example.com", phone: "+919876543210", company: "Test Production", projectType: "Film", budget: "Film budget", timeline: "Within a month", message: "Please discuss the artwork for our film." };
const contactChoices = [{ name: "Film", budgets: ["Film budget"] }, { name: "Logo", budgets: ["Logo budget"] }];

test("contact validation requires every visible field and rejects another project's budget", () => {
  const { validateContact } = loader()("lib/contact/validate.ts");
  assert.deepEqual(validateContact(contactEnquiry, contactChoices).errors, {});
  assert.ok(validateContact({ ...contactEnquiry, projectType: "Logo" }, contactChoices).errors.budget);
  assert.ok(validateContact({ ...contactEnquiry, projectType: "Unknown" }, contactChoices).errors.projectType);
  for (const field of Object.keys(contactEnquiry)) {
    for (const missing of [undefined, null, "", " \t\n "]) {
      const errors = validateContact({ ...contactEnquiry, [field]: missing }, contactChoices).errors;
      assert.deepEqual(Object.keys(errors), field === "projectType" ? [field, "budget"] : [field], `${field} cannot be missing or blank; budgets also need a valid project`);
    }
  }
});

test("contact server checks published project budgets before saving or emailing", async () => {
  let saved = 0;
  let unavailable = false;
  const app = loader({
    "@/lib/request-origin": { requestOriginMatches: () => true },
    "@/lib/rate-limit": { isRateLimited: () => false },
    "@/lib/content/store": { getContent: async () => { if (unavailable) throw new Error("Storage unavailable"); return { home: { contact: { form: { projectOptions: contactChoices } } } }; } },
    "@/lib/contact/inbox": { findRecentDuplicate: async () => { saved++; return true; } },
    "@/lib/portal/activity": { clientIp: () => "test" },
    "@/lib/portal/mail": {}, "@/lib/portal/users": {},
  });
  const { POST } = app("app/api/contact/route.ts");
  const request = (body) => new Request("https://example.com/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const field of Object.keys(contactEnquiry)) {
    for (const missing of [undefined, null, "", " \t\n "]) {
      const response = await POST(request({ ...contactEnquiry, [field]: missing }));
      assert.equal(response.status, 422, `${field} is required even when browser checks are bypassed`);
      assert.deepEqual(Object.keys((await response.json()).fields), [field]);
    }
  }
  assert.equal(saved, 0, "Incomplete enquiries never reach storage or email");
  const bad = await POST(request({ ...contactEnquiry, budget: "Logo budget" }));
  assert.equal(bad.status, 422);
  assert.ok((await bad.json()).fields.budget);
  assert.equal(saved, 0);
  assert.equal((await POST(request(contactEnquiry))).status, 200);
  assert.equal(saved, 1);
  unavailable = true;
  assert.equal((await POST(request(contactEnquiry))).status, 503);
  assert.equal(saved, 1, "Never save an enquiry with unverified choices during a storage failure");
});

test("contact form changes budgets, requires all visible fields, and shows accessible inline errors", async (t) => {
  const slots = []; let cursor = 0;
  const state = (initial) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; };
  const content = loader()("lib/content/defaults.ts").defaultContent();
  content.home.contact.form.projectOptions = clone(contactChoices);
  const { Contact } = loader({
    react: { useState: state, useRef: value => state({ current: value })[0] },
    "@/lib/content/context": { useContent: () => content, tx: () => ({}) },
    "@/lib/content/tx": { edSection: () => ({}) },
    "@/components/fx/render-fx": { renderFx: value => value },
    "@/components/SocialLogo": { SocialLogo: () => null },
    "./Contact.module.css": {},
  })("components/sections/Contact.tsx");
  const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  let tree;
  const render = () => { cursor = 0; tree = nodes(Contact()); return id => tree.find(n => n.props?.id === id).props; };
  let ui = render(); assert.equal(ui("budget").disabled, true);
  for (const field of Object.keys(contactEnquiry)) assert.equal(ui(field).required, true, `${field} has required semantics`);
  assert.ok(!ui("website").required, "The hidden anti-spam trap must remain empty");
  const checkPlaceholders = () => {
    for (const id of ["projectType", "budget", "timeline"]) {
      const options = nodes(ui(id).children).filter(n => n.type === "option");
      assert.equal(options[0].props.value, "");
      assert.equal(options[0].props.disabled, true, `${id}: placeholder cannot be selected`);
      assert.ok(!options[0].props.hidden, `${id}: placeholder stays visible in the menu`);
      assert.ok(options.slice(1).every(option => !option.props.disabled), `${id}: real choices remain enabled`);
    }
  };
  checkPlaceholders();
  ui("projectType").onChange({ target: { value: "Film" } });
  ui = render(); assert.equal(ui("budget").disabled, false);
  checkPlaceholders();
  ui("budget").onChange({ target: { value: "Film budget" } });
  ui = render(); assert.equal(ui("budget").value, "Film budget");
  ui("projectType").onChange({ target: { value: "Logo" } });
  ui = render(); assert.equal(ui("budget").value, "");
  checkPlaceholders();
  assert.deepEqual(nodes(ui("budget").children).filter(n => n.type === "option").map(n => n.props.value), ["", "Logo budget"]);
  ui("budget").onChange({ target: { value: "Logo budget" } });
  content.home.contact.form.projectOptions[1].budgets = ["Updated quote"];
  assert.equal(render()("budget").value, "", "Removed choices cannot be submitted from a live preview");
  t.mock.method(globalThis, "FormData", function () {
    return new Map(Object.entries({ ...contactEnquiry, company: "  ", budget: "", timeline: "" }));
  });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Incomplete forms must not submit"); });
  let focused;
  await tree.find(n => n.type === "form").props.onSubmit({
    preventDefault() {},
    currentTarget: { querySelector: selector => ({ focus: () => { focused = selector; } }) },
  });
  ui = render();
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(focused, '[name="company"]', "Focus moves to the first missing field");
  for (const field of ["company", "budget", "timeline"]) {
    assert.equal(ui(field)["aria-invalid"], true);
    assert.equal(ui(field)["aria-describedby"], `err-${field}`);
    assert.equal(ui(`err-${field}`).role, "alert");
    assert.ok(ui(`err-${field}`).children);
  }
});

test("contact placeholders are grey without dimming real dropdown choices", () => {
  const css = readFileSync(path.join(root, "components/sections/Contact.module.css"), "utf8");
  assert.match(css, /\.field select:has\(option\[value=""\]:checked\),\s*\.field select option:disabled\s*\{\s*color: #aaa;/);
  assert.match(css, /\.field select option:not\(:disabled\)\s*\{\s*color: var\(--ivory\);/);
});

test("tour and brand services stay distinct, including migrated saved content and enquiry choices", () => {
  const app = loader();
  const { sanitizeContent } = app("lib/content/sanitize.ts");
  const saved = json("content/site-content.json");
  const current = sanitizeContent(saved);
  const names = ["Theatrical Films", "OTT/Television", "Indie Films", "Music Videos", "Title Designs", "Logo Designs", "Musical Tours", "Brand Promotions"];
  for (const content of [current, app("lib/content/defaults.ts").defaultContent()]) {
    assert.deepEqual(content.services.map(service => service.name), names);
    assert.deepEqual(content.home.contact.form.projectOptions.map(project => project.name), names);
    assert.deepEqual(content.home.contact.form.projectTypes, names);
    for (const project of content.home.contact.form.projectOptions) {
      assert.deepEqual(project.budgets, saved.home.contact.form.budgets, "Existing budget ranges are preserved");
      const result = app("lib/contact/validate.ts").validateContact({ ...contactEnquiry, projectType: project.name, budget: project.budgets[0] }, content.home.contact.form.projectOptions);
      assert.deepEqual(result.errors, {}, `${project.name} can be submitted`);
    }
  }
  const legacy = clone(saved);
  legacy.services.splice(7, 1);
  Object.assign(legacy.services[6], {
    name: "Musical Tours/Brand Promotions",
    description: "Visual identities and promotional artwork for musical tours, live events and brand campaigns.",
    deliverables: ["Tour posters", "Event artwork", "Brand campaigns", "Promotional artwork", "Social media creatives"],
    sample: "/images/uploads/tour.png", details: "Custom tour details", sampleZoom: 1.2,
  });
  legacy.home.contact.form.projectTypes.splice(6, 2, "Musical Tours/Brand Promotions");
  const migrated = sanitizeContent(legacy);
  assert.equal(migrated.services.length, 8);
  assert.deepEqual(migrated.services.map(service => service.name), names);
  assert.equal(migrated.services[6].sample, "/images/uploads/tour.png");
  assert.equal(migrated.services[6].details, "Custom tour details");
  assert.equal(migrated.services[6].sampleZoom, 1.2);
  assert.equal(migrated.services[7].sample, "", "The brand card does not repeat tour artwork");
  assert.deepEqual(migrated.services[7].deliverables, saved.services[7].deliverables);
  assert.deepEqual(migrated.home.contact.form.projectTypes, names);
  assert.deepEqual(sanitizeContent(migrated), migrated, "The split is stable after saving");
  const partlySplit = clone(legacy);
  partlySplit.services.push({ ...saved.services[6], sample: "/images/uploads/new-tour.png" }, saved.services[7]);
  const preserved = sanitizeContent(partlySplit);
  assert.deepEqual(preserved.services.map(service => service.name), names, "No combined card survives when both separate cards already exist");
  assert.equal(preserved.services[6].sample, "/images/uploads/new-tour.png");
  assert.ok(preserved.services[6].gallery.some(image => image.src === "/images/uploads/tour.png"), "Legacy artwork remains available in the tour gallery");
  migrated.services.pop();
  assert.equal(sanitizeContent(migrated).services.length, 7, "Intentional deletions remain deleted");
  legacy.services[6].name = "Custom tour service";
  legacy.services.push({ number: "08", name: "Brand Promotions", description: "Custom brand service", deliverables: [], sample: "/images/uploads/brand.png" });
  assert.equal(sanitizeContent(legacy).services.length, 8, "Independently edited cards are never silently removed");
  assert.equal(sanitizeContent(legacy).services[7].sample, "/images/uploads/brand.png");
});

test("projector density follows image brightness bands without extinguishing the lamp", () => {
  const { discImageBands } = loader()("lib/content/disc.ts");
  const bands = discImageBands([0,0,0,255, 64,64,64,255, 128,128,128,255, 255,255,255,255], 4);
  assert.equal(bands[0], .35);
  assert.ok(Math.abs(bands[3] - 1) < 1e-12);
  assert.ok(bands[0] < bands[1] && bands[1] < bands[2] && bands[2] < bands[3]);
  assert.deepEqual(discImageBands([255,255,255,0], 1), [.35,.35,.35,.35]);
  assert.deepEqual(discImageBands([], 0), [.35,.35,.35,.35]);
  assert.ok(Math.abs(discImageBands([255,255,255,255, 0,0,0,255], 1)[0] - (.35 + .65 * Math.sqrt(.5))) < 1e-12);
});

function uploadHarness(send) {
  const slots=[];let cursor=0;const cleanups=[];
  const state=initial=>{const at=cursor++;if(!(at in slots))slots[at]=initial;return [slots[at],v=>{slots[at]=typeof v==='function'?v(slots[at]):v}];};
  const {useUploads}=loader({react:{useState:state,useRef:value=>state({current:value})[0],useEffect:fn=>{if(!cleanups.length)cleanups.push(fn());}}})("app/portal/use-uploads.ts");
  function UploadHarness() { cursor=0;return useUploads("image",send); }
  return {render:UploadHarness,close(){cleanups.forEach(fn=>fn?.());}};
}

test("breadcrumbs preserve entry points, trim revisited parents, and bound long journeys", () => {
  const { defaultTrail, advanceTrail, readTrail, TRAIL_LIMIT } = loader()("lib/navigation-trail.ts");
  assert.deepEqual(defaultTrail("/work/dacoit"), ["/", "/work", "/work/dacoit"]);
  assert.deepEqual(defaultTrail("/process/sketchboards"), ["/", "/#process", "/process/sketchboards"]);
  let paths = advanceTrail(["/", "/#collaborations"], "/work/dacoit");
  assert.deepEqual(paths, ["/", "/#collaborations", "/work/dacoit"]);
  assert.deepEqual(advanceTrail(paths, "/#collaborations"), ["/", "/#collaborations"]);
  assert.deepEqual(readTrail(paths, "/work/dacoit"), paths);
  assert.equal(readTrail(paths, "/work/another"), null, "History from another page cannot redirect this one");
  for (let i = 0; i < 30; i++) paths = advanceTrail(paths, `/work/film-${i}`);
  assert.equal(paths.length, TRAIL_LIMIT);
  assert.equal(paths[0], "/");
  assert.equal(paths.at(-1), "/work/film-29");
  assert.deepEqual(advanceTrail(paths, "/"), ["/"]);
});

test("breadcrumb destinations reject unsafe URLs and preserve preview before the hash", () => {
  const { trailPath, readTrail, trailHref, hashSection } = loader()("lib/navigation-trail.ts");
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/portal", "/api/contact", "/work/%2e%2e", {}, null]) assert.equal(trailPath(value), null);
  assert.equal(readTrail(["/", "//evil.test"], "//evil.test"), null);
  assert.equal(readTrail(["/", "/work", "/work"], "/work"), null);
  assert.equal(trailHref("/#collaborations", true), "/?portal-preview#collaborations");
  assert.equal(trailHref("/work/dacoit", true), "/work/dacoit?portal-preview");
  assert.equal(trailHref("/work", false), "/work");
  assert.equal(hashSection("#%E0%A4%A"), "");
  assert.equal(hashSection("#work"), "work");
});

test("upload controls reject rapid duplicate starts and recover after failure", async () => {
  let finish;let calls=0;const completed=[];
  const ui=uploadHarness(async()=>{calls++;return new Promise(resolve=>{finish=resolve});});
  const file={name:"photo.png",type:"image/png",size:10};
  const first=ui.render().start([file],value=>completed.push(value));
  await ui.render().start([file],value=>completed.push(value));
  assert.equal(calls,1);finish("one");await first;
  assert.deepEqual(completed,["one"]);assert.equal(ui.render().state.busy,false);
  const failed=uploadHarness(async()=>{throw new Error("Connection interrupted")});
  await failed.render().start([file],()=>assert.fail("Failed upload applied"));
  assert.equal(failed.render().state.busy,false);assert.match(failed.render().state.errors[0],/Connection interrupted/);
});

test("a site-wide upload failure stops the folder after one file", async () => {
  const { UploadBatchError } = loader()("app/portal/upload.ts");
  let calls = 0;
  const ui = uploadHarness(async () => { calls++; throw new UploadBatchError("The server returned an unexpected response."); });
  const files = ["39.jpg", "4.jpg", "16.jpg"].map(name => ({ name, type: "image/jpeg", size: 10 }));
  await ui.render().start(files, () => assert.fail("Failed upload applied"));
  assert.equal(calls, 1);
  assert.match(ui.render().state.errors[0], /39\.jpg.*unexpected response/);
  assert.match(ui.render().state.errors[1], /2 remaining files were not sent/);
});

test("upload transport reports a non-JSON server response instead of a generic failure", async () => {
  const { postFile, UploadBatchError } = loader()("app/portal/upload.ts");
  const previous = globalThis.XMLHttpRequest;
  class FakeXhr {
    upload = {};
    status = 200;
    responseText = "<html>Sign in</html>";
    open() {}
    send() { this.onload(); }
  }
  globalThis.XMLHttpRequest = FakeXhr;
  try {
    await assert.rejects(postFile("/api/portal/media", new File(["image"], "39.jpg")), error => error instanceof UploadBatchError && /returned a page/.test(error.message));
  } finally {
    globalThis.XMLHttpRequest = previous;
  }
});

test("closing an editor prevents late uploads changing its draft or starting the next file", async () => {
  let finish,progress;let calls=0;const completed=[];
  const ui=uploadHarness((_,onProgress)=>{calls++;progress=onProgress;return new Promise(resolve=>{finish=resolve});});
  const file={name:"photo.png",type:"image/png",size:10};
  const run=ui.render().start([file,file],value=>completed.push(value));
  progress(150);assert.equal(ui.render().state.percent,100);
  ui.close();const before=ui.render().state;
  progress(50);finish("late");await run;
  assert.equal(calls,1);assert.deepEqual(completed,[]);assert.equal(ui.render().state,before);
});

test("legacy filenames cannot crash portal labels and exclude URL query strings", () => {
  const {fileName}=loader()("app/portal/image-info.ts");
  assert.equal(fileName("/images/my%20photo.png?v=123#test"),"my photo.png");
  assert.equal(fileName("/images/bad%E0%A4%A.png"),"bad%E0%A4%A.png");
});

test("video cards preserve photo defaults and safely retain video metadata through saves and reorder", () => {
  const read = loader();
  const { cleanItem } = read("lib/content/process.ts");
  assert.equal(cleanItem({ image: "/images/example.jpg" }).mediaType, "image");
  assert.equal(cleanItem({ mediaType: "video", video: "https://outside.invalid/movie.mp4" }).video, "");
  assert.equal(cleanItem({ mediaType: "video", video: "/media/videos/../file.mp4" }).video, "");
  const content = json("content/site-content.json");
  const item = { mediaType: "video", video: "/media/videos/test-clip.mp4", videoWidth: 1080, videoHeight: 1920, title: "BTS", note: "Caption stays below", image: "" };
  content.home.process.cards[0].items = [item, { title: "A photo", image: "" }];
  const saved = read("lib/content/sanitize.ts").sanitizeContent(content);
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.process.cards.0.items", 0, 1);
  assert.equal(moved.home.process.cards[0].items[1].video, item.video);
  assert.equal(moved.home.process.cards[0].items[1].videoHeight, 1920);
  assert.equal(moved.home.process.cards[0].items[1].note, item.note);
});

test("video signatures and byte ranges reject invalid input and support browser seeking", () => {
  const { videoType, videoRange } = loader()("lib/video.ts");
  const mp4 = Buffer.alloc(32); mp4.write("ftypisom", 4);
  assert.equal(videoType(mp4), "mp4");
  mp4.write("avif", 8); assert.equal(videoType(mp4), null);
  assert.equal(videoType(Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]), Buffer.from("----matroska----")])), "mkv");
  assert.equal(videoType(Buffer.from("a file named movie.mp4")), null);
  assert.deepEqual(videoRange("bytes=20-39", 100), {start:20,end:39});
  assert.deepEqual(videoRange("bytes=20-", 100), {start:20,end:99});
  assert.deepEqual(videoRange("bytes=-20", 100), {start:80,end:99});
  assert.deepEqual(videoRange("bytes=20-999", 100), {start:20,end:99});
  for(const bad of ["bytes=100-", "bytes=30-20", "bytes=-0", "bytes=0-4,8-10", "bytes=--", "bytes=9007199254740992-"]) assert.equal(videoRange(bad,100), "invalid");
});

test("video upload body has a hard bound and rejects truncated transfers", async () => {
  const { readVideoBody } = loader()("lib/video.ts");
  const body = values => new ReadableStream({ start(c) { values.forEach(v=>c.enqueue(new Uint8Array(v))); c.close(); } });
  assert.deepEqual([...await readVideoBody(body([[1,2],[3,4]]),4)], [1,2,3,4]);
  await assert.rejects(readVideoBody(body([[1,2,3,4,5]]),4), /size changed/);
  await assert.rejects(readVideoBody(body([[1,2]]),4), /incomplete/);
});

test("video serving streams only requested bytes and HEAD never opens a stream", async () => {
  const requests=[];
  const route=loader({"@/lib/storage":{store:async()=>({size:async()=>100,getStream:async(key,range)=>{
    requests.push({key,range});return {body:new ReadableStream({start(c){c.enqueue(new Uint8Array(range?.length??100));c.close();}})};
  }})}})("app/media/videos/[name]/route.ts");
  const ctx={params:Promise.resolve({name:"test.mp4"})};
  const res=await route.GET(new Request("http://local/media/videos/test.mp4",{headers:{Range:"bytes=10-19"}}),ctx);
  assert.equal(res.status,206);assert.equal(res.headers.get("content-range"),"bytes 10-19/100");assert.equal((await res.arrayBuffer()).byteLength,10);
  assert.deepEqual(requests[0].range,{offset:10,length:10});
  const head=await route.HEAD(new Request("http://local/media/videos/test.mp4",{method:"HEAD"}),ctx);
  assert.equal(head.headers.get("content-length"),"100");assert.equal(requests.length,1);
  const bad=await route.GET(new Request("http://local/media/videos/test.mp4",{headers:{Range:"bytes=200-"}}),ctx);
  assert.equal(bad.status,416);assert.equal(requests.length,1);
});

test("video uploads require sign-in, same origin, bounded bodies and valid containers", async () => {
  let user=null;let origin=true;const writes=[];
  const route=loader({
    "next/server":{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    "@/lib/portal/auth":{getPortalUser:async()=>user},
    "@/lib/request-origin":{requestOriginMatches:()=>origin},
    "@/lib/portal/activity":{logActivity:async()=>{}},
    "@/lib/storage":{store:async()=>({putBytes:async(...args)=>writes.push(args)})},
  })("app/api/portal/videos/route.ts");
  const bytes=Buffer.alloc(32);bytes.write("ftypisom",4);
  const req=(body=bytes,size=body.length)=>new Request("http://local/api/portal/videos",{method:"POST",headers:{Origin:"http://local","Content-Length":String(size)},body});
  assert.equal((await route.POST(req())).status,401);
  user={id:"owner"};origin=false;assert.equal((await route.POST(req())).status,403);
  origin=true;assert.equal((await route.POST(req(bytes,50*1024*1024+1))).status,413);
  assert.equal((await route.POST(req(Buffer.alloc(32)))).status,400);assert.equal(writes.length,0);
  const success=await route.POST(req());assert.equal(success.status,200);assert.match((await success.json()).src,/^\/media\/videos\/[a-z0-9-]+\.mp4$/);
  assert.equal(writes.length,1);assert.equal(writes[0][2],"video/mp4");
  // Exercise the inclusive 50 MB boundary with a chunked container fixture, without storing a real file.
  const chunk = new Uint8Array(1024*1024);
  let sent = 0;
  const body = new ReadableStream({pull(controller) {
    if (sent === 50) { controller.close(); return; }
    if (sent++ === 0) { const first=chunk.slice();first.set(bytes);controller.enqueue(first); }
    else controller.enqueue(chunk);
  }});
  const boundary = await route.POST({headers:new Headers({Origin:"http://local","Content-Length":String(50*1024*1024)}),body});
  assert.equal(boundary.status,200);
  assert.equal(writes.length,2);assert.equal(writes[1][1].byteLength,50*1024*1024);
});

test("section editors never repeat a field path or render duplicate React keys", () => {
  const { CONTENT_PAGES } = loader()("app/portal/content-schema.ts");
  const check = (fields) => {
    assert.equal(new Set(fields.map((f) => f.path)).size, fields.length);
    for (const field of fields) if (field.kind === "list") check(field.fields);
  };
  for (const page of Object.values(CONTENT_PAGES)) for (const section of page.sections) check(section.fields);
});

test("disc settings migrate old slates, clamp invalid controls, and retain artwork and ordering", () => {
  const read = loader();
  const { DISC_DEFAULTS, sanitizeDisc, sectorSize, discAimProfileForWidth } = read("lib/content/disc.ts");
  assert.deepEqual(sanitizeDisc(undefined), DISC_DEFAULTS);
  assert.deepEqual(sanitizeDisc({ spinSpeed: NaN, bloom: "high" }), DISC_DEFAULTS);
  assert.equal(sanitizeDisc({ glassVersion: 1, discTilt: -999 }).discTilt, -30);
  assert.equal(sanitizeDisc({ spinSpeed: 0 }).spinSpeed, 0);
  assert.equal(sanitizeDisc({ slotGap: 100 }).slotGap, 12);
  assert.equal(sanitizeDisc({}).projectorSide, -1, "Existing slates receive the left-hand projector");
  assert.equal(sanitizeDisc({ projectorSide: -100 }).projectorSide, -1);
  assert.equal(sanitizeDisc({ glassVersion: 1, projectorSide: .4 }).projectorSide, 1);
  assert.equal(sanitizeDisc({ projectorSide: NaN }).projectorSide, -1);
  assert.equal(discAimProfileForWidth(390), "mobile");
  assert.equal(discAimProfileForWidth(640), "mobile");
  assert.equal(discAimProfileForWidth(641), "tablet");
  assert.equal(discAimProfileForWidth(1024), "tablet");
  assert.equal(discAimProfileForWidth(1025), "desktop");
  assert.equal(discAimProfileForWidth(Number.NaN), "desktop");
  assert.equal(sanitizeDisc({ glassVersion: 1, mobileFocusAngle: -999 }).mobileFocusAngle, -180);
  assert.equal(sanitizeDisc({ glassVersion: 1, tabletOriginOffsetY: 9 }).tabletOriginOffsetY, .25);
  for (const count of [0, 1, 2, 12, 16, 100]) {
    const { step, width } = sectorSize(count, 12);
    assert.ok(width > 0 && width < step);
    assert.ok(Math.abs(step * Math.max(1, count) - Math.PI * 2) < 1e-10);
  }
  const { sanitizeIntroSettings } = read("lib/intro/settings.ts");
  const legacy = json("content/intro-settings.json");
  // Exercise a legacy slate independently of the owner's current saved controls.
  delete legacy.proofTable.disc;
  const migrated = sanitizeIntroSettings(legacy);
  assert.deepEqual(migrated.proofTable.disc, DISC_DEFAULTS);
  assert.deepEqual(migrated.proofTable.items.map(it => [it.src, it.slug]), legacy.proofTable.items.map(it => [it.src, it.slug]));
  migrated.proofTable.disc.spinSpeed = -0.2;
  assert.equal(sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.disc.spinSpeed, -0.2);
  const custom = { ...DISC_DEFAULTS, lightIntensity: 0, saturation: 0, vibrance: 0.7, slotOpacity: 0.5, slotSize: 0.8, slotBlur: 0, glowRadius: 0.9, glowThreshold: 1.2, unfocusedBrightness: 0.4 };
  migrated.proofTable.disc = custom;
  migrated.proofTable.items[0].tint = "#55aaff";
  migrated.proofTable.items[0].titleColor = "#123456";
  migrated.proofTable.items[0].titleOriginalColor = true;
  migrated.proofTable.items[0].titleGlowColor = "#abcdef";
  migrated.proofTable.items[0].titleGlowIntensity = 1.35;
  const roundTrip = sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(roundTrip.proofTable.disc, custom);
  assert.equal(roundTrip.proofTable.items[0].tint, "#55aaff");
  assert.equal(roundTrip.proofTable.items[0].titleColor, "#123456");
  assert.equal(roundTrip.proofTable.items[0].titleOriginalColor, true);
  assert.equal(roundTrip.proofTable.items[0].titleGlowColor, "#abcdef");
  assert.equal(roundTrip.proofTable.items[0].titleGlowIntensity, 1.35);
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /uniform float useTitleColour, useOriginalColour/);
  assert.match(scene, /c=mix\(c,tex\.rgb,useOriginalColour\)/, "Original mode bypasses shared artwork colour grading");
  migrated.proofTable.items[0].titleColor = "red";
  migrated.proofTable.items[0].titleGlowColor = "#xyzxyz";
  migrated.proofTable.items[0].titleGlowIntensity = 99;
  const boundedTitle = sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.items[0];
  assert.equal(boundedTitle.titleColor, undefined);
  assert.equal(boundedTitle.titleGlowColor, undefined);
  assert.equal(boundedTitle.titleGlowIntensity, 2);
  assert.equal(sanitizeDisc({ saturation: 999, slotSize: -4 }).saturation, 2);
  assert.equal(sanitizeDisc({ saturation: 999, slotSize: -4 }).slotSize, 0.7);
  assert.equal(sanitizeDisc({ spinSpeed: -0.2 }).saturation, 1, "Earlier disc documents receive new colour defaults");
  const silver = sanitizeDisc({ discTilt: -65, discRoll: -65, originOffsetY: .2, saturation: 1.4, spinSpeed: -.2 });
  assert.equal(silver.discRoll, DISC_DEFAULTS.discRoll, "Legacy metal poses migrate to the broad glass composition");
  assert.equal(silver.discTilt, DISC_DEFAULTS.discTilt);
  assert.equal(silver.originOffsetY, 0);
  assert.equal(silver.saturation, 1.4, "Colour and motion preferences survive the pose migration");
  assert.equal(silver.spinSpeed, -.2);
  assert.deepEqual(sanitizeDisc(silver), silver, "Migration runs once and is idempotent");
  assert.equal(sanitizeDisc({ rayStyle: 1.6 }).rayStyle, 2);
  assert.equal(sanitizeDisc({ rayStyle: -1 }).rayStyle, 0);
  for (const rayStyle of [0, 1, 2]) {
    migrated.proofTable.disc = { ...custom, rayStyle, discRoll: -50, rayElevation: 3, raySpread: 1.5, rayPrism: 0.8 };
    assert.deepEqual(sanitizeIntroSettings(JSON.parse(JSON.stringify(migrated))).proofTable.disc, migrated.proofTable.disc);
  }
  const editor = readFileSync(path.join(root, "app/portal/ProofTableEditor.tsx"), "utf8");
  assert.match(editor, /Desktop beam position · 1025px\+/);
  assert.match(editor, /Tablet beam position · 641–1024px/);
  assert.match(editor, /Mobile beam position · up to 640px/);
});

test("glass circle arrives fully visible and settles into a responsive background arc", () => {
  const { glassCircleComposition } = loader()("lib/content/disc.ts");
  for (const [w, h] of [[1440,560],[820,540],[390,820],[280,680]]) {
    const start = glassCircleComposition(w,h,0), end = glassCircleComposition(w,h,1);
    assert.deepEqual(glassCircleComposition(w,h,.1),start,"Establish the full circle before zooming");
    const rx = start.radius*h/w;
    assert.ok(start.x-rx >= 0 && start.x+rx <= 1, "Initial full circle fits horizontally");
    assert.ok(start.y-start.radius >= 0 && start.y+start.radius <= 1);
    assert.ok(end.radius > start.radius && end.y < start.y, "Circle approaches and moves behind the heading");
    let previous = start.radius;
    for (let i=1;i<=100;i++) {
      const pose=glassCircleComposition(w,h,i/100);
      assert.ok(pose.radius >= previous);
      previous=pose.radius;
    }
    assert.deepEqual(glassCircleComposition(w,h,-1),start);
    assert.deepEqual(glassCircleComposition(w,h,2),end);
  }
});

test("glass scene feathers every edge into transparency without an extra rendering pass", () => {
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(source, /float sideX=mix\(vUv.x,1\.-vUv.x,mirror\)/);
  assert.match(source, /softBoundary\(sideX,edgeFeather.x\)\*\(1\.-smoothstep\(\.96,1\.,sideX\)\)/);
  assert.match(source, /softBoundary\(vUv.y,edgeFeather.y\*\.3\)\*\(1\.-smoothstep\(\.95,1\.,vUv.y\)\)/);
  assert.match(source, /return t\*t\*t\*\(t\*\(t\*6\.-15\.\)\+10\.\)/);
  assert.match(source, /const feather = discViewportFeather\(width, height\)/);
  assert.match(source, /edgeFeather.value.set\(feather.side, feather.bottom\)/);
  assert.match(source, /gl_FragColor\*=frame\*readable\*outgoing/, "Fade premultiplied colour and alpha, not a black overlay");
  assert.match(source, /composer.addPass\(renderPass\); composer.addPass\(bloom\); composer.addPass\(output\); composer.addPass\(antialias\)/);
});

test("glass left and bottom blend softly across device sizes without obscuring the main arc", () => {
  const { discViewportFeather, glassEase } = loader()("lib/content/disc.ts");
  const smooth = (a,b,x) => {const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  for (const [width,height] of [[320,680],[390,820],[640,820],[641,430],[820,466],[1024,582],[1440,818],[1920,1080],[3840,2160]]) {
    const feather = discViewportFeather(width,height);
    assert.ok(feather.side > .04 && feather.side <= .24);
    assert.ok(feather.bottom > 0 && feather.bottom <= .20);
    assert.ok(feather.side*width <= 240+1e-9 && feather.bottom*height <= 110+1e-9);
    const frame = (x,y,mirror=false) => {
      const side=mirror ? 1-x : x;
      return glassEase(side/feather.side)*(1-smooth(.96,1,side))*glassEase(y/feather.bottom)*(1-smooth(.92,1,y));
    };
    for (const mirror of [false,true]) {
      for (const [x,y] of [[0,.5],[1,.5],[.5,0],[.5,1]]) assert.equal(frame(x,y,mirror),0);
      assert.equal(frame(mirror ? .07 : .93,.9,mirror),1,"Upper/outer arc remains visible");
      assert.equal(frame(.5,.22,mirror),1,"Main lower sweep is not masked");
    }
    assert.ok(frame(24/width,.5)<.3,"Artwork is already faint 24 CSS pixels from the left boundary");
    assert.equal(frame(feather.side/2,.5),.5);
    assert.equal(frame(.5,feather.bottom/2),.5);
    assert.equal(frame(feather.side/2,feather.bottom/2),.25,"Corner blends both axes");
    assert.ok(frame(.5,feather.bottom*.001)<1e-7,"No visible step at the bottom");
    let previous=0;
    for(let i=0;i<=100;i++) {
      const alpha=frame(feather.side*i/100,.5);
      assert.ok(alpha>=previous && alpha<=1,"Continuous monotonic fade without a dark band");
      previous=alpha;
    }
  }
  for(const size of [0,-1,NaN,Infinity]) {
    const feather=discViewportFeather(size,size);
    assert.ok(Number.isFinite(feather.side) && feather.side>0);
    assert.ok(Number.isFinite(feather.bottom) && feather.bottom>0);
  }
});

test("glass framing follows the screen aspect ratio independently of copy", () => {
  const { glassCircleComposition } = loader()("lib/content/disc.ts");
  const tablet = glassCircleComposition(930, 540, 1);
  assert.ok(tablet.y < 0 && tablet.radius > 1, "An oversized circle centred above the stage creates the sweeping arc");
  assert.ok(Math.abs(glassCircleComposition(930, 540, 0).x - .65) < 1e-9, "Arrival remains unchanged");
  for (const width of [1024, 1025, 1440, 1920]) {
    const pose = glassCircleComposition(width, width * 540 / 930, 1);
    for (const key of ["x", "y", "radius", "reveal"]) {
      assert.ok(Math.abs(pose[key] - tablet[key]) < 1e-9, "Same aspect ratio preserves proportions at every size");
    }
  }
  const phone = glassCircleComposition(390, 820, 1);
  for (const [key, value] of Object.entries({ x: -.35, y: .02, radius: .85, reveal: 1 })) {
    assert.ok(Math.abs(phone[key] - value) < 1e-9);
  }
});

test("glass entrance rotation eases into uninterrupted saved-speed rotation", () => {
  const { glassArrivalSpinMultiplier } = loader()("lib/content/disc.ts");
  assert.equal(glassArrivalSpinMultiplier(0), .6);
  assert.equal(glassArrivalSpinMultiplier(.24), 2.4);
  assert.equal(glassArrivalSpinMultiplier(1), 1);
  assert.equal(glassArrivalSpinMultiplier(2), 1);
  let previous = .6;
  for (let i = 0; i <= 100; i++) {
    const speed = glassArrivalSpinMultiplier(i / 100);
    assert.ok(speed >= .6 && speed <= 2.4, "Never stops, reverses or overspeeds");
    assert.ok(i <= 24 ? speed >= previous : speed <= previous, "Gentle acceleration followed by a smooth landing");
    previous = speed;
  }
  assert.ok(glassArrivalSpinMultiplier(.999) - 1 < .00001, "No speed jump at landing");
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /renderedControls.spinSpeed \* arrivalSpin \* glassEase\(spinBlend\) \* dt/);
  assert.match(scene, /if \(!motion.matches && !paused\)/);
});

test("glass entrance and resume fades are bounded and ease at both ends without extra buffers", () => {
  const { glassArrivalOpacity, glassEase } = loader()("lib/content/disc.ts");
  assert.equal(glassArrivalOpacity(0), 0);
  assert.equal(glassArrivalOpacity(-1), 0);
  assert.equal(glassArrivalOpacity(.22), 1);
  assert.equal(glassArrivalOpacity(2), 1);
  assert.ok(glassArrivalOpacity(.001) < .00001, "No initial opacity flash");
  let last = 0;
  for (let i = 0; i <= 100; i++) {
    const alpha = glassArrivalOpacity(i / 100);
    assert.ok(alpha >= last && alpha <= 1);
    last = alpha;
  }
  assert.equal(glassEase(0), 0);
  assert.equal(glassEase(1), 1);
  assert.ok(glassEase(.001) < .00001 && 1 - glassEase(.999) < .00001);
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /gl_FragColor\*=frame\*readable\*outgoing\*entranceOpacity/);
  assert.match(scene, /motion.matches \? 1 : glassArrivalOpacity\(arrival\)/);
  assert.match(scene, /if \(!value\) spinBlend = 0/);
  assert.equal((scene.match(/composer.addPass\(/g) ?? []).length, 4, "Fades reuse the existing final pass");
});

test("glass projector enters diagonally from above, mirrors correctly and never exposes its source", () => {
  const { glassProjectorOrigin } = loader()("lib/content/disc.ts");
  for (const width of [320,390,640,820,1024,1440]) {
    const left=glassProjectorOrigin(width,-1),right=glassProjectorOrigin(width,1);
    assert.ok(Math.abs(left.x+right.x-1)<1e-9);
    assert.equal(left.y,right.y);
    assert.ok(left.y<0);
    for (const x of [-.25,0,.25]) for (const y of [-.25,0,.25]) {
      assert.ok(glassProjectorOrigin(width,-1,x,y).y<=-.035);
      assert.ok(glassProjectorOrigin(width,1,x,y).y<=-.035);
    }
  }
  assert.equal(glassProjectorOrigin(1440,-1).x,.3);
  assert.equal(glassProjectorOrigin(390,-1).x,-.1);
});

test("title regions stay separated inside the glass rim", () => {
  const { discPanelLayout } = loader()("lib/content/disc.ts");
  for (let count = 1; count <= 16; count++) for (const gap of [0.5, 12]) for (const size of [0.7, 1]) {
    const panel = discPanelLayout(count, gap, size);
    assert.ok(panel.inner > 0.22);
    assert.equal(panel.innerHalfWidth, panel.outerHalfWidth, "Transparent PNGs are never warped into wedges");
    assert.ok(Math.hypot(panel.outer, panel.outerHalfWidth) < 1, "Title pixels stay inside the rim");
    assert.ok(Math.atan2(panel.innerHalfWidth, panel.inner) < panel.step / 2, "Adjacent titles cannot overlap");
    assert.ok(Math.abs(panel.step * count - Math.PI * 2) < 1e-10, "Adding titles redistributes them equally");
  }
});

test("title spacing changes the artwork footprint without moving its centre or the glass", () => {
  const { discPanelLayout } = loader()("lib/content/disc.ts");
  const original = discPanelLayout(8, 3, 1);
  assert.ok(Math.abs(original.inner - .66) < 1e-12);
  assert.ok(Math.abs(original.outer - .94) < 1e-12);
  assert.ok(Math.abs(original.innerHalfWidth - .1092) < 1e-12);
  for (let count = 1; count <= 8; count++) for (const size of [.7, 1]) {
    let previous = Infinity;
    for (const gap of [.5, 3, 6, 9, 12]) {
      const panel = discPanelLayout(count, gap, size);
      const footprint = Math.hypot((panel.outer - panel.inner) / 2, panel.innerHalfWidth);
      assert.ok(footprint < previous, "Every increase of the gap visibly reduces the title footprint");
      previous = footprint;
      assert.ok(Math.abs((panel.inner + panel.outer) / 2 - .8) < 1e-12);
      assert.ok(.8 + footprint < 1, "Any artwork rotation remains inside the glass rim");
      assert.ok(footprint < .8 * Math.sin(Math.min(Math.PI / 2, panel.step / 2)), "Rotated neighbouring titles cannot overlap");
    }
  }
});

test("new disc titles fit their visible aspect within a rotation-safe slot", () => {
  const { discPanelLayout, discFittedTitleLayout, discTitleInkBounds } = loader()("lib/content/disc.ts");
  for (const count of [1, 2, 5, 8]) for (const gap of [.5, 3, 12]) for (const aspect of [.15, .5, 1, 1.28, 3, 8]) {
    const panel = discPanelLayout(count, gap, 1);
    const fitted = discFittedTitleLayout(panel, aspect);
    const footprint = Math.hypot((fitted.outer - fitted.inner) / 2, fitted.innerHalfWidth);
    assert.ok(Math.abs(fitted.aspect - aspect) < 1e-10);
    assert.ok(Math.abs(footprint - Math.hypot((panel.outer - panel.inner) / 2, panel.innerHalfWidth)) < 1e-10);
    assert.ok(Math.abs((fitted.inner + fitted.outer) / 2 - .8) < 1e-10);
    assert.ok(.8 + footprint < 1, "Every rotation stays inside the disc");
    assert.ok(footprint < .8 * Math.sin(Math.min(Math.PI / 2, panel.step / 2)), "Titles cannot touch adjacent slots");
  }
  const pixels = new Uint8Array(40 * 20 * 4);
  for (let y = 7; y < 13; y++) for (let x = 10; x < 30; x++) pixels[(y * 40 + x) * 4 + 3] = 255;
  assert.deepEqual(discTitleInkBounds(pixels, 40, 20), { x: 8, y: 5, width: 24, height: 10 });
  assert.deepEqual(discTitleInkBounds(new Uint8Array(4 * 4 * 4), 4, 4), { x: 0, y: 0, width: 4, height: 4 });
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /slot\.titleLayout = discFittedTitleLayout\(layout, slot\.imageAspect\)/);
  assert.match(scene, /discTitleInkBounds\(ctx\.getImageData/);
  assert.match(scene, /clearSlots\(new Set\(\[\.\.\.retained\.values\(\)\]\.map\(entry => entry\.canvas\)\)\)/);
  assert.match(scene, /if \(!images\[i\]\.src \|\| slots\[i\]\.loaded\) continue/);
  assert.match(scene, /slot\.image\.visible = slot\.loaded && titleOpacity > 0/);
});

test("title rotation persists with bounded per-title overrides and unchanged legacy defaults", () => {
  const read = loader();
  const { sanitizeDisc } = read("lib/content/disc.ts");
  const { sanitizeIntroSettings } = read("lib/intro/settings.ts");
  for (const [input, expected] of [[undefined, 0], [NaN, 0], [Infinity, 0], ["45", 0], [-999, -180], [999, 180], [35, 35]]) {
    assert.equal(sanitizeDisc({ slotRotation: input }).slotRotation, expected);
  }
  const settings = sanitizeIntroSettings(json("content/intro-settings.json"));
  const base = settings.proofTable.items[0];
  settings.proofTable.disc.slotRotation = 35;
  for (const [input, expected] of [[undefined, undefined], [NaN, undefined], [Infinity, undefined], ["45", undefined], [-999, -180], [999, 180], [0, 0], [-45, -45]]) {
    settings.proofTable.items = [{ ...base, titleRotation: input }];
    const sanitized = sanitizeIntroSettings(settings);
    assert.equal(sanitized.proofTable.items[0].titleRotation, expected);
    assert.equal(sanitized.proofTable.items[0].src, base.src);
    assert.equal(sanitized.proofTable.disc.slotRotation, 35);
    const saved = sanitizeIntroSettings(JSON.parse(JSON.stringify(sanitized)));
    assert.deepEqual(saved.proofTable, sanitized.proofTable);
  }
});

test("rotated title projection samples agree with Three.js artwork transforms", async () => {
  const { discPanelLayout, discTitlePoint, discProjectionCoverage, discProjectionWindow, discProjectionMask } = loader()("lib/content/disc.ts");
  const { Vector3, Matrix4 } = await import("three");
  for (const gap of [.5, 3, 12]) for (const size of [.7, 1]) {
    const panel = discPanelLayout(8, gap, size), center = (panel.inner + panel.outer) / 2;
    const window = discProjectionWindow(panel, .8, 1.1);
    for (const scale of [.25, .6, 1]) for (const angle of [-Math.PI, -Math.PI / 2, -.35, 0, .75, Math.PI]) for (const orbit of [0, .2, 1, 3]) {
      const matrix = new Matrix4().makeRotationZ(orbit)
        .multiply(new Matrix4().makeTranslation(center, 0, 0))
        .multiply(new Matrix4().makeRotationZ(angle)).multiply(new Matrix4().makeScale(scale, scale, scale));
      let coverage = 0;
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
        const u = (row + .5) / 5, v = (col + .5) / 5;
        const world = new Vector3((u - .5) * (panel.outer - panel.inner), (v - .5) * panel.innerHalfWidth * 2, 0).applyMatrix4(matrix);
        const point = discTitlePoint(panel, u, v, orbit, angle, undefined, scale);
        assert.ok(Math.hypot(world.x - point.x, world.y - point.y) < 1e-12);
        coverage += discProjectionMask(world.x, world.y, window, .75) / 25;
      }
      assert.ok(Math.abs(coverage - discProjectionCoverage(panel, window, orbit, .75, angle, scale)) < 1e-12);
    }
  }
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  const setImages = scene.slice(scene.indexOf("function setImages("));
  assert.ok(setImages.indexOf("item.src === imageSources[i]") < setImages.indexOf("clearSlots();"), "Setting-only changes keep decoded textures alive");
  assert.match(scene, /degToRad\(slot.rotation \?\? controls.slotRotation\)/);
});

test("arc thickness is bounded by today's broad edge and title size/blending survive saving", () => {
  const read = loader(), { DISC_DEFAULTS, DISC_RANGES, sanitizeDisc } = read("lib/content/disc.ts");
  const { sanitizeIntroSettings } = read("lib/intro/settings.ts");
  assert.equal(DISC_DEFAULTS.edgeThickness, .08);
  assert.deepEqual(DISC_RANGES.edgeThickness, [.01, 1, .01]);
  for (const [input, expected] of [[undefined, .08], [NaN, .08], [Infinity, .08], [0, .01], [-1, .01], [2, 1], [.4, .4]]) {
    assert.equal(sanitizeDisc({ edgeThickness: input }).edgeThickness, expected);
  }
  const settings = sanitizeIntroSettings(json("content/intro-settings.json"));
  settings.proofTable.disc.edgeThickness = .2;
  for (const mode of ["normal", "screen", "additive"]) for (const [size, opacity, expectedSize, expectedOpacity] of [[.25, 0, .25, 0], [.6, .35, .6, .35], [0, -2, .25, 0], [2, 5, 1, 1]]) {
    Object.assign(settings.proofTable.items[0], { titleScale: size, titleOpacity: opacity, titleBlend: mode, titleRotation: -60 });
    const saved = sanitizeIntroSettings(JSON.parse(JSON.stringify(settings)));
    assert.equal(saved.proofTable.disc.edgeThickness, .2);
    assert.equal(saved.proofTable.items[0].titleScale, expectedSize);
    assert.equal(saved.proofTable.items[0].titleOpacity, expectedOpacity);
    assert.equal(saved.proofTable.items[0].titleBlend, mode);
    assert.equal(saved.proofTable.items[0].titleRotation, -60);
  }
  Object.assign(settings.proofTable.items[0], { titleScale: NaN, titleOpacity: Infinity, titleBlend: "invalid" });
  const bad = sanitizeIntroSettings(settings).proofTable.items[0];
  assert.equal(bad.titleScale, undefined);assert.equal(bad.titleOpacity, undefined);assert.equal(bad.titleBlend, undefined);
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /thickness=clamp\(glassEdgeWidth,\.01,1\.\)/);
  for (const term of [".006", ".0032"]) assert.ok(scene.includes(`${term}*thickness`));
  assert.match(scene, /glassEdgeWidth.value = renderedControls.edgeThickness/);
  assert.match(scene, /slot.image.visible = slot.loaded && titleOpacity > 0/);
  assert.match(scene, /slots.filter\(s => s.image.visible\)/, "Fully blended-out titles do not intercept clicks");
  assert.match(scene, /sample.weight \* mask \* titleOpacity \* slot.titleScale \* slot.titleScale/, "Beam contribution tracks opacity and resized area");
  assert.match(scene, /v: 1 - \(row \+ .5\) \/ COLOUR_GRID/, "CPU projector samples follow texture UV orientation");
  assert.match(scene, /material.blendDst = THREE.OneMinusSrcColorFactor/);
  assert.match(scene, /vec3 blended=mix\(c,clamp\(c,0\.,1\.\),screenBlend\)/, "Screen factors stay valid for HDR colours");
});

test("intro timing preserves normal playback and bounds long stalls without catching up", () => {
  const { createIntroFrameClock } = loader()("lib/intro/frame-clock.ts");
  const duration = fps => {
    const clock = createIntroFrameClock(); let t = 0;
    // Loading/compilation may take any duration; the first visible frame starts at zero.
    for (let i = 0; i <= fps * 8; i++) t += clock.step(2500 + i * 1000 / fps);
    return t;
  };
  for (const fps of [10, 15, 30, 60, 120]) assert.ok(Math.abs(duration(fps) - 8) < .00001);
  const clock = createIntroFrameClock();
  assert.equal(clock.step(4000), 0); assert.equal(clock.step(4400), .1);
  assert.equal(clock.step(4416), .016, "A stall is discarded rather than creating a catch-up burst");
  clock.reset(); assert.equal(clock.step(14000), 0); assert.equal(clock.step(14100), .1);
  assert.equal(clock.step(14050), 0); assert.equal(clock.step(NaN), 0);
  assert.equal(clock.step(14200), .1);
  const source = readFileSync(path.join(root, "components/Intro.tsx"), "utf8");
  assert.equal((source.match(/getContext\("webgl2"\)/g) ?? []).length, 1, "Only one capability probe is needed");
  assert.match(source, /if \(webGLSupport !== undefined\) return webGLSupport/);
  assert.match(source, /loseContext\(\)/, "Probe releases its GPU context");
  const scene = readFileSync(path.join(root, "components/intro/StarIntro.tsx"), "utf8");
  assert.doesNotMatch(scene, /dt > 0\.25/);
  assert.match(scene, /clock.step\(performance.now\(\)\)/, "Shared RAF timestamps cannot defer the handoff");
  assert.ok(scene.indexOf("if (!paused && t >= T.end)") < scene.indexOf("adapt(dt)"), "Skip rendering the fully transparent final frame");
  assert.match(scene, /removeEventListener\("visibilitychange", onVisibility\)/);
});

test("mobile toolbar resizes keep the intro playing; rotation and major resizes use a fade", () => {
  const { introLayoutChanged: changed } = loader()("lib/intro/viewport.ts");
  for (const [w,h] of [[390,844],[768,1024],[1440,900]]) {
    assert.equal(changed(w,h,w,h-80),false);
    assert.equal(changed(w,h,w+1,h),false);
    assert.equal(changed(w,h,h,w),true);
    assert.equal(changed(w,h,w,h/2),true);
  }
  const scene = readFileSync(path.join(root,"components/intro/StarIntro.tsx"),"utf8");
  assert.doesNotMatch(scene,/t = T.fadeStart/,"No resize/Escape jump to the completed logo");
  assert.match(scene,/if \(introLayoutChanged\(vw, vh, w, h\)\) fadeToPage\(\)/);
  assert.match(scene,/if \(!wrap \|\| !overlay \|\| exitRequested\) return/,"A late chunk cannot start an intro after timeout");
  assert.match(scene,/clearTimeout\(exitTimer\)/);
});

test("intro loader waits for a rendered frame and first-render work stays outside playback", () => {
  const source = readFileSync(path.join(root,"components/IntroLoader.tsx"),"utf8");
  assert.match(source,/const READY = 1;/);
  const scene = readFileSync(path.join(root,"components/intro/StarIntro.tsx"),"utf8");
  const frame = scene.slice(scene.indexOf("function frame("),scene.indexOf("function onVisibility("));
  assert.ok(frame.indexOf("composer.render()") < frame.indexOf("reportIntroProgress(1)"));
  assert.match(frame,/firstFrameShown = true;\s*clock.reset\(\);/);
  assert.match(frame,/playAfter = performance.now\(\) \+ \(onTime \|\| paused \? 0 : 700\)/);
  assert.match(frame,/catch \(error\)[\s\S]*fadeToPage\(\)/,"RAF errors must not wait for a hard cut");
});

test("intro safety deadlines pause while hidden and cancel all listeners", () => {
  const originals = new Map(["document","performance","setTimeout","clearTimeout"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const handlers = new Set(), timers = new Map();
  let now=0, id=0, ended=0;
  const doc={hidden:false,addEventListener:(_,fn)=>handlers.add(fn),removeEventListener:(_,fn)=>handlers.delete(fn)};
  const values={document:doc,performance:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key)};
  for(const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const advance=ms=>{now+=ms;for(const [key,timer] of [...timers]) if(timer.at<=now){timers.delete(key);timer.fn();}};
  const visibility=hidden=>{doc.hidden=hidden;[...handlers].forEach(fn=>fn());};
  try {
    const {visibleTimeout}=loader()("lib/intro/visible-timeout.ts");
    const stop=visibleTimeout(()=>ended++,5000);
    advance(1800); visibility(true); visibility(true);
    advance(60000); assert.equal(ended,0); assert.equal(timers.size,0);
    visibility(false); visibility(false); assert.equal(timers.size,1);
    advance(3199); assert.equal(ended,0);
    advance(1); assert.equal(ended,1); assert.equal(handlers.size,0);
    stop(); stop();
    visibility(true);
    const cancel=visibleTimeout(()=>ended++,1000);
    advance(20000); assert.equal(timers.size,0);
    visibility(false); assert.equal(timers.size,1);
    cancel(); advance(2000); assert.equal(ended,1); assert.equal(handlers.size,0);
  } finally {for(const [key,descriptor] of originals) {if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];}}
});

test("lightweight intro reveals before fading, traverses the logo width, and cancels delayed callbacks", () => {
  const original=Object.getOwnPropertyDescriptor(globalThis,"window");
  const win=Object.assign(new EventTarget(),{matchMedia:()=>({matches:false})});
  Object.defineProperty(globalThis,"window",{value:win,configurable:true});
  const effects=[],refs=[],steps=[],events=[];
  let completion, hold, cleanup;
  const timeline={to(target,options){steps.push({target,options});return this;},kill(){events.push("kill-timeline");}};
  const gsap={timeline(options){completion=options.onComplete;return timeline;},delayedCall(_,fn){hold={fn,killed:false,kill(){this.killed=true;}};return hold;},to(_,options){events.push("fade");return options;},killTweensOf(){}};
  try {
    const {IntroFirstLight}=loader({react:{useRef:()=>{const ref={current:null};refs.push(ref);return ref;},useEffect:fn=>effects.push(fn)},gsap,"./IntroFirstLight.module.css":{}})("components/IntroFirstLight.tsx");
    IntroFirstLight({onReveal:()=>events.push("reveal"),onDone:()=>events.push("done")});
    refs.forEach(ref=>{ref.current={style:{},getBoundingClientRect:()=>({width:800})};});
    cleanup=effects[0]();
    steps[0].target.x=100; steps[0].options.onUpdate();
    assert.match(refs[1].current.style.transform,/translateX\(800px\)/);
    completion(); hold.fn();
    assert.deepEqual(events.slice(0,2),["reveal","fade"]);
    cleanup();cleanup=undefined;
    assert.equal(hold.killed,true);
    hold.fn();assert.equal(events.filter(e=>e==="reveal").length,1,"No callback after unmount");
  } finally {cleanup?.();if(original) Object.defineProperty(globalThis,"window",original);else delete globalThis.window;}
});

test("compact rail opens after the intro while desktop restores the glass top navigation", () => {
  const source = readFileSync(path.join(root, "components/Nav.tsx"), "utf8");
  const css = readFileSync(path.join(root, "components/Nav.module.css"), "utf8");
  assert.match(source, /matchMedia\("\(max-width: 1199px\)"\)/);
  assert.match(css, /@media \(min-width: 1200px\)\s*\{\s*\.links \{ display: flex; \}\s*\.right \{ display: none; \}/);
  assert.match(source, /const open = compact && logoShown && !dismissed/);
  assert.doesNotMatch(source, /freezeScroll|releaseScroll|e.key === "Tab"/, "Neither compact layout traps focus or locks scrolling");
  assert.match(source, /data-shown=\{logoShown\} inert=\{!logoShown\}/);
  assert.match(source, /focusOnOpen.current \? requestAnimationFrame/);
  assert.match(source, /removeAttribute\("data-section-menu-open"\)/);
  assert.match(source, /panePath\(pane.w, pane.h, true\)/, "Preserve the original shaped glass pane");
  assert.match(source, /aria-label=\{item.label\}/, "Icon-only links keep accessible names");
  assert.match(source, /aria-current=\{item.id === activeId \? "page" : undefined\}/);
  assert.match(source, /setTimeout\(\(\) => setLabelId\(null\), 2000\)/);
  assert.match(source, /clearTimeout\(labelTimer.current\)/);
  assert.match(source, /data-nav-label data-visible=\{open && !!labelId\} aria-hidden="true"/);
  assert.doesNotMatch(source, /styles.mobileLabel/, "Labels cannot float over the reading area");
  assert.match(css, /\.compactLabel\[data-visible="true"\]/);
  assert.match(css, /\.mobileActive \.mobileIcon, \.mobileLink:focus-visible \.mobileIcon \{\s*color: var\(--tone\);\s*filter: drop-shadow\(0 0 6px var\(--tone\)\)/);
  assert.match(css, /background: transparent;\s*box-shadow: none;/, "No square highlight behind active icons");
  assert.match(source, /data-open=\{open\} inert=\{!open\} aria-hidden=\{!open\}/, "Keep the rail mounted for fade-out, but inert when closed");
  assert.match(css, /\.mobileActive::after \{ opacity: 1; \}/);
  assert.match(css, /max-height: calc\(100svh/, "Short tablet screens can scroll the rail");
  assert.match(source, /menuButtonRef.current\?\.focus\(\)/, "Escape returns focus to the toggle");
});

test("compact reading gutters protect content without resizing the intro or portal preview", () => {
  const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
  const founder = readFileSync(path.join(root, "components/sections/Founder.module.css"), "utf8");
  const process = readFileSync(path.join(root, "components/sections/Process.module.css"), "utf8");
  const services = readFileSync(path.join(root, "components/sections/Services.module.css"), "utf8");
  const clients = readFileSync(path.join(root, "components/sections/Clients.module.css"), "utf8");
  assert.match(css, /@media \(max-width: 1199px\)/);
  assert.match(css, /html:not\(\.portal-preview\) \.site-main \.container:not\(#top \.container\)/);
  assert.match(css, /padding-inline-end: max\(clamp\(20px, 5vw, 64px\), var\(--nav-content-end\)\)/);
  assert.doesNotMatch(css, /html\[data-section-menu-open\].*padding/, "Opening the menu must not reflow the page");
  assert.match(founder, /width: min\(100%, 168px\);\s*aspect-ratio: 1/);
  assert.match(process, /\.headRow \{\s*display: flex;\s*flex-wrap: wrap/);
  assert.match(process, /\.note \{[^}]*white-space: normal/);
  assert.match(services, /@media \(max-width: 900px\)\s*\{\s*\.cards \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(clients, /font-size: clamp\(16px, 8.6cqi, 44px\)/);
});

test("new pointer navigation cancels the previous route's scroll restoration", () => {
  const source = readFileSync(path.join(root, "components/NavHistory.tsx"), "utf8");
  assert.match(source, /addEventListener\("pointerdown", halt, \{ passive: true \}\)/);
  assert.match(source, /removeEventListener\("pointerdown", halt\)/);
  assert.match(source, /if \(stop \|\| age > WINDOW_MS\) return/);
});

test("track swipe velocity follows speed, reversal and hold time instead of event rate", () => {
  const { createMarqueeVelocity, marqueeGlide } = loader()("components/sections/marqueeMotion.ts");
  const speed = (pixels, milliseconds, steps) => {
    const tracker = createMarqueeVelocity(); tracker.reset(0, 0);
    for (let i = 1; i <= steps; i++) tracker.sample(pixels * i / steps, milliseconds * i / steps);
    return tracker.release(milliseconds);
  };
  assert.ok(speed(-160, 80, 8) < speed(-160, 640, 8) * 5, "Fast flicks retain substantially more momentum");
  assert.ok(Math.abs(speed(120, 120, 8) - speed(120, 120, 24)) < .001, "Input frequency cannot change the glide");
  assert.ok(speed(10000, 1, 1) <= 2600, "Bound extreme input spikes");
  const tracker = createMarqueeVelocity(); tracker.reset(0, 0);
  tracker.sample(100, 50); tracker.sample(200, 100);
  assert.equal(tracker.release(230), 0, "Hold still before releasing to stop");
  tracker.sample(190, 110); tracker.sample(180, 120);
  assert.ok(tracker.release(120) < 0, "A reversal must not launch in the original direction");
  tracker.reset(0, 0); tracker.sample(20, 100); tracker.sample(20, 100);
  assert.equal(tracker.release(100), 200, "Duplicate timestamps are harmless");
  const coast = hz => {
    let velocity = 1500, distance = 0;
    for (let i = 0; i < hz; i++) { const next = marqueeGlide(velocity, 1 / hz); distance += next.distance; velocity = next.velocity; }
    return distance;
  };
  assert.ok(Math.abs(coast(30) - coast(120)) < .001, "Coast distance is refresh-rate independent");
  assert.equal(marqueeGlide(0, 1).distance, 0);
});

test("client tracks alternate with independent portal controls and no repeated-loop controls", () => {
  const source = readFileSync(path.join(root, "components/sections/Clients.tsx"), "utf8");
  const hook = readFileSync(path.join(root, "components/sections/useDragMarquee.ts"), "utf8");
  const css = readFileSync(path.join(root, "components/sections/Clients.module.css"), "utf8");
  assert.match(source, /items=\{clients\}[^\n]* secondaryItems=\{clientsSecond\}/);
  assert.match(source, /reverse=\{home.clients.productionDirection === "right"\}/);
  assert.match(source, /secondaryReverse=\{home.clients.productionSecondDirection !== "left"\}/);
  assert.match(source, /reverse=\{home.clients.filmmakersDirection === "right"\}/);
  assert.match(source, /reverse=\{props.secondaryReverse \?\? true\} secondary/);
  assert.match(source, /copy === 0 && i < items.length/);
  assert.match(source, /items=\{props.secondaryItems\} list="clientsSecond"/);
  assert.match(source, /<AddContent list="clientsSecond"/);
  assert.doesNotMatch(css, /html\[data-dds-edit\]\) \.secondaryTrack/);
  assert.match(css, /touch-action: pan-y/);
  assert.match(hook, /pointer !== null && e.pointerId === pointer\) cancel\(\)/, "Post-release lost capture must not cancel inertia");
  assert.match(hook, /disposed = true/);
  assert.match(hook, /motion.removeEventListener\("change", changeMotion\);\s*release\(\)/);
});

test("production tracks keep independent images, order and empty lists through migration and saving", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { findList } = read("app/portal/content-schema.ts");
  const { reorderContent } = read("app/portal/reorder-content.ts");
  const { contentProblems } = read("app/portal/validate.ts");
  const { summarizeContent } = read("lib/portal/summary.ts");
  const legacy = json("content/site-content.json");
  delete legacy.clientsSecond;
  legacy.clients = [{ name: "Studio A", logo: "/images/uploads/a.png", alt: "A" }];
  const migrated = sanitizeContent(legacy);
  assert.deepEqual(migrated.clientsSecond, [], "A legacy row must not copy row one's logos");
  const next = clone(migrated);
  next.clientsSecond = [{ name: "Studio B", logo: "/images/uploads/b.png" }, { name: "Studio C", logo: "/images/uploads/c.jpg" }];
  const saved = sanitizeContent(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(saved.clients, migrated.clients);
  assert.deepEqual(saved.clientsSecond, next.clientsSecond);
  assert.match(summarizeContent(migrated, saved), /Clients & collaborators/);
  for (const list of ["clients", "clientsSecond"]) {
    assert.equal(findList(list).kind, "list");
    assert.ok(findList(list).fields.some(f => f.kind === "image" && f.path === "logo"));
  }
  const reordered = reorderContent(saved, "clientsSecond", 0, 1);
  assert.deepEqual(reordered.clientsSecond.map(c => c.name), ["Studio C", "Studio B"]);
  assert.deepEqual(reordered.clients, saved.clients);
  const empty = sanitizeContent({ ...saved, clientsSecond: [] });
  assert.deepEqual(sanitizeContent(empty).clientsSecond, [], "Deleting all of track 2 must not restore track 1");
  assert.deepEqual(sanitizeContent({ ...saved, clients: [] }).clientsSecond, saved.clientsSecond);
  saved.clientsSecond[0].name = "";
  assert.ok(contentProblems(saved).some(p => p.path === "clientsSecond.0.name"));
  const unsafe = sanitizeContent({ ...saved, clientsSecond: [{ name: "Safe", logo: "javascript:alert(1)" }, null] });
  assert.deepEqual(unsafe.clientsSecond, [{ name: "Safe", logo: "" }]);
});

test("production logo rows use half-sized layout dimensions without shrinking the people row or editor controls", () => {
  const css = readFileSync(path.join(root,"components/sections/Clients.module.css"),"utf8");
  assert.match(css,/\.viewport\[data-marquee="clients"\],\s*\.viewport\[data-marquee="clientsSecond"\]\s*\{\s*--track-scale: 0\.5;/);
  assert.match(css,/\.viewport\s*\{\s*--track-scale: 1;/);
  assert.match(css,/--media-h: calc\(clamp\(112px, 12vw, 180px\) \* var\(--track-scale\)\)/);
  assert.match(css,/padding-block: calc\(22px \* var\(--track-scale\)\)/);
  assert.match(css,/height: calc\(clamp\(84px, 9vw, 132px\) \* var\(--logo-scale, 1\) \* var\(--track-scale\)\)/);
  assert.match(css,/width: calc\(clamp\(190px, 22vw, 320px\) \* var\(--logo-scale, 1\) \* var\(--track-scale\)\)/);
  assert.match(css,/--gap: calc\(clamp\(64px, 9vw, 130px\) \* var\(--track-scale\)\)/);
  assert.match(css,/padding-top: 76px/,"Portal touch targets retain their full-size space");
  assert.doesNotMatch(css,/transform:\s*scale\(0\.5\)/,"Use measurable layout sizes, not a transform that breaks marquee coverage");
});

test("people track settings enlarge both names and photos and save independently of logos", () => {
  const read=loader();
  const {sanitizeContent}=read("lib/content/sanitize.ts");
  const content=sanitizeContent(json("content/site-content.json"));
  const originalLogo=content.home.clients.logoSize;
  const fields=read("app/portal/content-schema.ts").findSection("home","clients").section.fields;
  const field=fields.find(f=>f.path==="home.clients.portraitSize");
  assert.deepEqual(field.options,["small","medium","large","xlarge","xxlarge"]);
  for(const size of field.options) {
    content.home.clients.portraitSize=size;
    const saved=sanitizeContent(content);
    assert.equal(saved.home.clients.portraitSize,size);
    assert.equal(saved.home.clients.logoSize,originalLogo);
  }
  content.home.clients.portraitSize="invalid";
  assert.equal(sanitizeContent(content).home.clients.portraitSize,"large");
  const css=readFileSync(path.join(root,"components/sections/Clients.module.css"),"utf8");
  assert.match(css,/\[data-marquee="collaborators"\]\[data-size="xlarge"\] \{ --track-scale: 1\.5;/);
  assert.match(css,/\[data-marquee="collaborators"\]\[data-size="xxlarge"\] \{ --track-scale: 2;/);
  assert.match(css,/font-size: calc\(clamp\(22px, 3\.2vw, 38px\) \* var\(--track-scale\)\)/);
  assert.match(css,/\.portrait\s*\{[^}]*width: var\(--media-h\);\s*height: var\(--media-h\);/);
});

test("production track size presets save for both rows without changing the people track", () => {
  const read=loader(), {sanitizeContent}=read("lib/content/sanitize.ts");
  const content=sanitizeContent(json("content/site-content.json"));
  const peopleSize=content.home.clients.portraitSize;
  const fields=read("app/portal/content-schema.ts").findSection("home","clients").section.fields;
  const field=fields.find(f=>f.path==="home.clients.logoSize");
  assert.deepEqual(field.options,["small","medium","large","xlarge","xxlarge"]);
  assert.match(field.hint,/half-size/);
  for(const size of field.options) {
    content.home.clients.logoSize=size;
    const saved=sanitizeContent(content);
    assert.equal(saved.home.clients.logoSize,size);
    assert.equal(saved.home.clients.portraitSize,peopleSize);
  }
  content.home.clients.logoSize="invalid";
  assert.equal(sanitizeContent(content).home.clients.logoSize,"large");
  const css=readFileSync(path.join(root,"components/sections/Clients.module.css"),"utf8").replaceAll("\r\n","\n");
  for(const [size,scale] of [["xlarge","0.75"],["xxlarge","1"]]) {
    assert.ok(css.includes(`.viewport[data-marquee="clients"][data-logo="${size}"],\n.viewport[data-marquee="clientsSecond"][data-logo="${size}"] { --track-scale: ${scale}; }`));
  }
});

test("logo assignments are unique and a row transfer preserves the complete entry", () => {
  const read = loader();
  const { uniqueClientTracks, moveClientTrack } = read("lib/content/client-tracks.ts");
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { contentProblems } = read("app/portal/validate.ts");
  const a = { name: "A", logo: "/images/uploads/a.png", alt: "Original artwork" };
  const b = { name: "B", logo: "/images/uploads/b.png" };
  const c = { name: "C", logo: "/images/uploads/c.png" };
  assert.deepEqual(uniqueClientTracks([a,b], [{ ...a, name: "Renamed A" },c]), {clients:[a,b],clientsSecond:[c]});
  const content = sanitizeContent(json("content/site-content.json"));
  content.clients = [a,b]; content.clientsSecond = [c];
  const moved = moveClientTrack(content,"clients",0);
  assert.deepEqual(moved.clients,[b]); assert.deepEqual(moved.clientsSecond,[c,a]);
  assert.deepEqual(content.clients,[a,b], "Transfer does not mutate the original draft / Cancel snapshot");
  assert.deepEqual(sanitizeContent(moved).clientsSecond,[c,a]);
  const back = moveClientTrack(moved,"clientsSecond",1);
  assert.deepEqual(back.clients,[b,a]); assert.deepEqual(back.clientsSecond,[c]);
  content.clientsSecond = [a,c];
  assert.ok(contentProblems(content).some(p => p.path === "clientsSecond.0.logo"));
  assert.deepEqual(sanitizeContent(content).clientsSecond,[c], "Existing duplicate assignments are removed without removing unique row-two images");
  content.home.clients.productionSpeed = "slow"; content.home.clients.productionSecondSpeed = "fast";
  const saved = sanitizeContent(content);
  assert.equal(saved.home.clients.productionSpeed,"slow"); assert.equal(saved.home.clients.productionSecondSpeed,"fast");
});

test("normal text colour and hover colour remain independent, including always-on glow", () => {
  const fx = loader()("lib/content/text-effects.ts");
  const options = { color: "#fff195", hoverColor: "#ffffff", glowColor: "#ffcc00", glowMode: "always" };
  const decoded = fx.decodeEffect(fx.applyTextEffect("[[4+]]", "glow", options).slice(2,-2));
  assert.deepEqual(decoded.options, options);
  assert.deepEqual(fx.effectStyle(options), {"--fx-color":"#fff195", "--fx-hover-color":"#ffffff", "--fx-glow-color":"#ffcc00"});
  const css = readFileSync(path.join(root,"components/fx/TextEffect.module.css"),"utf8");
  assert.match(css,/\.word\s*\{[^}]*color:\s*var\(--fx-color, inherit\)/);
  assert.match(css,/\.glow:hover, \.glow:active\s*\{\s*color:\s*var\(--fx-hover-color, var\(--fx-color, inherit\)\)/);
  const always = css.match(/\.glow\[data-fx-trigger="always"\]\s*\{([^}]+)\}/)[1];
  assert.match(always,/text-shadow:/);
  assert.doesNotMatch(always,/(?:^|;)\s*color:/,"Always-on glow must not activate hover text colour at rest");
});

test("draft logo controls retain their indexes while duplicates and blank names are being corrected", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const content = sanitizeContent(json("content/site-content.json"));
  const a = { name: "A", logo: "/images/a.png" };
  const blank = { name: "", logo: "/images/blank.png" };
  const b = { name: "B", logo: "/images/b.png" };
  content.clients = [a]; content.clientsSecond = [a,blank,b];
  const preview = sanitizeContent(content, { preserveClientSlots: true });
  const received = sanitizeContent(preview, { preserveClientSlots: true });
  assert.deepEqual(received.clientsSecond, [a,blank,b]);
  assert.equal(received.clientsSecond[2].name, "B", "Edit index still points to the original draft entry");
  assert.deepEqual(sanitizeContent(content).clientsSecond, [b], "Published content never includes duplicate or blank assignments");
  const problems = read("app/portal/validate.ts").contentProblems(content);
  assert.ok(problems.some(p => p.path === "clientsSecond.0.logo"));
  assert.ok(problems.some(p => p.path === "clientsSecond.1.name"));
});

test("marquee resumes after leaving the viewport, resizes, and stops cleanly", () => {
  const effects = [], refs = [], frames = new Map(), observers = {};
  let copies = 2, viewportWidth = 1920, itemWidth = 240.125, frameId = 0;
  let now = performance.now();
  const target = () => Object.assign(new EventTarget(), { style: {}, dataset: {}, getBoundingClientRect: () => ({ width: 0 }) });
  const vp = target(), tr = target(), first = target(), doc = target(), win = target();
  Object.defineProperty(vp, "clientWidth", { get: () => viewportWidth });
  first.children = [{ getBoundingClientRect: () => ({ width: itemWidth }) }];
  first.getBoundingClientRect = () => ({ width: copies * itemWidth });
  tr.getBoundingClientRect = () => ({ width: 2 * copies * itemWidth });
  tr.firstElementChild = first;
  doc.documentElement = { hasAttribute: () => false, dataset: {} };
  doc.hidden = false;
  win.matchMedia = () => Object.assign(target(), { matches: false });
  win.clearTimeout = clearTimeout; win.setTimeout = setTimeout;
  const observer = key => class {
    constructor(callback) { observers[key] = callback; }
    observe() {}
    disconnect() {}
  };
  const globals = { window: win, document: doc, ResizeObserver: observer("resize"), MutationObserver: observer("mode"), IntersectionObserver: observer("seen"),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: id => frames.delete(id) };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value, configurable:true,writable:true});
  let cleanup;
  try {
    const { useDragMarquee } = loader({react: {
      useRef: value => { const ref = {current:value}; refs.push(ref); return ref; },
      useState: () => [copies, value => { copies = value; }],
      useEffect: fn => effects.push(fn),
    }})("components/sections/useDragMarquee.ts");
    const hook = useDragMarquee({pixelsPerSecond:32,reverse:false,itemCount:1});
    hook.viewport.current = vp; hook.track.current = tr;
    effects[0](); cleanup = effects[1](); observers.resize();
    const advance = count => { for(let i=0;i<count;i++) { now += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn=>fn(now)); } };
    advance(20);
    const moving = tr.style.transform;
    advance(20); assert.notEqual(tr.style.transform,moving);
    vp.dispatchEvent(Object.assign(new Event("pointerenter"),{pointerType:"mouse"}));
    advance(150); assert.equal(frames.size,0,"Hover deliberately pauses the row");
    observers.seen([{isIntersecting:false}]); observers.seen([{isIntersecting:true}]);
    const paused = tr.style.transform;
    advance(30); assert.notEqual(tr.style.transform,paused,"Returning resumes without a stale hover pause");
    viewportWidth = 5120; itemWidth = 180.75;
    observers.resize(); observers.resize(); advance(20);
    const x = Number(tr.style.transform.match(/translate3d\(([-.\d]+)px/)[1]);
    assert.ok(x <= 0 && x + 2 * copies * itemWidth >= viewportWidth,"Resized copies cover the viewport");
    refs[3].current = {pixelsPerSecond:48,reverse:true,itemCount:1};
    advance(200);
    const beforeRight = Number(tr.style.transform.match(/translate3d\(([-.\d]+)px/)[1]);
    advance(2);
    const afterRight = Number(tr.style.transform.match(/translate3d\(([-.\d]+)px/)[1]);
    assert.ok(afterRight > beforeRight,"Updated direction moves right after easing");
    doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(frames.size,0);
    doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
    advance(2); assert.ok(frames.size > 0);
    cleanup(); cleanup = undefined;
    assert.equal(frames.size,0); assert.equal(tr.style.transform,"");
  } finally {
    cleanup?.();
    for (const key of Object.keys(globals)) { if(previous[key]) Object.defineProperty(globalThis,key,previous[key]); else delete globalThis[key]; }
  }
});

test("marquee coverage and fractional wrap remain seamless over thousands of cycles", () => {
  const { wrapMarquee, marqueeRepeats } = loader()("components/sections/marqueeMotion.ts");
  for (const viewport of [320,768,1920,5120]) for (const sequence of [88.25,571.5,2400.125]) {
    const copies = marqueeRepeats(viewport,sequence), half = copies * sequence;
    assert.ok(half >= viewport);
    for (const direction of [-1,1]) {
      let x=0;
      for (let i=0;i<15000;i++) {
        const next=wrapMarquee(x+direction*37.375,half);
        assert.ok(next <= 0 && next > -half);
        assert.ok(next+2*half >= viewport, "Two copies always cover the full viewport");
        const jump=(next-x-direction*37.375)/half;
        assert.ok(Math.abs(jump-Math.round(jump))<1e-9, "Wrap changes by an exact copy, with no fractional gap");
        x=next;
      }
    }
  }
});

test("all three track directions are independently editable and survive saving", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const fields = read("app/portal/content-schema.ts").findSection("home", "clients").section.fields;
  const keys = ["productionDirection", "productionSecondDirection", "filmmakersDirection"];
  const content = json("content/site-content.json");
  keys.forEach(key => delete content.home.clients[key]);
  const migrated = sanitizeContent(content);
  assert.deepEqual(keys.map(key => migrated.home.clients[key]), ["left", "right", "left"]);
  for (const key of keys) {
    const field = fields.find(f => f.path === `home.clients.${key}`);
    assert.equal(field.kind, "select");
    assert.deepEqual(field.options, ["left", "right"]);
  }
  for (let mask = 0; mask < 8; mask++) {
    keys.forEach((key, i) => { migrated.home.clients[key] = mask & (1 << i) ? "right" : "left"; });
    const saved = sanitizeContent(JSON.parse(JSON.stringify(migrated)));
    assert.deepEqual(keys.map(key => saved.home.clients[key]), keys.map(key => migrated.home.clients[key]));
  }
  keys.forEach(key => { migrated.home.clients[key] = "invalid"; });
  assert.deepEqual(keys.map(key => sanitizeContent(migrated).home.clients[key]), ["left", "right", "left"]);
});

test("clear glass keeps its existing pane and reveals pigment through a bounded light landing", () => {
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(source, /vec3 paneTint=mix\(glassTint,vec3\(dot\(glassTint,vec3\(\.2126,\.7152,\.0722\)\)\),uDesaturation\)/);
  assert.match(source, /float tintAlpha=glassOpacity\*mix\(\.06,\.16/);
  assert.match(source, /float surfaceAlpha=clamp\([^;]+,0\.,\.12\)/, "Reference reflections cannot become an opaque frosted fill");
  assert.match(source, /float a=reflectionAlpha\+tintAlpha\*\(1\.-reflectionAlpha\)/);
  assert.match(source, /float landingHaze=1\.-\.48\*smoothstep\(\.78,1\.,along\)/);
  assert.match(source, /contactColour\*contactAlpha\*\(1\.-rimAlpha\)/);
  assert.equal((source.match(/new THREE\.CircleGeometry\(R, 192\)/g) ?? []).length, 1);
  assert.match(source, /projectorTransform\*world/, "Glass and artwork share the fixed light frame");
  assert.match(source, /artworkCore\*\(1\.\+slotGlow\*\.1\)/, "Preserve the original logo core under its glow");
});

test("glass rim keeps its fine reflection and etched circles without clock ticks", () => {
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  const pane = source.slice(source.indexOf("const glassMaterial"), source.indexOf("type ColourSample"));
  assert.match(pane, /float bevel=exp/);
  assert.doesNotMatch(pane, /float (inner|shoulder|innerArc)=/);
  assert.match(pane, /resolvedWidth=max\(lineWidth,aa\*\.55\)/);
  assert.match(pane, /min\(1\.,lineWidth\/resolvedWidth\)/,"Thin settings reduce coverage instead of hitting a thick pixel floor");
  assert.match(pane, /vec2 radial=vProjector\/max\(length\(vProjector\),\.0001\)/);
  assert.match(pane, /pow\(abs\(dot\(radial/);
  assert.match(pane, /abs\(dot\(normalize\(vGlassNormal\),normalize\(vGlassView\)\)\)/, "Fresnel works on both faces");
  assert.doesNotMatch(pane, /sin\(atan\(vGlass|texture2D|sampler2D/, "No rotating highlight or extra texture allocations");
  assert.equal((pane.match(/new THREE\.Mesh/g) ?? []).length, 1);
  assert.equal((source.match(/composer.addPass\(/g) ?? []).length, 4);
  assert.match(pane, /clamp\(a2\*edge,0\.,1\.\)/, "Final alpha (glass plus etched edge lines) stays bounded");
  assert.doesNotMatch(pane, /sqrt\(glassOpacity\)/,"Edge reflection remains independent of tint opacity");
  assert.match(pane, /outerLine\*\.75\+innerLine\*\.55\+nodes\*\.9\)\*lineLight/, "Keep both circular lines and ring nodes at their existing strengths");
  assert.doesNotMatch(pane, /\b(?:tickCell|ticks)\b/, "Clock-like minute marks are not rendered");
});

test("lighting sliders persist independently and update their own render channels", () => {
  const read=loader(), {DISC_DEFAULTS,DISC_RANGES}=read("lib/content/disc.ts");
  const {sanitizeIntroSettings}=read("lib/intro/settings.ts");
  const keys=["lightIntensity","rayIntensity","beamGlow","beamWidth","rayStrength","surfaceReflection","bloom","glowRadius","glowThreshold","raySpread","rayMotion","rayPrism","rayLength"];
  for(const key of keys) for(const value of [DISC_RANGES[key][0],DISC_RANGES[key][1]]) {
    const settings=sanitizeIntroSettings({proofTable:{disc:{...DISC_DEFAULTS,[key]:value}}});
    const saved=sanitizeIntroSettings(JSON.parse(JSON.stringify(settings)));
    assert.equal(saved.proofTable.disc[key],value);
    for(const other of keys.filter(other=>other!==key)) assert.equal(saved.proofTable.disc[other],DISC_DEFAULTS[other]);
  }
  const source=readFileSync(path.join(root,"components/disc-hero/scene.ts"),"utf8");
  for(const key of keys) assert.ok(source.includes(`renderedControls.${key} = settleControl(renderedControls.${key}, controls.${key}, dt`),`${key} keeps updating even in a paused preview`);
  assert.match(source,/glassLight.value = renderedControls.lightIntensity/);
  assert.match(source,/surfaceReflection.value = renderedControls.surfaceReflection/);
  assert.doesNotMatch(source,/contactStrength.value =[^\n]*surfaceReflection/,"Title glow must not depend on the surface-only slider");
  assert.match(source,/contactReflection\(p,rayField\(p\)\)\*surfaceReflection/);
  assert.match(source,/\.1\*beamGlow\+rayField\(shaped\)\*1.3\*rayStrength/,"Dust obeys the same off controls as the beam");
  assert.deepEqual(DISC_RANGES.beamWidth,[.25,2,.05]);
  assert.match(source,/float spotlight=\(halo\*/,"Reference spotlight has a separate soft blue atmosphere");
  assert.match(source,/vec2 spot=shaped\/mix\(\.72,1\.32,along\)/,"The spotlight widens gradually away from its source");
  assert.match(source,/float sourceBias=1\.85\*exp\(-along\*2\.3\)\+\.16/,"The source is brighter than the landing");
  assert.match(source,/float fade=smoothstep\(0\.,\.025,along\)\*\(1\.-smoothstep\(\.5,1\.,along\)\*smoothstep\(\.5,1\.,along\)\)/,"The landing falls away softly");
  assert.match(source,/sourcePreview\.copy\(source\)\.lerp\(anchor, \.2\)\.project\(camera\)/,"The source highlight follows the live beam aim");
  assert.match(source,/beamWidth.value = renderedControls.beamWidth/,"Beam width reaches the shader without changing the disc");
  const wrapper=readFileSync(path.join(root,"components/proof-table/ProofTable.tsx"),"utf8");
  assert.match(wrapper,/Object.assign\(scene.current.controls, sanitizeDisc\(pt.disc\)\); scene.current.invalidate\(\)/);
  const portal=readFileSync(path.join(root,"app/portal/PortalEditor.tsx"),"utf8");
  assert.match(portal,/ResizeObserver\(\(\) => setPreviewWidth\(frame.clientWidth\)\)/);
  assert.match(portal,/previewWidth=\{previewWidth\}/);
  // Subpixel-width changes must remain distinguishable at low and high DPR.
  for(const aa of [.00025,.001,.004]) {
    let previous=0;
    for(const thickness of [.01,.04,.08,.25,1]) {
      const lineWidth=.0032*thickness, resolvedWidth=Math.max(lineWidth,aa*.55);
      const integratedCoverage=resolvedWidth*Math.min(1,lineWidth/resolvedWidth);
      assert.ok(integratedCoverage>previous);
      previous=integratedCoverage;
    }
  }
});

test("glass tint and shadow controls sanitize, persist and remain isolated from artwork and the intro", () => {
  const read = loader();
  const { sanitizeDisc, DISC_DEFAULTS, glassBackdropStyle } = read("lib/content/disc.ts");
  const { sanitizeIntroSettings } = read("lib/intro/settings.ts");
  const settings = sanitizeIntroSettings(json("content/intro-settings.json"));
  const original = clone(settings);
  const legacy = sanitizeDisc({ glassVersion: 1, glassTintColor: "#0d1014", glassOpacity: .22, shadowOpacity: 168 / 255, discRoll: 17 });
  assert.equal(legacy.shadowOpacity, 0, "The former black backdrop is removed");
  assert.equal(legacy.glassTintColor, DISC_DEFAULTS.glassTintColor);
  assert.equal(legacy.glassOpacity, DISC_DEFAULTS.glassOpacity);
  assert.equal(legacy.discRoll, 17, "Changing the glass finish preserves its position");
  assert.deepEqual(sanitizeDisc(legacy), legacy, "The finish migration is stable on reload");
  assert.equal(sanitizeDisc({ ...legacy, shadowOpacity: 168 / 255 }).shadowOpacity, 168 / 255, "New deliberate shadow settings remain editable");
  Object.assign(settings.proofTable.disc, { glassTintColor: "#AABBCC", glassOpacity: 0, shadowColor: "#123456", shadowOpacity: 0, shadowSpread: 1.4 });
  const saved = sanitizeIntroSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(saved.proofTable.disc.glassTintColor, "#aabbcc");
  assert.equal(saved.proofTable.disc.glassOpacity, 0);
  assert.equal(saved.proofTable.disc.shadowOpacity, 0);
  assert.equal(saved.proofTable.disc.shadowSpread, 1.4);
  assert.deepEqual(saved.proofTable.items, original.proofTable.items);
  for (const key of Object.keys(original).filter(k => k !== "proofTable")) assert.deepEqual(saved[key], original[key]);
  assert.deepEqual(glassBackdropStyle(saved.proofTable.disc), { "--glass-shadow-color": "#123456", "--glass-shadow-opacity": 0, "--glass-shadow-spread": 1.4 });
  const invalid = sanitizeDisc({ glassTintColor: "url(evil)", shadowColor: "red;opacity:1", shadowOpacity: Infinity, shadowSpread: -12, glassOpacity: 99 });
  assert.equal(invalid.glassTintColor, DISC_DEFAULTS.glassTintColor);
  assert.equal(invalid.shadowColor, DISC_DEFAULTS.shadowColor);
  assert.equal(invalid.shadowOpacity, DISC_DEFAULTS.shadowOpacity);
  assert.equal(invalid.shadowSpread, .5);
  assert.equal(invalid.glassOpacity, .65);
  assert.equal(sanitizeDisc({shadowSpread:99,shadowOpacity:99}).shadowSpread,1.6);
  assert.equal(sanitizeDisc({shadowSpread:99,shadowOpacity:99}).shadowOpacity,1);
  const editor = readFileSync(path.join(root, "app/portal/ProofTableEditor.tsx"), "utf8");
  for (const key of ["glassTintColor", "glassOpacity", "shadowColor", "shadowOpacity", "shadowSpread"]) {
    assert.equal((editor.match(new RegExp(`key: "${key}"`, "g")) ?? []).length, 1, `One editor for ${key}`);
  }
  assert.match(editor, /Reset glass tint/);
  assert.match(editor, /Reset shadow/);
  const scene = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(scene, /glassTint.value.r = settleControl/);
  assert.match(scene, /targetGlassTint.set\(lastGlassTint\)/);
});

test("glass drag captures one pointer, preserves taps and suppresses a drag click", () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const win = new EventTarget(), doc = new EventTarget(), surface = new EventTarget();
  globalThis.window = win; globalThis.document = doc;
  surface.style = {};
  surface.getBoundingClientRect = () => ({ left: 10, top: 20 });
  let captured = null;
  surface.setPointerCapture = id => { captured = id; };
  surface.hasPointerCapture = id => captured === id;
  surface.releasePointerCapture = () => { captured = null; };
  const calls = [];
  const fire = (type, extra = {}, target = surface) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 40, clientY: 60, detail: 1 }, extra);
    target.dispatchEvent(event); return event;
  };
  let unbind;
  try {
    const { bindCircleDrag } = loader()("components/disc-hero/drag.ts");
    unbind = bindCircleDrag(surface, {
      begin: (x, y) => { calls.push(["begin", x, y]); return x >= 0; },
      move: (x, y) => calls.push(["move", x, y]), end: () => calls.push(["end"]),
    });
    fire("pointerdown", { button: 2 }); fire("pointerdown", { isPrimary: false });
    assert.equal(calls.length, 0, "Ignore secondary buttons and extra touches");
    fire("pointerdown");
    assert.equal(captured, 1);
    fire("pointermove", { clientX: 43 });
    assert.equal(calls.length, 1, "Small tap jitter must not rotate");
    fire("pointerup");
    assert.equal(fire("click").defaultPrevented, false, "A tap still opens its title");
    fire("pointerdown");
    fire("pointermove", { pointerId: 2, clientX: 110 });
    assert.equal(calls.length, 3, "Only the captured pointer can rotate");
    fire("pointermove", { clientX: 120 });
    assert.deepEqual(calls.at(-1), ["move", 110, 40]);
    fire("pointerup");
    assert.equal(captured, null);
    assert.equal(fire("click").defaultPrevented, true, "Dragging must not open details");
    fire("pointerdown"); fire("pointercancel");
    assert.deepEqual(calls.at(-1), ["end"], "Native scrolling releases manual rotation");
    assert.equal(captured, null);
    for (const exit of ["blur", "resize"]) {
      fire("pointerdown"); fire(exit, {}, win);
      assert.equal(captured, null, exit + " cannot leave rotation held");
    }
    fire("pointerdown"); doc.hidden = true; fire("visibilitychange", {}, doc);
    assert.equal(captured, null, "Hidden tabs release the gesture");
    fire("pointerdown"); unbind(); unbind = null;
    const length = calls.length;
    fire("pointerdown"); fire("pointermove", { clientX: 140 });
    assert.equal(calls.length, length, "Unmount removes all gesture handlers");
  } finally {
    unbind?.();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test("disc mounts transparent title artwork without card or frame layers", () => {
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.doesNotMatch(source, /const glass = own\(/);
  assert.doesNotMatch(source, /EdgesGeometry\(panelGeometry/);
  assert.match(source, /gl_FragColor=vec4\(blended\*mix\(1\.,outputAlpha,screenBlend\),outputAlpha\)/);
  assert.match(source, /mix\(c,artworkCore\*\(1\.\+slotGlow\*\.1\),titleInk\*focus\*\.5\)/);
  assert.match(source, /Float32BufferAttribute\(\[0, 0, 1, 0, 1, 1, 0, 1\], 2\)/);
  assert.match(source, /titleGlowIntensity/);
  assert.match(source, /new THREE\.CircleGeometry\(R, 192\)/);
  assert.doesNotMatch(source, /PMREMGenerator|RectAreaLight|discStreak|MeshPhysicalMaterial/);
  assert.match(source, /hullWidth = 1\.5/);
  assert.match(source, /glassCircleComposition\(width, height, arrival\)/);
  assert.match(source, /gl_FragColor\*=frame\*readable\*outgoing/, "Feathering must fade premultiplied RGB as well as alpha");
  assert.match(source, /THREE\.MathUtils\.damp\(current, target, rate/);
  assert.match(source, /controlsSettling \|\| hoverSettling/);
  assert.doesNotMatch(source, /!paused && opened < 0|controls\.spinSpeed !== 0 && hovered < 0/,
    "A hover or movie dialog must not stop background animation");
  assert.match(source, /if \(!motion\.matches && !paused\) \{\s*time \+= dt;[\s\S]*?disc\.rotation\.z =/,
    "Automatic motion respects explicit pause and reduced motion");
  assert.match(source, /if \(!dragging\)/, "Holding the glass takes over automatic rotation");
  assert.match(source, /Math\.atan2\(Math\.sin\(delta\), Math\.cos\(delta\)\)/, "Dragging unwraps the angle seam");
  assert.match(source, /unbindDrag\(\)/, "Drag handlers are disposed with the renderer");
  assert.doesNotMatch(source, /if \(hovered < 0 && !hoverSettling\)/);
  assert.match(source, /makeAimGuide\(0x5be7ff\).*makeAimGuide\(0xffd45b\)/s);
  assert.match(source, /setAimGuides\(value: boolean\)/);
  const page = readFileSync(path.join(root, "components/proof-table/ProofTable.tsx"), "utf8");
  assert.match(page, /setBeamOrigin\(null, -\.09\)/);
  assert.match(page, /setScrollProgress/);
  assert.match(page, /removeEventListener\("scroll", onScroll\)/);
  assert.match(page, /setAimGuides\(portalPreview\)/);
  assert.match(page, /state === "fallback" && <details className=\{styles\.collection\} open>/);
  assert.doesNotMatch(page, /Explore the collection <span>/);
  assert.match(source, /smoothstep\(\.015,\.42,along\)/);
  const editor = readFileSync(path.join(root, "app/portal/ProofTableEditor.tsx"), "utf8");
  assert.match(editor, /open=\{openDiscGroup === group\.title\}/, "Only the selected setting block opens");
  assert.match(editor, /setOpenDiscGroup\(current => current === group\.title \? null : group\.title\)/);
});

test("projector illuminates only overlapping image pixels and blends partial entries in either direction", () => {
  const { discPanelLayout, discProjectionWindow, discProjectionMask, discProjectionCoverage, discArtworkPresence } = loader()("lib/content/disc.ts");
  const panel = discPanelLayout(8, 3, 1), window = discProjectionWindow(panel, .8, 1.1);
  assert.equal(discProjectionMask(window.center, 0, window, .75), 1);
  assert.equal(discProjectionMask(window.outer + .01, 0, window, .75), 0);
  assert.equal(discProjectionMask(window.center, window.outerHalfWidth + .01, window, .75), 0);
  const halfWidth = (window.innerHalfWidth + window.outerHalfWidth) / 2;
  const edgeWeight = discProjectionMask(window.center, halfWidth * .85, window, .75);
  assert.ok(edgeWeight > 0 && edgeWeight < 1, "Only the entering edge is feathered, not the whole image");
  const centered = discProjectionCoverage(panel, window, 0, .75);
  const partial = discProjectionCoverage(panel, window, .12, .75);
  assert.ok(partial > 0 && partial < centered);
  assert.equal(discProjectionCoverage(panel, window, Math.PI, .75), 0);
  assert.ok(Math.abs(partial - discProjectionCoverage(panel, window, -.12, .75)) < 1e-9);
  assert.ok(Math.abs(partial - discProjectionCoverage(panel, window, Math.PI * 2 + .12, .75)) < 1e-9);
  assert.equal(discArtworkPresence(0), 0);
  assert.equal(discArtworkPresence(.012), 0);
  assert.ok(discArtworkPresence(.08) > 0 && discArtworkPresence(.08) < 1);
  assert.equal(discArtworkPresence(.28), 1);
  const source = readFileSync(path.join(root, "components/disc-hero/scene.ts"), "utf8");
  assert.match(source, /targetColor\.copy\(neutralBeamColor\)\.lerp\(sampledColor, artworkPresence\)/);
  assert.match(source, /else targetBands\.copy\(neutralBands\)/);
  assert.doesNotMatch(source, /else targetColor\.copy\(beamColor\)/);
  assert.match(source, /const COLOUR_GRID = 8/);
});

test("upright artwork keeps its aspect ratio entirely inside a rotating projected plaque", () => {
  const { discArtworkFrame } = loader()("lib/content/disc.ts");
  for (const angle of [0, .3, 1, 2, 3, 4, 5]) for (const aspect of [.25, 1, 4]) for (const viewport of [.5, 1, 2]) {
    const points = [{ x: -.2, y: -.5 }, { x: .2, y: -.5 }, { x: .4, y: .5 }, { x: -.4, y: .5 }]
      .map(p => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
    const box = discArtworkFrame(points, aspect, viewport);
    assert.ok(Math.abs(box.halfWidth / box.halfHeight * viewport - aspect) < 1e-8);
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      const x = box.x + dx * box.halfWidth, y = box.y + dy * box.halfHeight;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        assert.ok((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= -1e-8, "No corner clips outside the plaque");
      }
    }
  }
});

test("projector colour ignores transparent padding and preserves artwork pigment", () => {
  const { discImageColour, sanitizeDisc } = loader()("lib/content/disc.ts");
  assert.deepEqual(discImageColour([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 0, 255]), [1, 0, 0]);
  const colour = discImageColour([255, 0, 0, 255, 255, 255, 255, 255]);
  assert.ok(colour[0] > .9 && colour[1] < .1);
  assert.deepEqual(discImageColour([0, 0, 0, 0]), [.5, .5, .5]);
  assert.equal(sanitizeDisc({}).rayMotion, .45);
  assert.equal(sanitizeDisc({ rayMotion: 0 }).rayMotion, 0);
  assert.equal(sanitizeDisc({ rayMotion: Infinity }).rayMotion, .45);
  assert.equal(sanitizeDisc({ rayMotion: 8 }).rayMotion, 1);
});

test("disc adds a slot for every saved title through sixteen without changing their order", () => {
  const { DISC_SLOT_LIMIT, visibleDiscItems } = loader()("lib/content/disc.ts");
  const items = Array.from({ length: 16 }, (_, i) => ({ slug: `title-${i}`, src: `image-${i}.png` }));
  const original = clone(items);
  assert.equal(DISC_SLOT_LIMIT, 16);
  assert.equal(loader()("lib/intro/settings.ts").PROOF_LIMITS.items, DISC_SLOT_LIMIT, "Every title the editor accepts has a disc slot");
  for (let count = 0; count <= DISC_SLOT_LIMIT; count++) {
    assert.deepEqual(visibleDiscItems(items.slice(0, count)), original.slice(0, count));
  }
  assert.deepEqual(visibleDiscItems([...items, { slug: "overflow", src: "overflow.png" }]), original);
  assert.deepEqual(items, original);
  const reordered = [items[15], ...items.filter((_, i) => i !== 15)];
  assert.equal(visibleDiscItems(reordered)[0].slug, "title-15");
  assert.equal(visibleDiscItems([]).length, 0);
  assert.equal(visibleDiscItems(items.slice(0, 3)).length, 3);
});

test("projector footprint tracks title dimensions with bounded edge overscan", () => {
  const { DISC_DEFAULTS, discPanelLayout, discProjectionWindow } = loader()("lib/content/disc.ts");
  assert.equal(DISC_DEFAULTS.focusAngle, -43);
  for (const count of [1, 5, 12, 16]) for (const size of [.7, 1]) for (const radius of [.66, .8, .9]) for (const spread of [.3, 1.1, 2]) {
    const layout = discPanelLayout(count, 3, size), window = discProjectionWindow(layout, radius, spread);
    const span = layout.outer - layout.inner;
    assert.ok(window.inner >= layout.inner - span * .18 && window.outer <= layout.outer + span * .18);
    assert.ok(window.inner < window.center && window.center < window.outer);
    for (const [r, width] of [[window.inner, window.innerHalfWidth], [window.outer, window.outerHalfWidth]]) {
      const boundary = layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * (r - layout.inner) / (layout.outer - layout.inner);
      assert.ok(width > 0 && width <= boundary * 1.351, "Overscan remains bounded around the title");
    }
  }
  const window = (count, size) => discProjectionWindow(discPanelLayout(count, 3, size), .8, 1.1);
  assert.ok(window(5, 1).inner < discPanelLayout(5, 3, 1).inner, "Default light reaches beyond the inner letters");
  assert.ok(window(5, 1).outer > discPanelLayout(5, 3, 1).outer, "Default light reaches beyond the outer letters");
  assert.ok(window(16, 1).outerHalfWidth < window(5, 1).outerHalfWidth);
  assert.ok(window(5, .7).outer - window(5, .7).inner < window(5, 1).outer - window(5, 1).inner);
});

test("landing reveal expands independently of the projector beam and saved copy placement", () => {
  const { discPanelLayout, discProjectionWindow, discLandingWindow } = loader()("lib/content/disc.ts");
  const { sanitizeIntroSettings } = loader()("lib/intro/settings.ts");
  const layout = discPanelLayout(8, 3, 1);
  const beam = discProjectionWindow(layout, .8, .55);
  const narrow = discLandingWindow(layout, .8, .3);
  const wide = discLandingWindow(layout, .8, 2.4);
  assert.ok(wide.outerHalfWidth > narrow.outerHalfWidth);
  assert.ok(wide.outer - wide.inner > narrow.outer - narrow.inner);
  assert.deepEqual(discProjectionWindow(layout, .8, .55), beam, "Changing the landing does not change the beam footprint");
  const settings = sanitizeIntroSettings({ proofTable: { copyX: 32, copyY: 64, copyWidth: 460, disc: { landingSpread: 2.4 } } });
  const saved = sanitizeIntroSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(saved.proofTable.disc.landingSpread, 2.4);
  assert.deepEqual([saved.proofTable.copyX, saved.proofTable.copyY, saved.proofTable.copyWidth], [32, 64, 460]);
});

test("stat values retain typed symbols, decimal precision, blank drafts and text effects through saving", () => {
  const read = loader();
  const { statText, statCounter } = read("lib/content/stat-value.ts");
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { contentProblems } = read("app/portal/validate.ts");
  const { applyTextEffect } = read("lib/content/text-effects.ts");
  assert.equal(statText(4, "+"), "4+");
  assert.equal(statText("4", "+"), "4+");
  for (const value of ["4+", "4-", "-4", "+4", "[[4+]]", "[[glow|4+]]", "", "004+"]) {
    assert.equal(statText(value, "+"), value);
    const content = json("content/site-content.json");
    content.home.stats[0].value = value;
    const saved = sanitizeContent(JSON.parse(JSON.stringify(content)));
    assert.equal(saved.home.stats[0].value, value);
    const errors = contentProblems(saved).filter(p => p.path === "home.stats.0.value");
    assert.equal(errors.length, value ? 0 : 1);
  }
  assert.equal(statText("[[4]]", "+"), "[[4]]+");
  assert.deepEqual(statCounter("-4.50"), {target:-4.5,decimals:2,sign:"-",suffix:""});
  assert.equal(statCounter(applyTextEffect("[[4+]]", "glow")), null);
  const number = read("app/portal/content-schema.ts").findList("home.stats").fields.find(f => f.path === "value");
  assert.equal(number.kind, "text");assert.equal(number.fx, true);
});

test("text effects preserve old dots, isolate field choices, and keep editable brackets simple", () => {
  const { applyTextEffect, editableFx, plainFx, selectedEffect, TEXT_EFFECTS } = loader()("lib/content/text-effects.ts");
  const original = "Make [[cinematic]] work with [[character]].";
  assert.equal(selectedEffect(original), "particles");
  for (const { id } of TEXT_EFFECTS) {
    const encoded = applyTextEffect(original, id);
    assert.equal(editableFx(encoded), original);
    assert.equal(selectedEffect(encoded), id);
    assert.equal(plainFx(encoded), "Make cinematic work with character.");
  }
  assert.equal(original, "Make [[cinematic]] work with [[character]].");
  assert.equal(plainFx("[[unknown|literal]]"), "unknown|literal");
});

test("effect marking handles selections, whitespace, punctuation and existing brackets", () => {
  const { markEffectWords } = loader()("lib/content/text-effects.ts");
  assert.equal(markEffectWords("Make cinematic."), "Make [[cinematic]].");
  assert.equal(markEffectWords("Make cinematic work", 5, 14), "Make [[cinematic]] work");
  assert.equal(markEffectWords("Make [[cinematic]]", 8, 12), "Make [[cinematic]]");
  assert.equal(markEffectWords("Make [[cinematic]] work"), "Make [[cinematic]] work");
  assert.equal(markEffectWords("  great work  ", 0, 14), "  [[great work]]  ");
});

test("text colour and glow options stay with their own marked number through edits, saves and reorders", () => {
  const read = loader();
  const fx = read("lib/content/text-effects.ts");
  const options = { color: "#12abcd", glowColor: "#ef3456", glowStrength: 0.45, glowRadius: 18, glowMode: "always" };
  const encoded = fx.applyTextEffect("[[30+]]", "glow", options);
  assert.equal(fx.editableFx(encoded), "[[30+]]");
  assert.equal(fx.plainFx(encoded), "30+");
  assert.deepEqual(fx.selectedEffectOptions(encoded), options);
  assert.deepEqual(fx.selectedEffectOptions(fx.applyTextEffect(encoded, "outline")), options);
  assert.equal(read("lib/content/stat-value.ts").statText(encoded, "+"), encoded);
  const content = json("content/site-content.json");
  const neighbour = clone(content.home.stats[1]);
  content.home.stats[0].value = encoded;
  const saved = read("lib/content/sanitize.ts").sanitizeContent(JSON.parse(JSON.stringify(content)));
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.stats", 0, 1);
  assert.equal(moved.home.stats[1].value, encoded);
  assert.deepEqual(moved.home.stats[0], neighbour);
  assert.equal(fx.applyTextEffect(encoded, "glow", {}), "[[glow|30+]]");
  assert.deepEqual(fx.effectStyle(options), {"--fx-color":"#12abcd", "--fx-glow-color":"#ef3456", "--fx-glow-opacity":"45%", "--fx-glow-radius":"18px"});
  assert.equal(read("lib/content/process.ts").slugify(fx.applyTextEffect("[[My Heading]]", "glow", options)), "my-heading");
});

test("effect settings reject unsafe CSS and clamp costly glow values without changing legacy markers", () => {
  const fx = loader()("lib/content/text-effects.ts");
  assert.deepEqual(fx.cleanEffectOptions({color:"url(https://invalid.example)",glowColor:"red;position:fixed",glowStrength:5,glowRadius:9999,glowMode:"invalid"}), {glowStrength:1,glowRadius:32});
  assert.deepEqual(fx.cleanEffectOptions({glowStrength:NaN,glowRadius:Infinity}), {});
  assert.deepEqual(fx.cleanEffectOptions({glowStrength:-1,glowRadius:-20}), {glowStrength:0,glowRadius:1});
  assert.deepEqual(fx.selectedEffectOptions("[[glow;color=red;glowRadius=Infinity;glowStrength=0|4+]]"), {glowStrength:0});
  assert.equal(fx.applyTextEffect("[[4+]]", "particles"), "[[4+]]");
  assert.equal(fx.applyTextEffect("[[glow|4+]]", "glow"), "[[glow|4+]]");
  assert.deepEqual(fx.effectStyle({}), {});
});

test("particle controls round-trip with numbers, retain colours through presets, and stay field-local", () => {
  const read = loader(), fx = read("lib/content/text-effects.ts");
  const options = { color: "#12abcd", particleColor: "#e94b92", particleSize: .75, particleScatter: 6, particleSpeed: 1.2, particleGlow: .6 };
  const encoded = fx.applyTextEffect("[[30+]]", "particles", options);
  assert.equal(fx.editableFx(encoded), "[[30+]]");
  assert.equal(fx.plainFx(encoded), "30+");
  assert.deepEqual(fx.selectedEffectOptions(encoded), options);
  const content = json("content/site-content.json"), neighbour = clone(content.home.stats[1]);
  content.home.stats[0].value = encoded;
  const saved = read("lib/content/sanitize.ts").sanitizeContent(JSON.parse(JSON.stringify(content)));
  const moved = read("app/portal/reorder-content.ts").reorderContent(saved, "home.stats", 0, 1);
  assert.equal(moved.home.stats[1].value, encoded);
  assert.deepEqual(moved.home.stats[0], neighbour);
  assert.deepEqual(fx.selectedEffectOptions(fx.applyTextEffect(encoded, "glow")), options);
  for (const preset of fx.PARTICLE_PRESETS) {
    const next = fx.applyTextEffect(encoded, "particles", { ...options, ...preset.options });
    assert.equal(fx.selectedEffectOptions(next).particleColor, options.particleColor);
    assert.equal(fx.selectedEffectOptions(next).color, options.color);
  }
  assert.equal(fx.applyTextEffect(encoded, "particles", {}), "[[30+]]");
});

test("particle settings reject unsafe colours, clamp movement and preserve explicit zero", () => {
  const fx = loader()("lib/content/text-effects.ts");
  assert.deepEqual(fx.cleanEffectOptions({particleColor:"red;position:fixed",particleSize:99,particleScatter:99,particleSpeed:99,particleGlow:99}),
    {particleSize:1.6,particleScatter:8,particleSpeed:2,particleGlow:1});
  assert.deepEqual(fx.cleanEffectOptions({particleSize:NaN,particleScatter:Infinity,particleSpeed:"1",particleGlow:-Infinity}), {});
  assert.deepEqual(fx.selectedEffectOptions("[[particles;particleColor=#00AAEE;particleSize=-2;particleScatter=0;particleSpeed=0;particleGlow=0|4+]]"),
    {particleColor:"#00aaee",particleSize:.5,particleScatter:0,particleSpeed:.5,particleGlow:0});
  for (const preset of fx.PARTICLE_PRESETS) assert.deepEqual(fx.cleanEffectOptions(preset.options), preset.options);
  assert.equal(fx.applyTextEffect("[[4+]]", "particles"), "[[4+]]", "Legacy dots keep their defaults");
});

test("heading effects survive sanitizing and card moves without changing page addresses", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { reorderContent } = read("app/portal/reorder-content.ts");
  const content = json("content/site-content.json");
  content.home.process.cards[0].title = "[[sheen|A special heading]]";
  const clean = sanitizeContent(content);
  const moved = reorderContent(clean, "home.process.cards", 0, 1);
  assert.equal(moved.home.process.cards[1].title, "[[sheen|A special heading]]");
  assert.equal(moved.home.process.cards[1].slug, clean.home.process.cards[0].slug);
  assert.equal(read("lib/content/process.ts").slugify("[[glow|A special heading]]"), "a-special-heading");
});

test("preview reorder preserves content and renumbers projects without mutating the draft", () => {
  const { reorderContent } = loader()("app/portal/reorder-content.ts");
  const original = json("content/site-content.json");
  const before = clone(original);
  const result = reorderContent(original, "projects", 0, 3);
  assert.equal(result.projects[3].slug, original.projects[0].slug);
  assert.deepEqual(result.projects.slice(0, 3).map((p) => p.slug), original.projects.slice(1, 4).map((p) => p.slug));
  assert.deepEqual(result.projects.map((p) => p.order), result.projects.map((_, i) => i + 1));
  assert.equal(result.site, original.site);
  assert.deepEqual(original, before);
  assert.deepEqual(reorderContent(result, "projects", 3, 0).projects.map((p) => p.slug), original.projects.map((p) => p.slug));
});

test("preview reorder validates paths and positions and keeps nested cards together", () => {
  const { reorderContent } = loader()("app/portal/reorder-content.ts");
  const content = json("content/site-content.json");
  for (const [list, from, to] of [["projects", -1, 0], ["projects", 0, 9999], ["projects", .5, 1], ["projects", 0, 0], ["projects", "0", 1], ["site", 0, 1], ["__proto__.cards", 0, 1], ["projects.999.images", 0, 1]]) {
    assert.equal(reorderContent(content, list, from, to), content);
  }
  const custom = { ...content, projects: [{ ...content.projects[0], images: [{src:"a", alt:"A"}, {src:"b", alt:"B"}, {src:"c", alt:"C"}] }] };
  const result = reorderContent(custom, "projects.0.images", 2, 0);
  assert.deepEqual(result.projects[0].images, [{src:"c", alt:"C"}, {src:"a", alt:"A"}, {src:"b", alt:"B"}]);
  assert.equal(custom.projects[0].images[0].src, "a");
});

function panelHarness(file, name, props = {}) {
  const slots = [];
  let cursor = 0;
  const state = (initial) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = initial;
    return [slots[at], (value) => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
  };
  const Component = loader({
    react: { useState: state, useRef: (value) => state({ current: value })[0], useCallback: (fn) => fn, useEffect: () => {} },
    "./activity.module.css": {}, "./inbox.module.css": {},
  })(file)[name];
  return { render() {
    cursor = 0;
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node); walk(node.props?.children);
    };
    walk(Component(props));
    return { nodes, button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text), find: (type) => nodes.find((node) => node.type === type) };
  } };
}

test("failed optimistic changes preserve new rows, updated replies, and later status changes", () => {
  const { rollbackStatus, appendUnique } = loader()("app/portal/list-state.ts");
  const rows = [{ id: "one", status: "archived", replies: ["new reply"] }, { id: "two", status: "new" }];
  const restored = rollbackStatus(rows, "one", "archived", "read");
  assert.deepEqual(restored, [{ id: "one", status: "read", replies: ["new reply"] }, rows[1]]);
  assert.deepEqual(rollbackStatus(rows, "one", "new", "read"), rows);
  assert.deepEqual(appendUnique([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((row) => row.id), ["a", "b", "c"]);
});

test("activity pagination ignores double clicks and keeps overlapping pages unique", async () => {
  const previous = globalThis.fetch;
  const entry = (id) => ({ id, at: "2026-10-30T10:00:00Z", action: "sign-in", name: "Test", ok: true, device: "Test browser", ip: "local" });
  try {
    globalThis.fetch = async () => Response.json({ entries: [entry("a"), entry("b")], more: true, people: [], scope: "everyone" });
    const ui = panelHarness("app/portal/ActivityPanel.tsx", "ActivityPanel", { me: { role: "owner" } });
    await ui.render().button("↻ Refresh").props.onClick();
    let calls = 0;
    let respond;
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { respond = resolve; }); };
    const older = ui.render().button("Show older activity").props.onClick;
    const pending = older(); await older();
    assert.equal(calls, 1);
    assert.ok(ui.render().nodes.some((node) => node.type === "button" && node.props.disabled));
    respond(Response.json({ entries: [entry("b"), entry("c")], more: false, people: [], scope: "everyone" }));
    await pending;
    const screen = ui.render();
    assert.equal(screen.nodes.filter((node) => node.type === "li").length, 3);
    assert.ok(screen.nodes.some((node) => typeof node.props.children === "string" && node.props.children.startsWith("Older activity stays open")));
  } finally { globalThis.fetch = previous; }
});

const sampleEnquiry = { id: "enquiry-one", status: "read", name: "Test Visitor", email: "visitor@example.invalid", phone: "", company: "", projectType: "Poster", message: "A test enquiry", at: "2026-10-30T10:00:00Z", replies: [] };

test("an old inbox refresh cannot undo an archive completed after that refresh started", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ enquiries: [sampleEnquiry], mailConfigured: true });
    const ui = panelHarness("app/portal/InboxPanel.tsx", "InboxPanel");
    await ui.render().button("↻ Refresh").props.onClick();
    ui.render().nodes.find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
    let respond;
    let readSignal;
    globalThis.fetch = (_url, options) => {
      if (options.method === "PATCH") return Promise.resolve(Response.json({ ok: true }));
      readSignal = options.signal;
      return new Promise((resolve) => { respond = resolve; });
    };
    const refresh = ui.render().button("↻ Refresh").props.onClick();
    await ui.render().button("Archive").props.onClick();
    assert.equal(readSignal.aborted, true);
    respond(Response.json({ enquiries: [sampleEnquiry], mailConfigured: true }));
    await refresh;
    assert.ok(ui.render().button("Move back"));
    assert.equal(ui.render().button("Archive"), undefined);
  } finally { globalThis.fetch = previous; }
});

test("reply double-submission is blocked and unconfirmed replies keep the typed draft", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ enquiries: [sampleEnquiry], mailConfigured: true });
    const ui = panelHarness("app/portal/InboxPanel.tsx", "InboxPanel");
    await ui.render().button("↻ Refresh").props.onClick();
    ui.render().nodes.find((node) => node.type === "button" && node.props["aria-expanded"] === false).props.onClick();
    ui.render().button("✉ Reply").props.onClick();
    ui.render().find("textarea").props.onChange({ target: { value: "Test reply; never actually emailed." } });
    let calls = 0;
    let respond;
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { respond = resolve; }); };
    const submit = ui.render().find("form").props.onSubmit;
    submit({ preventDefault() {} }); submit({ preventDefault() {} });
    assert.equal(calls, 1);
    respond(Response.json({ ok: true }));
    await new Promise(setImmediate);
    const screen = ui.render();
    assert.equal(screen.find("textarea").props.value, "Test reply; never actually emailed.");
    assert.ok(screen.nodes.some((node) => node.props.role === "alert" && node.props.children.includes("did not confirm")));
    assert.equal(screen.button("Send reply").props.disabled, false);
  } finally { globalThis.fetch = previous; }
});

test("visible polling stops background work, never overlaps, and aborts on hide or cleanup", async () => {
  const originals = new Map(["document", "setTimeout", "clearTimeout"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const handlers = new Map();
  const timers = new Map();
  let id = 0;
  const doc = { hidden: true, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener: (key) => handlers.delete(key) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  globalThis.setTimeout = (fn) => { timers.set(++id, fn); return id; };
  globalThis.clearTimeout = (key) => timers.delete(key);
  try {
    const { startVisiblePoll } = loader()("lib/visible-poll.ts");
    const signals = [];
    let finish;
    const stop = startVisiblePoll((signal) => {
      signals.push(signal);
      return new Promise((resolve) => { finish = resolve; signal.addEventListener("abort", resolve); });
    }, 30_000);
    assert.equal(signals.length, 0, "A hidden page must not start a request");
    doc.hidden = false;
    handlers.get("visibilitychange")();
    handlers.get("visibilitychange")();
    assert.equal(signals.length, 1, "Repeated visibility events must not duplicate requests");
    assert.equal(timers.size, 0, "No interval while the previous request is pending");
    finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 1);
    const [key, tick] = timers.entries().next().value;
    timers.delete(key); tick();
    assert.equal(signals.length, 2);
    doc.hidden = true; handlers.get("visibilitychange")();
    assert.equal(signals[1].aborted, true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 0);
    doc.hidden = false; handlers.get("visibilitychange")();
    assert.equal(signals.length, 3);
    stop();
    assert.equal(signals[2].aborted, true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(timers.size, 0);
    assert.equal(handlers.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("preview navigation preserves the latest page selection while the initial iframe is still loading", () => {
  const { requestPreviewRoute, finishPreviewLoad } = loader()("app/portal/preview-frame.ts");
  const calls = [];
  const pending = { current: null };
  const location = { pathname: "blank", assign: (url) => calls.push(["assign", url]), replace: (url) => calls.push(["replace", url]) };
  const frame = { contentWindow: { location } };
  requestPreviewRoute(frame, "/work", pending);
  assert.equal(pending.current, "/work");
  assert.equal(calls.length, 0);
  requestPreviewRoute(frame, "/breakdowns", pending);
  location.pathname = "/";
  finishPreviewLoad(frame, pending);
  assert.deepEqual(calls, [["replace", "/breakdowns?portal-preview"]]);
  location.pathname = "/breakdowns";
  finishPreviewLoad(frame, pending);
  assert.equal(pending.current, null);
  requestPreviewRoute(frame, "/work", pending);
  assert.deepEqual(calls.at(-1), ["assign", "/work?portal-preview"]);
  location.pathname = "/work";
  finishPreviewLoad(frame, pending);
  assert.equal(pending.current, null);
});

test("slate markup starts in assembly pose, honors portal appearance, and links only to existing projects", () => {
  const Link = () => null;
  const { ProofTableFallback } = loader({
    react: { useRef: () => ({ current: null }), useEffect: () => {} },
    "next/link": { default: Link },
    "./ProofTable.module.css": {},
  })("components/proof-table/Fallback.tsx");
  const item = { type: "title-png", src: "", slug: "film", film: "Film", tag: "Title", year: 2026 };
  const look = { slabColor: "#123456", slabOpacity: 0.4, glassColor: "#abcdef", glassOpacity: 0.5, reflection: 0.6, frost: 0.2, cardSize: 1 };
  const tree = ProofTableFallback({ items: [item, { ...item, slug: "missing" }], children: "Copy", projectSlugs: ["film"], look });
  const nodes = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    nodes.push(node); walk(node.props?.children);
  };
  walk(tree);
  const scene = nodes.find((node) => node.props["data-assembly"]);
  assert.equal(scene.props["data-assembly"], "ready");
  assert.equal(scene.props["data-paused"], "true");
  assert.equal(scene.props.style["--slab-tint"], "#123456");
  assert.equal(scene.props.style["--glass-opacity"], "50%");
  const links = nodes.filter((node) => node.props.href);
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, "/work/film");
  assert.equal(links[0].props["aria-label"], "View Film");
});

test("slate rendering sleeps when settled, coalesces wakes, and stops when hidden or disposed", () => {
  const originals = new Map(["requestAnimationFrame", "cancelAnimationFrame", "performance"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let next = 0;
  let clock = 100;
  const frames = new Map();
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => clock } });
  globalThis.requestAnimationFrame = (fn) => { frames.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const advance = (time) => { const [id, fn] = frames.entries().next().value; frames.delete(id); clock = time; fn(time); };
  try {
    const { createFrameLoop } = loader()("components/proof-table/frame-loop.ts");
    let allowed = true;
    let moving = false;
    const steps = [];
    const loop = createFrameLoop((dt) => { steps.push(dt); return moving; }, () => allowed);
    loop.wake(); loop.wake(); loop.wake();
    assert.equal(frames.size, 1);
    advance(116);
    assert.equal(frames.size, 0, "Idle slate must not keep scheduling frames");
    moving = true;
    loop.wake(); advance(132);
    assert.equal(frames.size, 1);
    allowed = false;
    advance(148);
    assert.equal(steps.length, 2);
    loop.wake();
    assert.equal(frames.size, 0);
    allowed = true;
    loop.wake(); advance(10_000);
    assert.equal(steps.at(-1), 0.05, "Long stalls never produce an unbounded spring step");
    loop.dispose(); loop.wake();
    assert.equal(frames.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("slate hover is bounded, batched, disabled during assembly/touch/reduced motion, and fully cleaned up", () => {
  const originals = new Map(["requestAnimationFrame", "cancelAnimationFrame", "window", "document", "Element"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = () => {
    const handlers = new Map();
    return { handlers, addEventListener: (key, fn) => handlers.set(key, fn), removeEventListener: (key) => handlers.delete(key), emit: (key, event) => handlers.get(key)?.(event) };
  };
  const motion = { ...events(), matches: false };
  const fine = { ...events(), matches: true };
  const doc = { ...events(), hidden: false };
  const values = new Map();
  class Element {
    dataset = {};
    style = { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) };
    closest() { return this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  }
  const slot = new Element();
  const scene = { ...events(), dataset: { assembly: "done" }, contains: (el) => el === slot };
  const frames = new Map();
  let id = 0;
  Object.defineProperty(globalThis, "Element", { configurable: true, value: Element });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: (q) => q.includes("reduced") ? motion : fine } });
  globalThis.requestAnimationFrame = (fn) => { frames.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = (key) => frames.delete(key);
  const pointer = { target: slot, pointerType: "mouse", clientX: 200, clientY: -50 };
  try {
    const { bindGlassHover } = loader()("components/proof-table/hover.ts");
    const stop = bindGlassHover(scene);
    scene.emit("pointermove", pointer); scene.emit("pointermove", pointer);
    assert.equal(frames.size, 1);
    for (const [key, fn] of frames) { frames.delete(key); fn(); }
    assert.equal(slot.dataset.floating, "true");
    assert.equal(values.get("--glass-rx"), "3.00deg");
    assert.equal(values.get("--glass-ry"), "3.00deg");
    scene.emit("pointerleave");
    assert.equal(slot.dataset.floating, undefined);
    assert.equal(values.size, 0);
    scene.dataset.assembly = "playing";
    scene.emit("pointermove", pointer);
    scene.dataset.assembly = "done";
    scene.emit("pointermove", { ...pointer, pointerType: "touch" });
    motion.matches = true;
    scene.emit("pointermove", pointer);
    assert.equal(frames.size, 0);
    motion.matches = false;
    scene.emit("pointermove", pointer);
    doc.hidden = true;
    doc.emit("visibilitychange");
    assert.equal(frames.size, 0);
    stop();
    assert.equal(scene.handlers.size + doc.handlers.size + motion.handlers.size + fine.handlers.size, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("library loading distinguishes empty results from authentication, server and malformed-response failures", async () => {
  const previous = globalThis.fetch;
  const { readMediaLibrary } = loader()("app/portal/media-library.ts");
  const signal = new AbortController().signal;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.signal, signal);
      assert.equal(options.cache, "no-store");
      return Response.json({ images: [], removable: [] });
    };
    assert.deepEqual(await readMediaLibrary(signal), { images: [], removable: [], deletable: [], hidden: [], uploadedAt: {} });
    for (const status of [401, 500]) {
      globalThis.fetch = async () => Response.json({ error: "Unavailable" }, { status });
      await assert.rejects(readMediaLibrary(signal), status === 401 ? /another tab/ : /retry/);
    }
    for (const body of [{}, { images: [null], removable: [] }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(readMediaLibrary(signal), /incomplete/);
    }
    globalThis.fetch = async () => Response.json({ images: ["one", "one"], removable: ["one", "missing"] });
    assert.deepEqual(await readMediaLibrary(signal), { images: ["one"], removable: ["one"], deletable: ["one"], hidden: [], uploadedAt: {} });
    globalThis.fetch = async () => Response.json({ images: ["/images/uploads/new.jpg"], removable: ["/images/uploads/new.jpg"], deletable: [], hidden: ["/images/old.png"], uploadedAt: { "/images/uploads/new.jpg": 200, "/images/old.png": 100, missing: 300 } });
    assert.deepEqual(await readMediaLibrary(signal), { images: ["/images/uploads/new.jpg"], removable: ["/images/uploads/new.jpg"], deletable: [], hidden: ["/images/old.png"], uploadedAt: { "/images/uploads/new.jpg": 200, "/images/old.png": 100 } });
  } finally { globalThis.fetch = previous; }
});

test("saving preserves edits made while the request is pending and accepts normalization for an unchanged draft", async () => {
  const original = globalThis.fetch;
  const { saveDraft, reconcileSaved } = loader()("app/portal/save-draft.ts");
  const submitted = { title: "First title " };
  let current = submitted;
  let saved;
  let respond;
  globalThis.fetch = () => new Promise((resolve) => { respond = resolve; });
  try {
    const request = saveDraft([{ label: "Content", url: "/content", body: submitted, responseKey: "content", accept: (value) => {
      saved = value;
      current = reconcileSaved(current, submitted, value);
    } }]);
    current = { title: "Newer title" };
    respond(Response.json({ content: { title: "First title" } }));
    await request;
    assert.deepEqual(saved, { title: "First title" });
    assert.deepEqual(current, { title: "Newer title" });
    assert.deepEqual(reconcileSaved(submitted, submitted, saved), saved);
  } finally { globalThis.fetch = original; }
});

test("partial saves keep successful sections and report expired sessions without accepting failed content", async () => {
  const original = globalThis.fetch;
  const { saveDraft, SaveError } = loader()("app/portal/save-draft.ts");
  const accepted = [];
  const responses = [Response.json({ settings: { color: "gold" } }), Response.json({ error: "Session ended" }, { status: 401 })];
  globalThis.fetch = async () => responses.shift();
  try {
    await assert.rejects(saveDraft([
      { label: "Design settings", url: "/settings", body: {}, responseKey: "settings", accept: () => accepted.push("settings") },
      { label: "Content", url: "/content", body: {}, responseKey: "content", accept: () => accepted.push("content") },
    ]), (error) => {
      assert.ok(error instanceof SaveError);
      assert.equal(error.status, 401);
      assert.deepEqual(error.completed, ["Design settings"]);
      assert.match(error.message, /Design settings saved/);
      assert.match(error.message, /another tab/);
      return true;
    });
    assert.deepEqual(accepted, ["settings"]);
  } finally { globalThis.fetch = original; }
});

test("a failed edge reply is accepted only when the published document matches the submitted save", async () => {
  const original = globalThis.fetch;
  const { saveDraft } = loader()("app/portal/save-draft.ts");
  const submitted = { title: "Updated" };
  const accepted = [];
  const job = { label: "Content", url: "/content", body: submitted, responseKey: "content",
    verifyUrl: "/published", matches: value => value.title === submitted.title, accept: value => accepted.push(value) };
  try {
    globalThis.fetch = async url => url === "/content" ? Response.json({}, { status: 500 }) : Response.json(submitted);
    await saveDraft([job]);
    assert.deepEqual(accepted, [submitted]);
    globalThis.fetch = async url => url === "/content" ? Response.json({}, { status: 500 }) : Response.json({ title: "Old" });
    await assert.rejects(saveDraft([job]), /retry/i);
    assert.equal(accepted.length, 1);
  } finally { globalThis.fetch = original; }
});

test("original disc title mode and zero-to-full impact survive saving without altering glass defaults", () => {
  const { sanitizeIntroSettings } = loader()("lib/intro/settings.ts");
  const saved = json("content/intro-settings.json");
  const item = saved.proofTable.items[0];
  item.titleAppearance = "original";
  item.titleImpact = 0;
  let result = sanitizeIntroSettings(saved).proofTable.items[0];
  assert.equal(result.titleAppearance, "original");
  assert.equal(result.titleImpact, 0);
  item.titleImpact = 3;
  result = sanitizeIntroSettings(saved).proofTable.items[0];
  assert.equal(result.titleImpact, 1);
  item.titleAppearance = "invalid";
  result = sanitizeIntroSettings(saved).proofTable.items[0];
  assert.equal(result.titleAppearance, undefined);
});

test("malformed save replies and network failures leave the draft unaccepted", async () => {
  const original = globalThis.fetch;
  const { saveDraft } = loader()("app/portal/save-draft.ts");
  let accepted = 0;
  const job = { label: "Content", url: "/content", body: { title: "Draft" }, responseKey: "content", accept: () => accepted++ };
  try {
    for (const body of [{}, { content: null }, { content: [] }, { content: {} }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(saveDraft([job]), /did not confirm/);
    }
    globalThis.fetch = async () => { throw new TypeError("Network down"); };
    await assert.rejects(saveDraft([job]), /draft is still here/);
    assert.equal(accepted, 0);
  } finally { globalThis.fetch = original; }
});

test("a timed-out save aborts its request and clears the timer", async () => {
  const original = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const { saveDraft } = loader()("app/portal/save-draft.ts");
  let expire;
  let cleared = false;
  globalThis.setTimeout = (fn) => { expire = fn; return 123; };
  globalThis.clearTimeout = (id) => { cleared = id === 123; };
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("Aborted")));
  });
  try {
    const request = saveDraft([{ label: "Content", url: "/content", body: {}, responseKey: "content", accept: () => assert.fail("Timed-out save accepted") }]);
    expire();
    await assert.rejects(request, /took too long/);
    assert.equal(cleared, true);
  } finally { Object.assign(globalThis, original); }
});

test("nested dialogs contain focus, close only the top dialog, and restore the previous control", () => {
  const previous = new Map(["document", "Node", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  let doc;
  class Element {
    constructor(children = []) { this.children = children; this.isConnected = true; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    getClientRects() { return this.isConnected ? [{}] : []; }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return this.children; }
    focus() { doc.activeElement = this; emit("focusin", { target: this }); }
  }
  const emit = (name, event) => {
    for (const fn of [...(listeners.get(name) ?? [])]) { if (event.stopped) break; fn(event); }
  };
  const key = (name, shiftKey = false) => {
    const event = { key: name, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    emit("keydown", event);
    return event;
  };
  const trigger = new Element();
  const first = new Element();
  const last = new Element();
  const parent = new Element([first, last]);
  const childControl = new Element();
  const child = new Element([childControl]);
  const dialogs = [parent];
  doc = { body: new Element(), activeElement: trigger, querySelectorAll: () => dialogs,
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "Node", { configurable: true, value: Element });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: Element });
  try {
    const { bindDialogFocus } = loader()("app/portal/dialog-focus.ts");
    let parentClosed = 0;
    let childClosed = 0;
    const releaseParent = bindDialogFocus(parent, () => parentClosed++);
    assert.equal(doc.activeElement, first);
    last.focus();
    assert.equal(key("Tab").defaultPrevented, true);
    assert.equal(doc.activeElement, first);
    key("Tab", true);
    assert.equal(doc.activeElement, last);
    trigger.focus();
    assert.equal(doc.activeElement, first, "Background controls cannot steal modal focus");
    dialogs.push(child);
    const releaseChild = bindDialogFocus(child, () => childClosed++);
    key("Escape");
    assert.equal(parentClosed, 0);
    assert.equal(childClosed, 1);
    dialogs.pop();
    child.isConnected = false;
    doc.activeElement = doc.body;
    releaseChild();
    assert.equal(doc.activeElement, first);
    key("Escape");
    assert.equal(parentClosed, 1);
    dialogs.pop();
    parent.isConnected = false;
    doc.activeElement = doc.body;
    releaseParent();
    assert.equal(doc.activeElement, trigger);
    assert.equal([...listeners.values()].reduce((n, set) => n + set.size, 0), 0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("deleting an item waits for library work, retains failures for retry, and suppresses duplicate submissions", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { body: {} } });
  const slots = [];
  let cursor = 0;
  const state = (initial) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = initial;
    return [slots[at], (value) => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
  };
  const src = "/images/uploads/test.webp";
  const item = { name: "Card", src };
  let removeCalls = 0;
  let itemDeleted = 0;
  let fail;
  let remove = () => new Promise((_resolve, reject) => { fail = reject; });
  const { useConfirmDelete: renderDelete } = loader({
    react: { useState: state, useRef: (initial) => state({ current: initial })[0] },
    "react-dom": { createPortal: (node) => node },
    "./dialog-focus": { useDialogFocus: () => {} },
    "./ContentEditor": { useEditor: () => ({ content: { cards: [item] }, media: { removable: [src], deletable: [src], remove: async () => { removeCalls++; await remove(); } } }) },
    "./content.module.css": {},
  })("app/portal/DeleteDialog.tsx");
  const render = () => {
    cursor = 0;
    const ui = renderDelete();
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      nodes.push(node);
      walk(node.props?.children);
    };
    walk(ui.dialog);
    return { ...ui, nodes, button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text) };
  };
  try {
    render().ask({ what: "Card", item, onDelete: () => itemDeleted++ });
    render().nodes.find((node) => node.type === "input").props.onChange({ target: { checked: true } });
    const confirm = render().button("Delete with pictures").props.onClick;
    const pending = confirm();
    await confirm();
    assert.equal(removeCalls, 1);
    assert.equal(itemDeleted, 0, "The editor must remain mounted until library work finishes");
    fail(new Error("Offline"));
    await pending;
    assert.equal(itemDeleted, 0);
    assert.ok(render().nodes.some((node) => node.props.role === "alert"));
    assert.ok(render().button("Delete item only"));
    remove = async () => {};
    await render().button("Retry delete").props.onClick();
    assert.equal(itemDeleted, 1);
    assert.equal(render().dialog, null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("slate assembly pauses out of view, releases its animation on completion, and respects reduced motion", () => {
  const previous = new Map(["window", "document", "IntersectionObserver"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const target = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
      emit: (name, event = {}) => listeners.get(name)?.(event),
    };
  };
  try {
    const doc = { ...target(), hidden: false };
    const motion = { ...target(), matches: false };
    let seen;
    let disconnected = false;
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => motion } });
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class {
      constructor(callback) { seen = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    } });
    const { startAssembly } = loader()("components/proof-table/assembly.ts");
    const scene = { dataset: {} };
    const slab = target();
    const cleanup = startAssembly(scene, slab);
    assert.equal(scene.dataset.assembly, "ready");
    assert.equal(scene.dataset.paused, "true");
    seen([{ isIntersecting: true }]);
    assert.equal(scene.dataset.assembly, "playing");
    assert.equal(scene.dataset.paused, "false");
    doc.hidden = true;
    doc.emit("visibilitychange");
    assert.equal(scene.dataset.paused, "true");
    doc.hidden = false;
    doc.emit("visibilitychange");
    assert.equal(scene.dataset.paused, "false");
    seen([{ isIntersecting: false }]);
    assert.equal(scene.dataset.paused, "true");
    seen([{ isIntersecting: true }]);
    slab.emit("animationend", { target: {} });
    assert.equal(scene.dataset.assembly, "playing", "card completion must not cut the table animation short");
    slab.emit("animationend", { target: slab });
    assert.equal(scene.dataset.assembly, "done");
    assert.equal(disconnected, true);
    assert.equal(doc.listeners.size + motion.listeners.size + slab.listeners.size, 0);
    seen([{ isIntersecting: true }]);
    assert.equal(scene.dataset.assembly, "done", "completed assembly must not replay");
    cleanup();
    assert.deepEqual(scene.dataset, {});
    motion.matches = true;
    const reducedScene = { dataset: {} };
    const cleanupReduced = startAssembly(reducedScene, target());
    assert.equal(reducedScene.dataset.assembly, "done");
    assert.equal(doc.listeners.size + motion.listeners.size, 0);
    cleanupReduced();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("local origin checks accept Next-normalized loopback addresses without accepting foreign sites", () => {
  const { NextRequest } = nativeRequire("next/server");
  const { requestOriginMatches } = loader()("lib/request-origin.ts");
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    for (const address of ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"]) {
      const req = new NextRequest(address + "/api/portal/session", { headers: { origin: address, host: new URL(address).host } });
      assert.equal(requestOriginMatches(req), true, address);
    }
    const local = (origin, host = "127.0.0.1:3000") => new NextRequest("http://127.0.0.1:3000/api/portal/session", { headers: { origin, host } });
    for (const origin of ["https://untrusted.example", "http://127.0.0.1:3001", "https://127.0.0.1:3000", "null", "http://127.0.0.1.evil.test:3000", "http://127.0.0.1:3000/path"]) {
      assert.equal(requestOriginMatches(local(origin)), false, origin);
    }
    assert.equal(requestOriginMatches(local("http://127.0.0.1:3000", "other.example")), false);
    assert.equal(requestOriginMatches(new NextRequest("http://localhost:3000/api/portal/session")), false);
    process.env.NODE_ENV = "production";
    assert.equal(requestOriginMatches(local("http://127.0.0.1:3000")), false);
    const production = (origin) => new NextRequest("https://studio.test/api/portal/session", { headers: { origin, host: "studio.test" } });
    assert.equal(requestOriginMatches(production("https://studio.test")), true);
    assert.equal(requestOriginMatches(production("https://untrusted.example")), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("responsive image URLs resize both upload libraries without duplicate width parameters", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { default: imageLoader } = loader()("lib/image-loader.ts");
    const { resizedSrc, srcSetFor } = loader()("lib/images.ts");
    for (const folder of ["uploads", "proof-table"]) {
      const src = `/images/${folder}/picture.webp?v=abc&w=100`;
      const url = new URL(imageLoader({ src, width: 640 }), "https://test.invalid");
      assert.equal(url.searchParams.get("v"), "abc");
      assert.deepEqual(url.searchParams.getAll("w"), ["640"]);
      assert.equal(new URL(resizedSrc(src, 160), "https://test.invalid").searchParams.get("w"), "160");
      assert.equal(srcSetFor(src, [160, 320]).includes("/_next/image"), false);
    }
    assert.equal(srcSetFor("/images/uploads/logo.svg"), undefined);
    assert.equal(srcSetFor("/images/uploads/animation.gif"), undefined);
    assert.ok(srcSetFor("/images/posters/example.jpg").includes("q=90"));
    process.env.NODE_ENV = "development";
    assert.equal(resizedSrc("/images/proof-table/art.webp", 160), "/images/proof-table/art.webp");
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test("slate upload route forwards valid resize requests and ignores invalid widths", async () => {
  const calls = [];
  const route = loader({ "@/lib/storage": { serveUpload: (...args) => { calls.push(args); return new Response(); } } })("app/images/proof-table/[name]/route.ts");
  for (const width of ["320", "NaN", "-5", "Infinity"]) {
    await route.GET(new Request(`https://test.invalid/images/proof-table/art.webp?w=${width}`), { params: Promise.resolve({ name: "art.webp" }) });
  }
  assert.deepEqual(calls.map((args) => args[2]), [320, undefined, undefined, undefined]);
  assert.equal(calls[0][0], "uploads/proof/");
});

test("browser image conversion releases decoded pixels after success and each failure path", async () => {
  const previous = new Map(["document", "createImageBitmap"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    const { prepareImage } = loader()("app/portal/upload.ts");
    for (const mode of ["success", "no-context", "draw-failed", "encode-failed", "empty-blob"]) {
      let closed = 0;
      const canvases = [];
      Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async () => ({ width: 20, height: 10, close: () => closed++ }) });
      Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => {
        const canvas = {
          width: 0, height: 0,
          getContext: () => mode === "no-context" ? null : { drawImage: () => { if (mode === "draw-failed") throw new Error("draw failed"); } },
          toBlob: (done) => { if (mode === "encode-failed") throw new Error("encode failed"); done(mode === "empty-blob" ? null : new Blob(["test"], { type: "image/webp" })); },
        };
        canvases.push(canvas);
        return canvas;
      } } });
      const result = prepareImage(new File(["test"], "test.bmp", { type: "image/bmp" }));
      if (mode === "success") assert.equal((await result).name, "test.webp");
      else await assert.rejects(result);
      assert.equal(closed, 1, mode);
      assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0), mode);
    }
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Photoshop limits reject large files and decoded dimensions before allocating pixels", async () => {
  const read = loader();
  const { MAX_PSD_MB, assertPsdBounds } = read("app/portal/psd-budget.ts");
  assert.doesNotThrow(() => assertPsdBounds(4000, 4000, 8));
  for (const args of [[8000, 8000], [10000, 1], [4000, 4000, 16], [NaN, 4]]) assert.throws(() => assertPsdBounds(...args), /too large/);
  const large = { name: "large.psd", size: (MAX_PSD_MB + 1) * 1024 * 1024 };
  assert.match(read("app/portal/upload.ts").checkFile(large, "psd"), /64 MB/);
  const { readPsdLayers } = read("app/portal/psd.ts");
  await assert.rejects(readPsdLayers({ ...large, arrayBuffer: () => { throw new Error("must not read"); } }), /limited to 64 MB/);
});

test("Photoshop imports decode one layer at a time, preserve placement, and release pixels", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const sources = [];
  const draws = [];
  let decoded = 0;
  const layers = [
    { name: "Bottom", left: 10, top: 20, right: 30, bottom: 50, opacity: .5, rawData: { bitsPerChannel: 8 } },
    { name: "Top", left: 30, top: 40, right: 50, bottom: 60, rawData: { bitsPerChannel: 8 } },
    { name: "Hidden", left: 0, top: 0, right: 50, bottom: 60, hidden: true, rawData: { bitsPerChannel: 8 } },
  ];
  const context = { drawImage: (...args) => draws.push(args), globalAlpha: 1 };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  try {
    const { readPsdLayers } = loader({ "ag-psd": {
      readPsd: (_, options) => {
        assert.equal(options.useRawData, true);
        assert.equal(options.skipCompositeImageData, true);
        return { width: 100, height: 100, bitsPerChannel: 8, children: layers };
      },
      getLayerCanvas: (layer) => {
        assert.ok(sources.every(c => c.width === 0), "Previous source pixels released before decoding next layer");
        decoded++;
        const canvas = { width: layer.right-layer.left, height: layer.bottom-layer.top };
        sources.push(canvas);
        return canvas;
      },
    } })("app/portal/psd.ts");
    const result = await readPsdLayers({ size: 100, arrayBuffer: async () => new ArrayBuffer(0) });
    assert.equal(decoded, 0);
    assert.equal(result.layers.length, 2);
    assert.equal(result.skipped, 1);
    const canvas = result.layers[0].draw();
    assert.equal(canvas.width, 100);
    assert.deepEqual(draws[0].slice(1), [10,20,20,30]);
    assert.equal(context.globalAlpha, .5);
    assert.equal(sources[0].width, 0);
    assert.equal(layers[0].rawData, undefined);
    result.dispose();
    assert.ok(layers.every(layer => !layer.rawData), "Unused layers are released on failure or completion too");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
  }
});

test("layer PNG conversion releases its canvas even when encoding throws", async () => {
  const { canvasToPng } = loader()("app/portal/psd.ts");
  const canvas = { width: 100, height: 100, toBlob: () => { throw new Error("encoder failed"); } };
  await assert.rejects(canvasToPng(canvas, "layer.png"), /encoder failed/);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test("real Photoshop raw decoding preserves layer pixels, transparency and order", () => {
  const psd = nativeRequire("ag-psd");
  psd.initializeCanvas(() => { throw new Error("This fixture uses image data only"); },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
  const pixels = new Uint8ClampedArray([255,20,40,128, 10,80,120,255, 0,0,0,0, 70,90,110,200]);
  const imageData = { width: 2, height: 2, data: pixels };
  const bytes = psd.writePsdBuffer({ width: 2, height: 2, imageData, children: [
    { name: "Bottom", left: 0, top: 0, imageData },
    { name: "Top", left: 0, top: 0, imageData },
  ] });
  const decoded = psd.readPsd(bytes, { useRawData: true, skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  assert.deepEqual(decoded.children.map(layer => layer.name), ["Bottom", "Top"]);
  for (const layer of decoded.children) {
    assert.equal(layer.canvas, undefined);
    assert.deepEqual(psd.getLayerImageData(layer).data, pixels);
  }
});

test("image processing bounds concurrency without queuing buffers and recovers after failures", async () => {
  const { createImageWorkGate, isImageBusyError } = loader()("lib/portal/image-work.ts");
  const run = createImageWorkGate();
  let finish;
  let unexpectedCalls = 0;
  const first = run(() => new Promise((resolve) => { finish = resolve; }));
  await assert.rejects(run(async () => { unexpectedCalls++; }), isImageBusyError);
  assert.equal(unexpectedCalls, 0);
  finish("done");
  assert.equal(await first, "done");
  await assert.rejects(run(async () => { throw new Error("decode failed"); }), /decode failed/);
  await assert.rejects(run(() => { throw new Error("sync failure"); }), /sync failure/);
  assert.equal(await run(async () => "ready"), "ready");
  assert.equal(unexpectedCalls, 0);
});

test("server image processing resizes normal images and rejects oversized decoded dimensions", async () => {
  const sharp = nativeRequire("sharp");
  const { processImage } = loader()("lib/portal/image.ts");
  const input = await sharp({ create: { width: 32, height: 16, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const result = await processImage(input, { max: 16, quality: 90 });
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 8);
  assert.equal(metadata.hasAlpha, true);
  // Change only the PNG's declared size; the guard must reject it before allocating those pixels.
  const huge = Buffer.from(input);
  huge.writeUInt32BE(8000, 16);
  huge.writeUInt32BE(8000, 20);
  let crc = 0xffffffff;
  for (const byte of huge.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  huge.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  await assert.rejects(processImage(huge, { max: 16, quality: 90 }), /too many pixels/);
});

// Compile in memory so the test exercises the real TypeScript without adding a build or a test dependency.

test("uploaded artwork quality reaches both routes and stays in bounded cache variants", async () => {
  const read=loader();
  const {default:imageLoader}=read("lib/image-loader.ts");
  const {uploadImageQuality}=read("lib/image-quality.ts");
  for(const q of [75,82,90,95]) {
    const url=new URL(imageLoader({src:"/images/uploads/art.webp?v=abc&q=75",width:1280,quality:q}),"https://test.invalid");
    assert.deepEqual(url.searchParams.getAll("q"),[String(q)]);
    assert.equal(url.searchParams.get("v"),"abc");
  }
  for(const q of [undefined,NaN,Infinity,-1,0]) assert.equal(uploadImageQuality(q),82);
  assert.equal(uploadImageQuality(100),95);
  assert.equal(uploadImageQuality(89),90);
  for(const folder of ["uploads","proof-table"]) {
    const calls=[];
    const route=loader({"@/lib/storage":{serveUpload:(...args)=>{calls.push(args);return new Response();}}})(`app/images/${folder}/[name]/route.ts`);
    await route.GET(new Request(`https://test.invalid/images/${folder}/art.webp?w=1280&q=95`),{params:Promise.resolve({name:"art.webp"})});
    assert.equal(calls[0][2],1280);
    assert.equal(calls[0][3],95);
  }
});

test("resized artwork caches quality separately and streams vector originals unchanged", async () => {
  const key=Symbol.for("__cloudflare-context__");
  const previous=globalThis[key];
  const oldCaches=Object.getOwnPropertyDescriptor(globalThis,"caches");
  const cache=new Map(),jobs=[],transforms=[],outputs=[];
  const bytes=()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("source"));c.close();}});
  globalThis[key]={env:{
    PORTAL_BUCKET:{get:async()=>({body:bytes(),httpMetadata:{contentType:"image/svg+xml"}})},
    IMAGES:{input:()=>({transform:opts=>{transforms.push(opts);return {output:async out=>{outputs.push(out);return {image:bytes,contentType:()=>"image/webp"};}};}})},
  },ctx:{waitUntil:p=>jobs.push(p)}};
  Object.defineProperty(globalThis,"caches",{configurable:true,value:{default:{
    match:async req=>cache.has(req.url)?new Response(cache.get(req.url),{headers:{"Content-Type":"image/webp"}}):undefined,
    put:async(req,res)=>{cache.set(req.url,await res.text());},
  }}});
  try {
    const {serveUpload}=loader()("lib/storage.ts");
    for(const q of [90,95,95]) {
      const res=await serveUpload("uploads/images/","test.webp",1280,q);
      assert.equal(res.status,200);await res.text();await Promise.all(jobs);
    }
    assert.deepEqual(outputs.map(o=>o.quality),[90,95]);
    assert.equal(cache.size,2);
    assert.ok(transforms.every(t=>t.fit==="scale-down"&&t.width===1280));
    const svg=await serveUpload("uploads/images/","test.svg",1280,95);
    assert.equal(svg.headers.get("Content-Type"),"image/svg+xml");
    assert.equal(await svg.text(),"source");
    assert.equal(outputs.length,2);
  } finally {
    if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;
    if(oldCaches)Object.defineProperty(globalThis,"caches",oldCaches);else delete globalThis.caches;
  }
});

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const require = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith(".") && !name.startsWith("@/")) return nativeRequire(name);
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, base + ".ts", base + ".tsx", base + ".json"].find((p) => existsSync(p));
      if (!resolved) throw new Error(`Missing test module ${name}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
    return loaded.exports;
  }
  return (file) => load(path.join(root, file));
}

// Exercise the actual form handlers with deferred responses, without accounts or outgoing email.
function loginHarness() {
  const slots = [];
  let cursor = 0;
  let refreshes = 0;
  const state = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const { PortalLogin } = loader({
    react: {
      useState: state,
      useRef: (initial) => state({ current: initial })[0],
      useTransition: () => [false, (fn) => fn()],
    },
    "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "./portal.module.css": {},
  })("app/portal/PortalLogin.tsx");
  return {
    render() {
      cursor = 0;
      const nodes = [];
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        walk(node.props?.children);
      };
      walk(PortalLogin({ configured: true, emailLogin: true }));
      return {
        find: (type) => nodes.find((node) => node.type === type),
        input: (id) => nodes.find((node) => node.props.id === id),
        button: (text) => nodes.find((node) => node.type === "button" && node.props.children === text),
        nodes,
      };
    },
    refreshes: () => refreshes,
  };
}

test("sign-in suppresses duplicate requests, locks all form controls, and recovers after a connection failure", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  let fail;
  globalThis.fetch = (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Promise((resolve, reject) => { fail = reject; });
  };
  try {
    const ui = loginHarness();
    let screen = ui.render();
    screen.input("portal-username").props.onChange({ target: { value: " dolly " } });
    screen.input("portal-password").props.onChange({ target: { value: "test-only-password" } });
    screen = ui.render();
    const submit = screen.find("form").props.onSubmit;
    const pending = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.username, "dolly");
    assert.equal(ui.render().find("fieldset").props.disabled, true);
    fail(new Error("offline"));
    await pending;
    screen = ui.render();
    assert.equal(screen.find("fieldset").props.disabled, false);
    assert.ok(screen.nodes.some((node) => node.props.role === "alert"));
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await screen.find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(ui.refreshes(), 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test("emailed code accepts spaced paste, refuses incomplete codes, and clears notices when returning", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    const ui = loginHarness();
    ui.render().button("Email me a sign-in code instead").props.onClick();
    ui.render().input("portal-mail").props.onChange({ target: { value: "test@example.invalid" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.ok(ui.render().nodes.some((node) => node.props.role === "status"));
    ui.render().input("portal-mailcode").props.onChange({ target: { value: "123" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests.length, 1);
    ui.render().input("portal-mailcode").props.onChange({ target: { value: "123 456" } });
    assert.equal(ui.render().input("portal-mailcode").props.value, "123456");
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests[1].body.code, "123456");
    assert.equal(ui.refreshes(), 1);
    ui.render().button("Send a new code").props.onClick();
    assert.equal(ui.render().nodes.some((node) => node.props.role === "status"), false);
  } finally {
    globalThis.fetch = previous;
  }
});

test("login rejects malformed success responses and explains blocked requests without opening the portal", async () => {
  const previous = globalThis.fetch;
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "dolly" } });
    ui.render().input("portal-password").props.onChange({ target: { value: "test-password" } });
    for (const [status, payload, message] of [
      [200, null, /unexpected response/],
      [200, {}, /could not confirm/],
      [200, { needsCode: true }, /start verification/],
      [403, { error: "Forbidden." }, /Reload this page/],
    ]) {
      globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => payload });
      await ui.render().find("form").props.onSubmit({ preventDefault() {} });
      assert.match(ui.render().nodes.find((node) => node.props.role === "alert").props.children, message);
      assert.equal(ui.render().find("fieldset").props.disabled, false);
      assert.equal(ui.refreshes(), 0);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("password recovery blocks mismatches, preserves the login address, and hides revealed passwords on navigation", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, emailEnabled: true }) };
  };
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "artist@example.invalid" } });
    ui.render().button("Show").props.onClick();
    assert.equal(ui.render().input("portal-password").props.type, "text");
    ui.render().button("Forgot your password?").props.onClick();
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    ui.render().input("reset-code").props.onChange({ target: { value: "123456" } });
    ui.render().input("reset-new").props.onChange({ target: { value: "test-only-passphrase" } });
    ui.render().input("reset-confirm").props.onChange({ target: { value: "different-passphrase" } });
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests.length, 1, "a password mismatch must never reach the server");
    ui.render().input("reset-confirm").props.onChange({ target: { value: "test-only-passphrase" } });
    ui.render().button("Show passwords").props.onClick();
    assert.equal(ui.render().input("reset-new").props.type, "text");
    await ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(requests[1].url, "/api/portal/reset/confirm");
    assert.equal(ui.render().input("portal-username").props.value, "artist@example.invalid");
    assert.equal(ui.render().input("portal-password").props.value, "");
    assert.equal(ui.render().input("portal-password").props.type, "password");
    assert.equal(ui.refreshes(), 0, "resetting a password must not bypass sign-in");
  } finally {
    globalThis.fetch = previous;
  }
});

test("a stalled login request times out and unlocks the form for another attempt", async () => {
  const previous = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let expire;
  let cleared = false;
  globalThis.setTimeout = (fn, delay) => { assert.equal(delay, 20_000); expire = fn; return 1; };
  globalThis.clearTimeout = () => { cleared = true; };
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  try {
    const ui = loginHarness();
    ui.render().input("portal-username").props.onChange({ target: { value: "dolly" } });
    ui.render().input("portal-password").props.onChange({ target: { value: "test-password" } });
    const pending = ui.render().find("form").props.onSubmit({ preventDefault() {} });
    assert.equal(ui.render().find("fieldset").props.disabled, true);
    expire();
    await pending;
    assert.equal(ui.render().find("fieldset").props.disabled, false);
    assert.match(ui.render().nodes.find((node) => node.props.role === "alert").props.children, /took too long/);
    assert.equal(cleared, true);
    assert.equal(ui.refreshes(), 0);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("password sign-in passes a supported long email to authentication without truncating it", async () => {
  const { NextRequest } = nativeRequire("next/server");
  let received;
  const route = loader({
    "@/lib/portal/auth": { isPortalConfigured: async () => true },
    "@/lib/rate-limit": { tooManyFailures: () => false, noteFailure() {} },
    "@/lib/portal/activity": { clientIp: () => "test-only", logActivity: async () => {} },
    "@/lib/portal/otp": {},
    "@/lib/portal/mail": {},
    "@/lib/portal/users": { normalizeUsername: (value) => value.toLowerCase(), verifyLogin: async (value) => { received = value; return null; } },
  })("app/api/portal/session/route.ts");
  const email = `${"a".repeat(60)}@example.invalid`;
  const response = await route.POST(new NextRequest("http://localhost/api/portal/session", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ username: ` ${email} `, password: "test-only" }),
  }));
  assert.equal(received, email);
  assert.equal(response.status, 401);
});

const load = loader();

test("preview navigation opens cards without intercepting edit controls, filters, dialogs or modified clicks", () => {
  const previous = new Map(["window", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map();
  const navigated = [];
  const root = { dataset: {} };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost:3000/work?portal-preview" } } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      documentElement: root,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    } });
    const { bindPreviewNavigation, previewDestination } = loader()("lib/content/preview-navigation.ts");
    const cleanup = bindPreviewNavigation((href) => navigated.push(href));
    const click = ({ href, ui = false, ctrlKey = false, download = false } = {}) => {
      const anchor = href ? { target: "", getAttribute: () => href, hasAttribute: () => download } : null;
      const event = {
        target: { closest: (selector) => selector === "[data-ed-ui]" ? (ui ? {} : null) : anchor },
        button: 0, ctrlKey, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      listeners.get("click")(event);
      return event;
    };
    assert.equal(click().defaultPrevented, false, "service buttons and filters must retain their handlers");
    assert.equal(click({ href: "/work/film", ui: true }).defaultPrevented, false, "only the Edit button's own handler edits");
    assert.equal(click({ href: "/work/film", ctrlKey: true }).defaultPrevented, false);
    assert.equal(click({ href: "/work/film", download: true }).defaultPrevented, false);
    assert.equal(click({ href: "https://example.invalid/work/film" }).defaultPrevented, false);
    assert.equal(click({ href: "/work/film?view=full#images" }).stopped, true);
    assert.deepEqual(navigated, ["/work/film?view=full&portal-preview=#images"]);
    assert.equal(previewDestination("/process/design", "http://localhost:3000/?portal-preview"), "/process/design?portal-preview=");
    assert.equal(previewDestination("/work/film", "http://localhost:3000/"), null);
    assert.equal(previewDestination("#contact", window.location.href), null);
    assert.equal(previewDestination("/portal", window.location.href), null);
    root.dataset.ddsDragged = "1";
    assert.equal(click({ href: "/work/other" }).defaultPrevented, true);
    assert.equal(navigated.length, 1);
    cleanup();
    assert.equal(listeners.size, 0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Add controls remain present for populated and empty filtered galleries and send exact nested edit targets", () => {
  const nodes = (tree) => {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!tree || typeof tree !== "object") return [];
    return [tree, ...nodes(tree.props?.children)];
  };
  const content = json("content/site-content.json");
  const AddContent = () => null;
  for (const [projects, selected] of [[[], "All"], [content.projects, "All"], [content.projects, "Empty category"]]) {
    const { WorkGrid } = loader({
      react: { useState: () => [selected, () => {}] },
      "@/lib/content/context": { useContent: () => ({ ...content, categories: [...content.categories, "Empty category"] }) },
      "./ProjectCard": { ProjectCard: () => null },
      "./PreviewControls": { AddContent },
      "./WorkGrid.module.css": {},
    })("components/WorkGrid.tsx");
    const add = nodes(WorkGrid({ projects })).find((node) => node.type === AddContent);
    assert.equal(add.props.list, "projects");
    assert.equal(add.props.count, content.projects.length, "capacity must count all projects, not just the current filter");
  }
  const controls = loader({ "./PreviewControls.module.css": {} })("components/PreviewControls.tsx");
  assert.equal(nodes(controls.AddContent({ list: "projects", label: "Add", count: 0, max: 100 })).find((node) => node.type === "button").props.disabled, false);
  assert.equal(nodes(controls.AddContent({ list: "projects", label: "Add", count: 100, max: 100 })).find((node) => node.type === "button").props.disabled, true);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const sent = [];
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost" }, parent: { postMessage: (message) => sent.push(message) } } });
    const event = { preventDefault() {}, stopPropagation() {} };
    nodes(controls.AddContent({ list: "projects.2.images", label: "Add image", count: 3 })).find((node) => node.type === "button").props.onClick(event);
    nodes(controls.EditContent({ item: "services.2.gallery.4", label: "Edit image" })).find((node) => node.type === "button").props.onClick(event);
    assert.deepEqual(sent, [
      { source: "dds-site", type: "edit-add", list: "projects.2.images" },
      { source: "dds-site", type: "edit-open", item: "services.2.gallery.4" },
    ]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});

test("unpublished project and process pages open only for an authenticated preview", async () => {
  const content = json("content/site-content.json");
  let signedIn = false;
  const missing = new Error("not found");
  const modules = loader({
    "next/navigation": { notFound: () => { throw missing; } },
    "@/lib/portal/auth": { getPortalUser: async () => signedIn ? { id: "test-owner" } : null },
    "@/lib/content/store": { getContent: async () => content },
    "@/components/ProjectView": { ProjectView: () => null },
    "@/components/ProcessView": { ProcessView: () => null },
  });
  for (const file of ["app/work/[slug]/page.tsx", "app/process/[slug]/page.tsx"]) {
    const page = modules(file).default;
    const params = Promise.resolve({ slug: "unpublished-test-card" });
    signedIn = false;
    await assert.rejects(page({ params, searchParams: Promise.resolve({}) }), (error) => error === missing);
    await assert.rejects(page({ params, searchParams: Promise.resolve({ "portal-preview": "" }) }), (error) => error === missing);
    signedIn = true;
    await assert.rejects(page({ params, searchParams: Promise.resolve({}) }), (error) => error === missing);
    const view = await page({ params, searchParams: Promise.resolve({ "portal-preview": "" }) });
    assert.equal(view.props.slug, "unpublished-test-card");
  }
});

test("section buttons preserve preview and other query parameters through subsequent navigation", () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let url = new URL("https://local/?portal-preview&draft=one");
  const section = {};
  try {
    globalThis.window = { get location() { return url; }, history: { state: {}, pushState(_state, _title, href) { url = new URL(href, url); } } };
    globalThis.document = { getElementById: () => section };
    const app = loader({ "./smooth-scroll": { glideTo() {} } });
    assert.equal(app("lib/section-nav.ts").goToSection("contact"), true);
    assert.equal(url.search, "?portal-preview&draft=one");
    assert.equal(url.hash, "#contact");
    assert.match(app("lib/intro/preview-protocol.ts").withPreview("/process/sketchboards"), /portal-preview/);
    app("lib/section-nav.ts").goToSection();
    assert.equal(url.search, "?portal-preview&draft=one");
    assert.equal(url.hash, "");
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});

test("multipart uploads bound actual bytes and cancel oversized streams without Content-Length", async () => {
  const { readUploadForm, UploadTooLargeError } = loader()("lib/portal/body-limit.ts");
  const form = new FormData();form.set("file", new File(["small"], "small.png", { type: "image/png" }));
  const req = new Request("https://local/upload", { method: "POST", body: form });
  req.headers.delete("Content-Length");
  assert.equal((await readUploadForm(req, 32)).get("file").size, 5);
  for (const declared of [undefined, "1"]) {
    let cancelled = false;let reads = 0;
    const body = new ReadableStream({pull(c) { reads++;c.enqueue(new Uint8Array(40_000)); },cancel() { cancelled = true; }});
    const headers = new Headers({"Content-Type":"multipart/form-data; boundary=bounded"});
    if (declared) headers.set("Content-Length",declared);
    const request = new Request("https://local/upload", {method:"POST",headers,body,duplex:"half"});
    await assert.rejects(readUploadForm(request,32),error=>error instanceof UploadTooLargeError);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(cancelled,true);assert.ok(reads<=4,`Read ${reads} chunks after exceeding limit`);
  }
});

test("conditional R2 OTP writes allow only one concurrent redemption and retain every failed attempt", async () => {
  const symbol = Symbol.for("__cloudflare-context__");
  const before = globalThis[symbol];
  let text = null;let version = 0;
  const bucket = {
    async get() {const snapshot = text;const etag=String(version);return snapshot === null ? null : {etag,text:async()=>snapshot};},
    async put(_key, value, options) {
      const condition=options.onlyIf;
      if (condition.get("If-None-Match")==="*" ? text!==null : condition.get("If-Match")!==JSON.stringify(String(version))) return null;
      text=value;version++;return {etag:String(version)};
    },
  };
  try {
    globalThis[symbol]={env:{PORTAL_BUCKET:bucket}};
    // Independent module instances share only R2, as separate deployed Workers do.
    const a=loader()("lib/portal/otp.ts"), b=loader()("lib/portal/otp.ts");
    const issued=await a.issueCode("reset","test-user");
    const results=await Promise.all([a.checkCode("reset","test-user",issued.code),b.checkCode("reset","test-user",issued.code)]);
    assert.equal(results.filter(r=>r.ok).length,1);
    const next=await a.issueCode("reset","test-user");
    await Promise.all(Array.from({length:5},(_,i)=>(i%2?a:b).checkCode("reset","test-user","not-a-code")));
    assert.equal(JSON.parse(text)[0].attempts,5);
    assert.deepEqual(await b.checkCode("reset","test-user",next.code),{ok:false,reason:"locked"});
  } finally {if(before===undefined)delete globalThis[symbol];else globalThis[symbol]=before;}
});

function accountFixture() {
  const docs = new Map();
  const sent = [];
  let sequence = 0;
  let me = null;
  let deliveryOk = true;
  let atomicTail = Promise.resolve();
  const storage = {
    getText: async (key) => docs.get(key) ?? null,
    putText: async (key, value) => { docs.set(key, value); },
    list: async (prefix) => [...docs.keys()].filter((key) => key.startsWith(prefix)),
  };
  const app = loader({
    "@/lib/storage": {
      store: async () => storage,
      writeJson: async (key, value) => docs.set(key, JSON.stringify(value)),
      updateJsonAtomically: (key, initial, change) => {
        const task = atomicTail.then(() => {
          const next = change(docs.has(key) ? JSON.parse(docs.get(key)) : structuredClone(initial));
          if (next.value !== undefined) docs.set(key, JSON.stringify(next.value));
          return next.result;
        });
        atomicTail = task.then(() => {}, () => {});
        return task;
      },
      writeJsonSafely: async (key, value) => {
        if (docs.has(key)) docs.set(`data/backups/people/${sequence++}.json`, docs.get(key));
        docs.set(key, JSON.stringify(value));
      },
    },
    "@/lib/portal/auth": {
      getPortalUser: async () => me,
      createSessionToken: (id, version) => `test.${id}.${version}`,
      sessionCookie: (value) => ({ name: "dds_portal", value, httpOnly: true }),
    },
    "@/lib/rate-limit": { tooManyFailures: () => false, noteFailure() {}, isRateLimited: () => false },
    "@/lib/portal/activity": { clientIp: () => "test-only", logActivity: async () => {} },
    "@/lib/portal/mail": {
      canRecoverByMail: () => false,
      isMailConfigured: () => true,
      studioMailboxes: () => ["studio@example.invalid"],
      codeEmail: (input) => ({ subject: input.purpose, text: input.code, html: "" }),
      sendMail: async (input) => { sent.push(input); return deliveryOk ? { ok: true } : { ok: false, reason: "failed" }; },
    },
  });
  const { NextRequest } = nativeRequire("next/server");
  return {
    docs, sent,
    users: app("lib/portal/users.ts"),
    otp: app("lib/portal/otp.ts"),
    route: (file) => app(file),
    as: (user) => { me = user; },
    delivery: (ok) => { deliveryOk = ok; },
    request: (body, method = "POST") => new NextRequest("http://localhost/api/portal/test", {
      method, headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  };
}

test("portal username/password changes keep ownership checks and invalidate old passwords, sessions and codes", async () => {
  const f = accountFixture();
  const original = await f.users.createUser({ username: "owner", name: "Owner", password: "Original-phrase-123", role: "owner", email: "owner@example.invalid" });
  const editor = await f.users.createUser({ username: "editor", name: "Editor", password: "Editor-phrase-123", role: "editor" });
  f.as(editor);
  const route = f.route("app/api/portal/users/route.ts");
  assert.equal((await route.DELETE(f.request({ id: original.id }, "DELETE"))).status, 403);
  f.as(original);
  const changed = await f.users.changeUsername(original.id, "new-owner");
  assert.equal(await f.users.verifyLogin("owner", "Original-phrase-123"), null);
  assert.ok(await f.users.verifyLogin("new-owner", "Original-phrase-123"));
  f.as(changed);
  await f.otp.issueCode("reset", original.id);
  await f.otp.issueCode("login", "mail:owner@example.invalid");
  assert.equal((await route.PATCH(f.request({ id: original.id, currentPassword: "wrong", password: "New-phrase-123" }, "PATCH"))).status, 400);
  const response = await route.PATCH(f.request({ id: original.id, currentPassword: "Original-phrase-123", password: "New-phrase-123" }, "PATCH"));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie"));
  assert.equal(await f.users.userForSession(original.id, 1), null);
  assert.equal(await f.users.verifyLogin("new-owner", "Original-phrase-123"), null);
  assert.ok(await f.users.verifyLogin("new-owner", "New-phrase-123"));
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-otps.json")), []);
});

test("deleting a user removes restorable credentials and both kinds of OTP without changing other accounts", async () => {
  const f = accountFixture();
  const owner = await f.users.createUser({ username: "owner", name: "Owner", password: "Owner-phrase-123", role: "owner" });
  const person = await f.users.createUser({ username: "person", name: "Person", password: "Person-phrase-123", role: "editor", email: "person@example.invalid" });
  await f.users.updateUser(person.id, { name: "Person updated" });
  const beforeOwner = JSON.parse(f.docs.get("data/portal-users.json")).users.find((u) => u.id === owner.id);
  await f.otp.issueCode("reset", person.id);
  await f.otp.issueCode("login", "mail:person@example.invalid");
  const keep = await f.otp.issueCode("reset", owner.id);
  f.as(owner);
  const response = await f.route("app/api/portal/users/route.ts").DELETE(f.request({ id: person.id }, "DELETE"));
  assert.equal(response.status, 200);
  assert.equal(await f.users.userForSession(person.id, 1), null);
  assert.equal(await f.users.verifyLogin("person", "Person-phrase-123"), null);
  for (const [key, text] of f.docs) {
    if (key.includes("portal-users") || key.includes("backups/people")) assert.equal(text.includes(person.id), false, key);
  }
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-users.json")).users, [beforeOwner]);
  assert.equal((await f.otp.checkCode("reset", owner.id, keep.code)).ok, true);
  await assert.rejects(f.users.removeUser(owner.id), /last owner/);
  const replacement = await f.users.createUser({ username: "other-owner", name: "Other owner", password: "Other-owner-phrase-123", role: "owner" });
  const selfDelete = await f.route("app/api/portal/users/route.ts").DELETE(f.request({ id: owner.id }, "DELETE"));
  assert.deepEqual(await selfDelete.json(), { ok: true, signedOut: true });
  assert.ok(selfDelete.headers.get("set-cookie"));
  assert.equal(await f.users.userForSession(owner.id, 1), null);
  assert.equal((await f.users.listUsers())[0].id, replacement.id);
});

test("forgot password emails an OTP, enforces cooldown, changes the password once and signs out old sessions", async () => {
  const f = accountFixture();
  const person = await f.users.createUser({ username: "artist", name: "Artist", password: "Original-phrase-123", role: "owner", email: "artist@example.invalid" });
  const request = f.route("app/api/portal/reset/request/route.ts");
  const confirm = f.route("app/api/portal/reset/confirm/route.ts");
  const response = await request.POST(f.request({ identifier: "artist" }));
  assert.deepEqual(await response.json(), { ok: true, emailEnabled: true });
  assert.equal(f.sent[0].to, "artist@example.invalid");
  const code = f.sent[0].text;
  assert.match(code, /^\d{6}$/);
  assert.equal(f.docs.get("data/portal-otps.json").includes(`"${code}"`), false);
  await request.POST(f.request({ identifier: "artist" }));
  assert.equal(f.sent.length, 1);
  const unknown = await request.POST(f.request({ identifier: "unknown-person" }));
  assert.deepEqual(await unknown.json(), { ok: true, emailEnabled: true });
  assert.equal(f.sent.length, 1);
  const weak = await confirm.POST(f.request({ identifier: "artist", code, password: "short" }));
  assert.equal(weak.status, 400);
  const done = await confirm.POST(f.request({ identifier: "artist", code, password: "Replacement-phrase-123" }));
  assert.equal(done.status, 200);
  assert.equal(await f.users.userForSession(person.id, 1), null);
  assert.ok(await f.users.verifyLogin("artist", "Replacement-phrase-123"));
  const replay = await confirm.POST(f.request({ identifier: "artist", code, password: "Another-phrase-123" }));
  assert.equal(replay.status, 400);
});

test("failed OTP delivery allows a fresh retry, and wrong or expired codes never verify", async () => {
  const f = accountFixture();
  const person = await f.users.createUser({ username: "artist", name: "Artist", password: "Original-phrase-123", role: "owner", email: "artist@example.invalid" });
  const request = f.route("app/api/portal/reset/request/route.ts");
  f.delivery(false);
  await request.POST(f.request({ identifier: "artist" }));
  assert.deepEqual(JSON.parse(f.docs.get("data/portal-otps.json")), []);
  f.delivery(true);
  await request.POST(f.request({ identifier: "artist" }));
  assert.equal(f.sent.length, 2, "a failed delivery must not start a cooldown");
  const code = f.sent[1].text;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await f.otp.checkCode("reset", person.id, wrong)).ok, false);
  assert.deepEqual(await f.otp.checkCode("reset", person.id, code), { ok: false, reason: "locked" });
  await f.otp.clearCodes(person.id);
  const fresh = await f.otp.issueCode("reset", person.id);
  const rows = JSON.parse(f.docs.get("data/portal-otps.json"));
  rows[0].expires = Date.now() - 1;
  f.docs.set("data/portal-otps.json", JSON.stringify(rows));
  assert.deepEqual(await f.otp.checkCode("reset", person.id, fresh.code), { ok: false, reason: "expired" });
});

test("the configured studio mailbox can recover a fresh owner after accounts are deleted", async () => {
  const f = accountFixture();
  const owner = await f.users.createUser({ username: "old-owner", name: "Old owner", password: "Original-phrase-123", role: "owner", email: "studio@example.invalid" });
  await f.users.removeUser(owner.id, { allowLastOwner: true });
  assert.deepEqual(await f.users.listUsers(), []);
  await f.route("app/api/portal/reset/request/route.ts").POST(f.request({ identifier: "studio@example.invalid" }));
  assert.equal(f.sent[0].to, "studio@example.invalid");
  const response = await f.route("app/api/portal/reset/confirm/route.ts").POST(f.request({ identifier: "studio@example.invalid", code: f.sent[0].text, password: "Recovered-phrase-123" }));
  assert.equal(response.status, 200);
  const recovered = await f.users.verifyLogin("studio@example.invalid", "Recovered-phrase-123");
  assert.equal(recovered.user.role, "owner");
  assert.notEqual(recovered.user.id, owner.id);
  assert.equal(await f.users.userForSession(owner.id, 1), null);
});

test("invalid account storage and unreadable backups stop account mutations", async () => {
  const f = accountFixture();
  f.docs.set("data/portal-users.json", "{");
  await assert.rejects(f.users.createUser({ username: "new-owner", name: "Owner", password: "Owner-phrase-123", role: "owner" }));
  assert.equal(f.docs.get("data/portal-users.json"), "{");
  f.docs.delete("data/portal-users.json");
  await f.users.createUser({ username: "owner", name: "Owner", password: "Owner-phrase-123", role: "owner" });
  const person = await f.users.createUser({ username: "person", name: "Person", password: "Person-phrase-123", role: "editor" });
  const before = f.docs.get("data/portal-users.json");
  f.docs.set("data/backups/people/broken.json", "{");
  await assert.rejects(f.users.removeUser(person.id));
  assert.equal(f.docs.get("data/portal-users.json"), before);
});

const { resetMedia, protectedMedia, canResetMediaFile } = load("lib/content/reset-media.ts");
const { sanitizeContent } = load("lib/content/sanitize.ts");
const { sanitizeIntroSettings } = load("lib/intro/settings.ts");
const { contentProblems } = load("app/portal/validate.ts");

function fixture() {
  const content = json("content/site-content.json");
  const settings = json("content/intro-settings.json");
  content.projects[0].images[0].src = "/images/uploads/art.webp";
  content.projects[0].brief = "/images/uploads/art.webp is the reference path mentioned in this brief.";
  content.projects[0].images[0].alt = "/images/uploads/art.webp";
  content.clients[0].logo = "/images/uploads/client.webp";
  content.collaborators[0].photo = "/images/uploads/person.webp";
  content.home.founder.photo = "/images/uploads/founder.webp";
  content.pages.home.backdrop = "/images/uploads/backdrop.webp";
  content.breakdowns[0].layers[0].image = "/images/uploads/layer.webp";
  settings.proofTable.items[0].src = "/images/proof-table/title.webp";
  settings.sweep.pattern.src = "/images/uploads/protected-pattern.webp";
  return { content, settings };
}

test("clearing media retains every text value, record, caption, font and non-slate setting", () => {
  const before = fixture();
  const original = clone(before);
  const next = resetMedia(before.content, before.settings);
  assert.deepEqual(before, original, "reset must not mutate its inputs");
  function check(a, b, key = "") {
    if (["src", "image", "photo", "logo", "sample", "backdrop"].includes(key.split(".").at(-1)) && typeof a === "string" && a.startsWith("/images/") && !/^\/images\/(brand|textures|star-textures)\//.test(a)) {
      assert.equal(b, "", key);
    } else if (Array.isArray(a)) {
      assert.equal(b.length, a.length, key);
      a.forEach((value, i) => check(value, b[i], `${key}.${i}`));
    } else if (a && typeof a === "object") {
      assert.deepEqual(Object.keys(b), Object.keys(a), key);
      for (const name of Object.keys(a)) check(a[name], b[name], `${key}.${name}`);
    } else assert.deepEqual(b, a, key);
  }
  check(before.content, next.content);
  check(before.settings.proofTable, next.settings.proofTable);
  const withoutSlate = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "proofTable"));
  assert.deepEqual(withoutSlate(next.settings), withoutSlate(before.settings));
  assert.deepEqual(resetMedia(next.content, next.settings), next, "reset is idempotent");
});

test("saved empty slots survive validation and sanitizing, and can be filled again", () => {
  const { content, settings } = fixture();
  const empty = resetMedia(content, settings);
  const saved = sanitizeContent(empty.content);
  const design = sanitizeIntroSettings(empty.settings);
  assert.equal(saved.projects.length, content.projects.length);
  assert.deepEqual(saved.projects.map((p) => p.images.map((im) => im.alt)), content.projects.map((p) => p.images.map((im) => im.alt)));
  assert.deepEqual(saved.breakdowns.map((b) => b.layers.map((l) => l.label)), content.breakdowns.map((b) => b.layers.map((l) => l.label)));
  assert.equal(design.proofTable.items.length, settings.proofTable.items.length);
  assert.deepEqual(design.proofTable.items.map((it) => it.film), settings.proofTable.items.map((it) => it.film));
  assert.deepEqual(contentProblems(saved), []);
  saved.projects[0].images[0].src = "/images/uploads/new-art.webp";
  saved.breakdowns[0].layers[0].image = "/images/uploads/new-layer.webp";
  design.proofTable.items[0].src = "/images/proof-table/new-title.webp";
  assert.equal(sanitizeContent(saved).projects[0].images[0].src, "/images/uploads/new-art.webp");
  assert.equal(sanitizeContent(saved).breakdowns[0].layers[0].image, "/images/uploads/new-layer.webp");
  assert.equal(sanitizeIntroSettings(design).proofTable.items[0].src, "/images/proof-table/new-title.webp");
});

test("reset file scope excludes intro dependencies, branding, fonts, account data and unsafe paths", () => {
  const { settings } = fixture();
  const keep = protectedMedia(settings);
  assert.equal(canResetMediaFile("uploads/images/art.webp", keep), true);
  assert.equal(canResetMediaFile("uploads/proof/title.webp", keep), true);
  for (const key of ["uploads/images/protected-pattern.webp", "uploads/textures/star.webp", "uploads/fonts/body.woff2", "data/portal-users.json", "images/brand/logo.svg", "uploads/images/../brand/logo.svg", "uploads/images/..secret.webp"]) {
    assert.equal(canResetMediaFile(key, keep), false, key);
  }
});

function server({ user = { id: "owner", role: "owner" }, backupFails = false, saveFails = false, readFails = false, invalidDocument } = {}) {
  let { content, settings } = fixture();
  const original = clone({ content, settings });
  const events = [];
  const files = new Map(["uploads/images/art.webp", "uploads/images/protected-pattern.webp", "uploads/proof/title.webp"].map((key) => [key, "picture"]));
  const s = {
    async getText(key) {
      if (readFails) throw new Error("storage unavailable");
      if (invalidDocument !== undefined) return invalidDocument;
      return JSON.stringify(key === "content/site-content.json" ? content : settings);
    },
    async list(prefix) { return [...files.keys()].filter((key) => key.startsWith(prefix)); },
    async putText(key, text) { events.push(["backup", key]); files.set(key, text); },
    async copy(key, dest) { if (backupFails) throw new Error("archive failed"); events.push(["copy", key]); files.set(dest, files.get(key)); },
    async remove(key) { events.push(["remove", key]); files.delete(key); },
  };
  const route = loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "next/cache": { revalidatePath: () => events.push(["revalidate"]) },
    "@/lib/portal/auth": { getPortalUser: async () => user },
    "@/lib/portal/activity": { logActivity: async () => {} },
    "@/lib/storage": { store: async () => s },
    "@/lib/content/store": {
      getContent: async () => clone(content),
      writeContent: async (value) => { events.push(["content"]); content = clone(value); },
    },
    "@/lib/portal/settings-store": {
      readIntroSettings: async () => clone(settings),
      writeIntroSettings: async (value) => {
        if (saveFails) { saveFails = false; throw new Error("settings save failed"); }
        events.push(["settings"]); settings = clone(value);
      },
    },
  })("app/api/portal/media-reset/route.ts");
  const post = (body, origin = "https://studio.test") => route.POST({ headers: new Headers({ origin }), nextUrl: new URL("https://studio.test/api/portal/media-reset"), json: async () => body });
  return { route, post, events, files, original, state: () => ({ content, settings }) };
}

test("the live reset archives before writes/deletions and preserves the intro dependency", async () => {
  const app = server();
  const review = await (await app.route.GET()).json();
  assert.equal(review.files, 2);
  const res = await app.post({ token: review.token, confirmation: "CLEAR MEDIA" });
  assert.equal(res.status, 200);
  assert.ok(app.events.findIndex(([op]) => op === "content") > app.events.map(([op]) => op).lastIndexOf("copy"));
  assert.ok(app.events.findIndex(([op]) => op === "remove") > app.events.findIndex(([op]) => op === "settings"));
  assert.equal(app.files.has("uploads/images/protected-pattern.webp"), true);
  const archive = [...app.files.entries()].find(([key]) => key.endsWith("/snapshot.json"));
  assert.deepEqual(JSON.parse(archive[1]).content, app.original.content);
  assert.deepEqual(app.state(), resetMedia(app.original.content, app.original.settings));
});

test("invalid saved documents cannot be reset or replaced with defaults", async () => {
  for (const invalidDocument of ["", "null", "[]", "42", "{broken"]) {
    const app = server({ invalidDocument });
    assert.equal((await app.route.GET()).status, 500, invalidDocument);
    assert.equal(app.events.length, 0);
    assert.deepEqual(app.state(), app.original);
  }
});

test("filesystem storage treats only missing files as absent and propagates read/list failures", async () => {
  let code = "ENOENT";
  const fail = async () => { throw Object.assign(new Error("simulated filesystem error"), { code }); };
  const { store } = loader({ "node:fs/promises": { readFile: fail, readdir: fail } })("lib/storage.ts");
  const disk = await store();
  assert.equal(await disk.getText("content/site-content.json"), null);
  assert.equal(await disk.getBytes("uploads/images/example.webp"), null);
  assert.deepEqual(await disk.list("uploads/images/"), []);
  for (code of ["EACCES", "EIO"]) {
    await assert.rejects(disk.getText("content/site-content.json"), { code });
    await assert.rejects(disk.getBytes("uploads/images/example.webp"), { code });
    await assert.rejects(disk.list("uploads/images/"), { code });
  }
});

test("the Cloudflare media library includes newly uploaded slate artwork", async () => {
  const route = loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/activity": {},
    "@/lib/portal/image": {},
    "@/lib/portal/media-hidden": { hiddenLibraryImages: async () => [], setLibraryImageHidden: async () => {} },
    "@/lib/content/store": { getContent: async () => ({}) },
    "@/lib/portal/settings-store": { readIntroSettings: async () => fixture().settings },
    "@/lib/storage": { store: async () => ({
      kind: "r2",
      list: async (prefix) => prefix === "uploads/proof/" ? ["uploads/proof/new-title.webp"] : ["uploads/images/new-art.webp"],
    }) },
  })("app/api/portal/media/route.ts");
  const result = await (await route.GET()).json();
  for (const src of ["/images/uploads/new-art.webp", "/images/proof-table/new-title.webp"]) {
    assert.ok(result.images.includes(src));
    assert.ok(result.removable.includes(src));
  }
  assert.equal(result.images.some((src) => src.startsWith("/images/brand/")), false);
});

test("folder upload detects exact library repeats before transferring them", async () => {
  const { existingImageUpload, sameNameImageUpload } = loader()("app/portal/upload.ts");
  const file = new File(["first image"], "39.jpg", { type: "image/jpeg" });
  const hash = createHash("sha1").update("first image").digest("hex").slice(0, 8);
  const src = `/images/uploads/39-${hash}.jpg`;
  assert.equal(await existingImageUpload(file, [src]), src);
  assert.equal(await existingImageUpload(new File(["changed image"], "39.jpg", { type: "image/jpeg" }), [src]), null);
  assert.equal(sameNameImageUpload(new File(["changed image"], "39.jpg", { type: "image/jpeg" }), [src]), src);
  assert.equal(sameNameImageUpload(new File(["different image"], "40.jpg", { type: "image/jpeg" }), [src]), null);
  assert.equal(await existingImageUpload(file, []), null);
});

test("folder upload can skip, add or replace an old same-name picture without breaking used artwork", async () => {
  const saved = new Map();
  const activity = [];
  let file = new File(["first image"], "39.jpg", { type: "image/jpeg" });
  let duplicateMode = "skip";
  let replaceSrc = "";
  let checkName = true;
  let content = {};
  let settings = {};
  let failRemove = "";
  const route = loader({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/body-limit": { tooLarge: () => null, readUploadForm: async () => { const form = new FormData(); form.set("file", file); form.set("duplicate", duplicateMode); form.set("replace", replaceSrc); if (checkName) form.set("checkName", "1"); return form; }, UploadTooLargeError: class UploadTooLargeError extends Error {} },
    "@/lib/portal/image": { processImage: async (bytes) => ({ bytes, ext: "jpg", contentType: "image/jpeg" }) },
    "@/lib/portal/image-work": { isImageBusyError: () => false },
    "@/lib/portal/activity": { logActivity: async (event) => activity.push(event) },
    "@/lib/content/store": { getContent: async () => content },
    "@/lib/portal/settings-store": { readIntroSettings: async () => settings },
    "@/lib/portal/media-hidden": { hiddenLibraryImages: async () => [], setLibraryImageHidden: async () => {} },
    "@/lib/storage": { store: async () => ({ list: async (prefix) => [...saved.keys()].filter(key => key.startsWith(prefix)), size: async (key) => saved.get(key)?.length ?? null, putBytes: async (key, bytes) => saved.set(key, bytes), remove: async (key) => { if (key === failRemove) throw new Error("Delete failed"); saved.delete(key); } }) },
  })("app/api/portal/media/route.ts");
  const upload = async () => route.POST({ headers: new Headers() });
  const first = await (await upload()).json();
  assert.match(first.src, /^\/images\/uploads\/39-[0-9a-f]{8}\.jpg$/);
  assert.equal(first.duplicate, undefined);
  assert.deepEqual(await (await upload()).json(), { src: first.src, duplicate: true });
  assert.equal(saved.size, 1);
  assert.equal(activity.length, 1);
  duplicateMode = "add";
  const copy = await (await upload()).json();
  assert.match(copy.src, /^\/images\/uploads\/39-[0-9a-f]{8}-copy-[0-9a-f]{12}\.jpg$/);
  assert.notEqual(copy.src, first.src);
  assert.equal(saved.size, 2, "Adding a duplicate creates a separate item without overwriting the original");
  assert.equal(activity.length, 2);
  duplicateMode = "skip";
  file = new File(["changed image"], "39.jpg", { type: "image/jpeg" });
  assert.deepEqual(await (await upload()).json(), { src: first.src, duplicate: true }, "A changed image with the same name asks before replacing");
  replaceSrc = first.src;
  duplicateMode = "replace";
  const replaced = await (await upload()).json();
  assert.equal(replaced.replaced, first.src);
  assert.notEqual(replaced.src, first.src, "The new image uses a fresh URL so immutable caches cannot serve the old pixels");
  assert.equal(saved.has(`uploads/images/${first.src.split("/").at(-1)}`), false);
  assert.equal(saved.has(`uploads/images/${replaced.src.split("/").at(-1)}`), true);
  assert.equal(saved.size, 2, "The selected old file is removed after the new one is saved");
  content = { sample: copy.src };
  replaceSrc = copy.src;
  const blocked = await upload();
  assert.equal(blocked.status, 409, "Used images must not be removed from published content");
  assert.match((await blocked.json()).error, /used on the site/);
  assert.equal(saved.has(`uploads/images/${copy.src.split("/").at(-1)}`), true);
  assert.equal(saved.size, 2);
  assert.equal(activity.length, 3);
  content = {};
  settings = { proofTable: { items: [{ src: copy.src }] } };
  assert.equal((await upload()).status, 409, "Design settings also protect used images");
  settings = {};
  failRemove = `uploads/images/${copy.src.split("/").at(-1)}`;
  const beforeFailedRemove = [...saved.keys()];
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await upload()).status, 500, "A failed old-file removal rolls back the new upload"); }
  finally { console.error = originalError; }
  assert.deepEqual([...saved.keys()], beforeFailedRemove);
  failRemove = "";
  checkName = false;
  duplicateMode = "skip";
  replaceSrc = "";
  const ordinarySingleUpload = await (await upload()).json();
  assert.notEqual(ordinarySingleUpload.src, replaced.src, "Outside folder uploads, a revised same-name image still uploads normally");
  assert.equal(saved.size, 3);
});

test("library selections survive search changes by identity and exclude stale or protected files", () => {
  const { librarySelection } = loader()("app/portal/media-selection.ts");
  const images = ["/images/uploads/actor-a.webp", "/images/uploads/actor-b.webp", "/images/uploads/poster.webp", "/images/uploads/intro.webp"];
  const removable = images.slice(0, 3);
  const state = librarySelection(images, removable, [images[2]], "actor-a");
  assert.equal(state.allShownSelected, false, "matching counts are not matching selections");
  assert.equal(state.hiddenSelected, 1);
  const picked = [...new Set([...state.selected, ...state.shownRemovable])];
  const changed = librarySelection(images, removable, picked, " ACTOR ");
  assert.deepEqual(changed.selected, [images[2], images[0]]);
  assert.equal(changed.allShownSelected, false);
  const all = librarySelection(images, removable, images, "");
  assert.deepEqual(all.selected, removable);
  assert.equal(all.allShownSelected, true);
  assert.deepEqual(librarySelection([images[1]], removable, picked, "").selected, []);
  assert.equal(librarySelection([], [], [], "").allShownSelected, false);
});

test("bulk library listings and direct deletion protect intro dependencies", async () => {
  const settings = fixture().settings;
  const removed = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/activity": { logActivity: async () => {} },
    "@/lib/portal/image": {},
    "@/lib/content/store": { getContent: async () => ({}) },
    "@/lib/portal/settings-store": { readIntroSettings: async () => settings },
    "@/lib/portal/media-hidden": { hiddenLibraryImages: async () => [], setLibraryImageHidden: async () => {} },
    "@/lib/storage": { store: async () => ({
      kind: "r2",
      getText: async () => JSON.stringify(settings),
      list: async (prefix) => prefix === "uploads/images/" ? ["uploads/images/protected-pattern.webp", "uploads/images/art.webp"] : [],
      remove: async (key) => removed.push(key),
    }) },
  };
  const list = loader(mocks)("app/api/portal/media/route.ts");
  const library = await (await list.GET()).json();
  assert.ok(library.images.includes("/images/uploads/protected-pattern.webp"));
  assert.ok(library.removable.includes("/images/uploads/art.webp"));
  assert.ok(library.removable.includes("/images/uploads/protected-pattern.webp"));
  assert.deepEqual(library.deletable, ["/images/uploads/art.webp"]);
  const route = loader(mocks)("app/api/portal/storage/route.ts");
  const request = (key, confirmed = true) => ({ headers: new Headers({ origin: "https://studio.test" }), nextUrl: new URL("https://studio.test"), json: async () => ({ key, confirmed }) });
  assert.equal((await route.DELETE(request("uploads/images/protected-pattern.webp"))).status, 409);
  assert.deepEqual(removed, []);
  assert.equal((await route.DELETE(request("uploads/images/art.webp", false))).status, 400);
  assert.equal((await route.DELETE(request("uploads/images/art.webp"))).status, 200);
  assert.deepEqual(removed, ["uploads/images/art.webp"]);
});

test("image library sorts by actual upload time and offers both name orders", () => {
  const { sortMediaImages } = loader()("app/portal/media-sort.ts");
  const images = ["/images/uploads/10.webp", "/images/old.png", "/images/uploads/2.webp", "/images/uploads/1.webp"];
  const times = { "/images/uploads/10.webp": 300, "/images/uploads/2.webp": 100, "/images/uploads/1.webp": 200 };
  assert.deepEqual(sortMediaImages(images, times, "oldest"), [images[2], images[3], images[0], images[1]]);
  assert.deepEqual(sortMediaImages(images, times, "newest"), [images[0], images[3], images[2], images[1]]);
  assert.deepEqual(sortMediaImages(images, times, "name-asc"), [images[1], images[3], images[2], images[0]]);
  assert.deepEqual(sortMediaImages(images, times, "name-desc"), [images[0], images[2], images[3], images[1]]);
});

test("protected images can be hidden and restored without deleting the stored file", async () => {
  const hidden = new Set();
  const removed = [];
  const settings = fixture().settings;
  const content = { hero: { image: "/images/uploads/new.webp" } };
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/portal/auth": { getPortalUser: async () => ({ role: "owner" }) },
    "@/lib/portal/activity": { logActivity: async () => {} },
    "@/lib/portal/image": {},
    "@/lib/content/store": { getContent: async () => content },
    "@/lib/portal/settings-store": { readIntroSettings: async () => settings },
    "@/lib/portal/media-hidden": { hiddenLibraryImages: async () => [...hidden], setLibraryImageHidden: async (src, hide) => hide ? hidden.add(src) : hidden.delete(src) },
    "@/lib/storage": { store: async () => ({
      kind: "r2",
      listWithDates: async (prefix) => prefix === "uploads/images/" ? [
        { key: "uploads/images/protected-pattern.webp", uploadedAt: 200 },
        { key: "uploads/images/new.webp", uploadedAt: 300 },
        { key: "uploads/images/old.webp", uploadedAt: 100 },
      ] : [],
      remove: async (key) => removed.push(key),
    }) },
  };
  const route = loader(mocks)("app/api/portal/media/route.ts");
  const protectedSrc = "/images/uploads/protected-pattern.webp";
  const original = await (await route.GET()).json();
  assert.deepEqual(original.images.slice(0, 3), ["/images/uploads/old.webp", protectedSrc, "/images/uploads/new.webp"]);
  assert.equal(original.uploadedAt[protectedSrc], 200);
  assert.ok(original.removable.includes(protectedSrc));
  assert.ok(!original.deletable.includes(protectedSrc));
  assert.ok(!original.deletable.includes(content.hero.image), "Published page images stay stored when removed from the library");
  const request = (src) => ({ headers: new Headers(), json: async () => ({ src }) });
  assert.equal((await route.DELETE(request(protectedSrc))).status, 200);
  const afterHide = await (await route.GET()).json();
  assert.ok(!afterHide.images.includes(protectedSrc));
  assert.ok(afterHide.hidden.includes(protectedSrc));
  assert.deepEqual(removed, []);
  assert.equal((await route.PUT(request(protectedSrc))).status, 200);
  assert.ok((await (await route.GET()).json()).images.includes(protectedSrc));
});

test("upright typography migrates legacy italic references without losing other styles", () => {
  const read = loader();
  const { sanitizeContent } = read("lib/content/sanitize.ts");
  const { fontById, FONTS } = read("lib/content/fonts.ts");
  const { contentCss } = read("lib/content/css.ts");
  const content = json("content/site-content.json");
  content.fonts.label = "lemon-italic";
  content.pages.work.fontLabel = "lemon-italic";
  content.type["home.clients.title"] = { font:"lemon-italic", italic:true, weight:700, size:32, color:"#abcdef", tracking:4 };
  const clean = sanitizeContent(content);
  assert.equal(clean.fonts.label, "lemon-regular");
  assert.equal(clean.pages.work.fontLabel, "lemon-regular");
  assert.deepEqual(clean.type["home.clients.title"], { font:"lemon-regular", weight:700, size:32, color:"#abcdef", tracking:4 });
  assert.equal(fontById("lemon-italic").id, "lemon-regular");
  assert.ok(!FONTS.some(font => /italic/i.test(font.label)));
  assert.doesNotMatch(contentCss(clean), /font-style:italic|--font-lemon-italic/);
  assert.deepEqual(sanitizeContent(clean), clean, "Migration is repeatable without changing content");
  const layout = readFileSync(path.join(root,"app/layout.tsx"),"utf8");
  assert.match(layout, /LEMONMILK-Regular.otf/);
  assert.doesNotMatch(layout, /RegularItalic|style:.*italic/);
  // Inspect the actual OTF, not just its filename: upright angle and regular weight.
  const font = readFileSync(path.join(root,"app/fonts/LEMONMILK-Regular.otf"));
  const tables = new Map();
  for(let i=0;i<font.readUInt16BE(4);i++){const at=12+i*16;tables.set(font.toString('ascii',at,at+4),font.readUInt32BE(at+8));}
  assert.equal(font.readInt32BE(tables.get('post')+4),0,"The copied font contains upright glyphs");
  assert.equal(font.readUInt16BE(tables.get('OS/2')+4),400);
});

test("Cloudflare renders read fresh content/settings after another worker publishes", async () => {
  let { content, settings } = fixture();
  const fresh = loader({
    "next/server": { connection: async () => {} },
    "@/lib/storage": {
      onCloudflare: () => true,
      readJson: async (key) => clone(key === "content/site-content.json" ? content : settings),
    },
  });
  const { getContent } = fresh("lib/content/store.ts");
  const { readIntroSettings } = fresh("lib/portal/settings-store.ts");
  assert.ok((await getContent()).projects[0].images[0].src);
  assert.ok((await readIntroSettings()).proofTable.items[0].src);
  ({ content, settings } = resetMedia(content, settings));
  assert.equal((await getContent()).projects[0].images[0].src, "");
  assert.equal((await readIntroSettings()).proofTable.items[0].src, "");
});

test("the live reset refuses non-owners, cross-origin requests, missing confirmation and stale reviews", async () => {
  for (const user of [null, { role: "editor" }, { role: "owner", setup: true }]) {
    const app = server({ user });
    assert.ok((await app.route.GET()).status >= 400);
    assert.ok((await app.post({})).status >= 400);
    assert.equal(app.events.length, 0);
  }
  const app = server();
  const { token } = await (await app.route.GET()).json();
  assert.equal((await app.post({ token, confirmation: "CLEAR MEDIA" }, "https://elsewhere.test")).status, 403);
  assert.equal((await app.post({ token })).status, 400);
  assert.equal((await app.post({ token: "stale", confirmation: "CLEAR MEDIA" })).status, 409);
  assert.equal(app.events.length, 0);
});

test("storage or backup failure leaves the saved site intact; failed publish restores both documents", async () => {
  const unavailable = server({ readFails: true });
  assert.equal((await unavailable.route.GET()).status, 500);
  assert.equal(unavailable.events.length, 0);
  for (const options of [{ backupFails: true }, { saveFails: true }]) {
    const app = server(options);
    const { token } = await (await app.route.GET()).json();
    assert.equal((await app.post({ token, confirmation: "CLEAR MEDIA" })).status, 500);
    assert.deepEqual(app.state(), app.original);
    assert.equal(app.events.some(([op]) => op === "remove"), false);
  }
});

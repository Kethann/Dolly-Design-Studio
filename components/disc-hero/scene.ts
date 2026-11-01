import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { bindCircleDrag } from "./drag";
import { DISC_DEFAULTS, sanitizeDisc, glassCircleComposition, glassArrivalSpinMultiplier, glassArrivalOpacity, glassEase, glassProjectorOrigin, discAimProfileForWidth, discPanelLayout, discTitlePoint, discProjectionWindow, discProjectionCoverage, discProjectionMask, discArtworkPresence, discImageBands, visibleDiscItems, releaseDiscImage, discViewportFeather, type DiscControls } from "../../lib/content/disc";

export type DiscImage = { src: string; label: string; titleColor?: string; glowColor?: string; glowIntensity?: number; rotation?: number;
  scale?: number; opacity?: number; blend?: "normal" | "screen" | "additive" };
export type DiscScene = ReturnType<typeof createDiscScene>;
const TAU = Math.PI * 2;
const R = 2.35;
const GLASS_LIGHT = 0xb0cced;
const COLOUR_GRID = 8;
// The one description of the light. The volume and every surface read these same rays,
// so a ray always brightens the exact spot it lands on.
const rayShader = (count: number) => `
#define DISC_RAYS ${count}
  uniform vec4 rays[DISC_RAYS];
  vec2 discWindow(vec2 point){
    float radial=(point.x-projectorBounds.x)/(projectorBounds.y-projectorBounds.x);
    float halfWidth=mix(projectorBounds.z,projectorBounds.w,clamp(radial,0.,1.));
    return vec2(radial*2.-1.,point.y/max(halfWidth,.001));
  }
  float rayField(vec2 p){
    float sum=0.;
    for(int i=0;i<DISC_RAYS;i++){ vec2 d=(p-rays[i].xy)/rays[i].z; sum+=rays[i].w*exp(-dot(d,d)); }
    return sum;
  }
  float beamBody(vec2 p){ float r=length(max(abs(p)-.4,0.))+.4; return 1.-smoothstep(.48,1.48,r); }`;
// Surface-space reflection, not a floating sprite or a glowing slot outline.
const contactShader = `float contactReflection(vec2 p,float shafts){
    float radius=max(abs(p.x),abs(p.y));
    // A low-energy reflection scattered by the glass, with each ray's footprint inside it.
    float spread=mix(1.05,1.45,projectorSoftness);
    float edge=1.-smoothstep(spread*.72,spread,radius);
    float pool=exp(-dot(p*vec2(1.2,1.35),p*vec2(1.2,1.35)));
    float soft=exp(-dot(p*vec2(2.6,2.3),p*vec2(2.6,2.3)));
    return (pool*.13+soft*.17+shafts*pool*.54)*edge*contactStrength;
  }`;
const noiseSize = 64;
// The light lands just above the glass, in the disc's own space.
const BEAM_PLANE = .065;

function plaque(layout: ReturnType<typeof discPanelLayout>, inset = 0) {
  const { inner, outer, innerHalfWidth, outerHalfWidth } = layout;
  inset = Math.min(inset, innerHalfWidth * 0.2);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    (inner + inset) * R, -(innerHalfWidth - inset) * R, 0,
    (outer - inset) * R, -(outerHalfWidth - inset) * R, 0,
    (outer - inset) * R, (outerHalfWidth - inset) * R, 0,
    (inner + inset) * R, (innerHalfWidth - inset) * R, 0,
  ], 3));
  // Source artwork reads in its original orientation: radial is image X, tangent is image Y.
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // Pivot at the plaque's centre, so it opens toward the viewer instead of orbiting the disc.
  g.translate(-(inner + outer) * R / 2, 0, 0);
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}

export function createDiscScene(canvas: HTMLCanvasElement, initial: DiscImage[], controls: DiscControls = { ...DISC_DEFAULTS }, onError?: () => void) {
  Object.assign(controls, sanitizeDisc(controls));
  const lowPower = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 4) <= 4;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.transmissionResolutionScale = lowPower ? 0.35 : 0.5;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 26);
  camera.lookAt(0, 0, 0);
  const tilt = new THREE.Group(); tilt.position.x = -0.6; scene.add(tilt);
  const disc = new THREE.Group(); tilt.add(disc);
  const owned = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(v: T): T => { owned.add(v); return v; };
  const makeAimGuide = (colour: number) => {
    const guide = new THREE.Group();
    const material = own(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .95,
      depthTest: false, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(.055, .078, 32)), material);
    const dot = new THREE.Mesh(own(new THREE.CircleGeometry(.018, 16)), material);
    ring.renderOrder = dot.renderOrder = 100;
    guide.add(ring, dot); guide.visible = false; scene.add(guide);
    return guide;
  };
  // Portal-only calibration markers. They are never enabled on the public page.
  const originGuide = makeAimGuide(0x5be7ff), landingGuide = makeAimGuide(0xffd45b);
  let destroyed = false, active = false, paused = false, aimGuides = false, raf = 0, last = 0, elapsed = 0, firstPose = true;
  let width = 1, height = 1, quality = 1, slowFrames = 0, time = 0, hovered = -1, opened = -1, hoverSettling = false, controlsSettling = false;
  let arrival = 0, scrollExit = 0, smoothedExit = 0;
  let dragging = false, dragAngle = 0, spinBlend = 1;
  // Portal sliders can emit much faster than a frame. Keep one small render-side state so
  // geometry, aiming, lighting and bloom ease together instead of jumping or flickering.
  // Reduced-motion users get the requested value immediately.
  const renderedControls = {
    edgeThickness: controls.edgeThickness,
    circleScale: controls.circleScale, glassOpacity: controls.glassOpacity,
    discTilt: controls.discTilt, discRoll: controls.discRoll,
    spinSpeed: controls.spinSpeed,
    focusAngle: controls.focusAngle, focusRadius: controls.focusRadius,
    originX: controls.originOffsetX, originY: controls.originOffsetY,
    raySpread: controls.raySpread, glowRadius: controls.glowRadius,
    rayIntensity: controls.rayIntensity, bloom: controls.bloom,
    lightIntensity: controls.lightIntensity, glowThreshold: controls.glowThreshold,
    beamGlow: controls.beamGlow, rayStrength: controls.rayStrength,
    surfaceReflection: controls.surfaceReflection, rayPrism: controls.rayPrism,
    rayLength: controls.rayLength, rayElevation: controls.rayElevation,
    rayMotion: controls.rayMotion, saturation: controls.saturation,
    vibrance: controls.vibrance, desaturation: controls.desaturation,
    slotOpacity: controls.slotOpacity, slotBlur: controls.slotBlur,
    unfocusedBrightness: controls.unfocusedBrightness,
  };
  let beamOriginXFraction: number | null = null, beamOriginYFraction: number | null = null;
  const saturation = { value: controls.desaturation };
  const imageSaturation = { value: controls.saturation }, vibrance = { value: controls.vibrance };
  const imageOpacity = { value: controls.slotOpacity }, blur = { value: controls.slotBlur };
  const dimBrightness = { value: controls.unfocusedBrightness };
  const slotGlow = { value: controls.bloom * controls.rayIntensity };
  const projectorTransform = { value: new THREE.Matrix4() };
  const projectorBounds = { value: new THREE.Vector4() };
  const projectorSoftness = { value: controls.glowRadius };
  const projectorPower = { value: controls.rayIntensity };
  const projectorFrame = new THREE.Matrix4();
  // Empty glass produces neutral, slightly cool projector light. It must never retain
  // the hue of the previous title after that title has left the landing window.
  const neutralBeamColor = new THREE.Color(GLASS_LIGHT).multiplyScalar(.72);
  const beamColor = neutralBeamColor.clone(), targetColor = new THREE.Color(), sampledColor = new THREE.Color();
  const neutralBands = new THREE.Vector4(.55, .55, .55, .55);
  const imageBands = { value: neutralBands.clone() };
  const targetBands = new THREE.Vector4();
  const contactColour = { value: beamColor }, contactStrength = { value: 0 };
  // Few rays and few volume steps: this runs per covered pixel, so phones get the smaller budget.
  const rayCount = lowPower ? 5 : 7, beamSteps = lowPower ? 4 : 6, moteCount = lowPower ? 26 : 60;
  const raysUniform = { value: Array.from({ length: rayCount }, () => new THREE.Vector4(0, 0, .3, 0)) };
  const rayShaderSource = rayShader(rayCount);
  // One transparent pane with an analytic bevel. No centre hole, metallic backing,
  // environment capture or transmission framebuffer is needed for this glass treatment.
  const glassLight = { value: controls.lightIntensity };
  const glassOpacity = { value: controls.glassOpacity };
  const glassEdgeWidth = { value: controls.edgeThickness };
  const surfaceReflection = { value: controls.surfaceReflection };
  const glassTint = { value: new THREE.Color(controls.glassTintColor) };
  const targetGlassTint = glassTint.value.clone();
  let lastGlassTint = controls.glassTintColor;
  const glassMaterial = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { projectorTransform, projectorBounds, projectorSoftness, contactColour,
      contactStrength, glassLight, glassOpacity, glassEdgeWidth, surfaceReflection, glassTint, uDesaturation: saturation, rays: raysUniform },
    vertexShader: `uniform mat4 projectorTransform; varying vec2 vGlass, vProjector;
      varying vec3 vGlassNormal, vGlassView;
      void main(){ vec4 world=modelMatrix*vec4(position,1.);
        vGlass=position.xy/2.35; vProjector=(projectorTransform*world).xy/2.35;
        vGlassNormal=normalMatrix*normal; vGlassView=-(viewMatrix*world).xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform vec4 projectorBounds; uniform vec3 contactColour, glassTint;
      uniform float projectorSoftness, contactStrength, glassLight, glassOpacity, glassEdgeWidth, surfaceReflection, uDesaturation;
      varying vec2 vGlass, vProjector;
      varying vec3 vGlassNormal, vGlassView;
      ${rayShaderSource}
      ${contactShader}
      void main(){
        float r=length(vGlass), aa=max(fwidth(r),.00025);
        float edge=1.-smoothstep(1.-aa,1.,r);
        // One fine reflection only: no second lip, shoulder or inner ring.
        // Subpixel coverage decreases with width instead of a thick AA floor
        // making the lowest slider values look identical.
        float thickness=clamp(glassEdgeWidth,.01,1.);
        float lineWidth=.0032*thickness;
        float resolvedWidth=max(lineWidth,aa*.55);
        float bevel=exp(-pow((r-(1.-.006*thickness))/resolvedWidth,2.))
          *min(1.,lineWidth/resolvedWidth);
        // Broad opposite reflections stay in the fixed light frame, so rotating
        // artwork never makes the glass edge pulse or sparkle independently.
        vec2 radial=vProjector/max(length(vProjector),.0001);
        float sweep=pow(abs(dot(radial,normalize(vec2(.65,.76)))),6.);
        float facing=clamp(abs(dot(normalize(vGlassNormal),normalize(vGlassView))),0.,1.);
        float fresnel=.04+.96*pow(1.-facing,5.);
        float rim=bevel*(.7+.3*fresnel);
        vec2 p=discWindow(vProjector);
        float contact=contactReflection(p,rayField(p))*surfaceReflection;
        // The smoked-black interior absorbs background light without becoming an opaque disc.
        // Reflection stays anchored to the projector; only faint surface variation rotates.
        float lampFacing=exp(-pow(atan(vProjector.y,vProjector.x)*1.5,2.));
        float sheen=exp(-pow((vProjector.y+.12*vProjector.x-.035)/.14,2.))
          *smoothstep(.35,.85,r)*(1.-smoothstep(.97,1.,r))
          *exp(-dot(p*vec2(.7,.85),p*vec2(.7,.85)));
        vec3 smokeTint=mix(glassTint,vec3(dot(glassTint,vec3(.2126,.7152,.0722))),uDesaturation);
        float tintAlpha=glassOpacity*mix(.72,.88,smoothstep(.2,.95,r));
        vec3 rimTint=mix(vec3(.48,.62,.76),vec3(.82,.9,.96),sweep);
        // Independent layers: clear glass must still reflect at its edge, and
        // surface-reflection settings must not extinguish title emission.
        float rimAlpha=clamp(rim*(.62+sweep*.5)*glassLight,0.,.85);
        float contactAlpha=clamp(contact*.12+sheen*.04*contactStrength*surfaceReflection,0.,.48);
        float reflectionAlpha=rimAlpha+contactAlpha*(1.-rimAlpha);
        float a=reflectionAlpha+tintAlpha*(1.-reflectionAlpha);
        vec3 reflection=rimTint*(.48+sweep*.38+lampFacing*.24)*rimAlpha
          +contactColour*contactAlpha*(1.-rimAlpha);
        vec3 c=(reflection+smokeTint*tintAlpha*(1.-reflectionAlpha))/max(a,.0001);
        gl_FragColor=vec4(c,clamp(a*edge,0.,1.));
      }`,
  }));
  const glassPane = new THREE.Mesh(own(new THREE.CircleGeometry(R, 192)), glassMaterial);
  glassPane.renderOrder = -2;
  disc.add(glassPane);

  type ColourSample = { u: number; v: number; colour: THREE.Color; weight: number };
  type Slot = { group: THREE.Group; image: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; texture: THREE.CanvasTexture;
    bands: THREE.Vector4; samples: ColourSample[]; imageAspect: number; titleColor?: THREE.Color;
    angle: number; rotation?: number; titleScale: number; weight: number; lift: number; scale: number };
  let imageSources: string[] = [];
  let slots: Slot[] = [], generation = 0, lastGap = controls.slotGap, lastSize = controls.slotSize;
  let layout = discPanelLayout(initial.length, controls.slotGap, controls.slotSize);
  let loader = new AbortController();
  const averageCanvas = document.createElement("canvas"); averageCanvas.width = averageCanvas.height = 24;
  const averageContext = averageCanvas.getContext("2d", { willReadFrequently: true })!;
  const panels = new THREE.Group(); disc.add(panels);
  const geometries: THREE.BufferGeometry[] = [];

  function clearSlots() {
    loader.abort(); loader = new AbortController(); generation++;
    for (const s of slots) {
      s.texture.dispose(); s.image.material.dispose();
      s.texture.image.width = s.texture.image.height = 0;
    }
    geometries.forEach(g => g.dispose()); geometries.length = 0;
    panels.clear(); slots = []; hovered = opened = -1;
  }
  function updateGap() {
    // A spacing slider must not re-fetch/re-decode every image on each pointer move.
    const old = geometries.splice(0);
    layout = discPanelLayout(slots.length, controls.slotGap, controls.slotSize);
    const imageGeometry = plaque(layout);
    geometries.push(imageGeometry);
    for (const slot of slots) {
      slot.image.geometry = imageGeometry;
      slot.image.material.uniforms.panelAspect.value = layout.aspect;
    }
    old.forEach(g => g.dispose());
  }
  function setTitleBlend(material: THREE.ShaderMaterial, blend: DiscImage["blend"]) {
    material.blending = blend === "screen" ? THREE.CustomBlending : blend === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.uniforms.screenBlend.value = blend === "screen" ? 1 : 0;
    // Screen uses premultiplied source RGB, so reducing opacity fades both
    // contributions correctly and zero opacity cannot darken the background.
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcColorFactor;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  function setImages(images: DiscImage[]) {
    images = visibleDiscItems(images);
    // Artwork settings update in place: angle/colour sliders must not blank the
    // circle by aborting and decoding the same textures again on every change.
    if (images.length === slots.length && images.every((item, i) => item.src === imageSources[i])) {
      images.forEach((item, i) => {
        const slot = slots[i], uniforms = slot.image.material.uniforms;
        slot.rotation = item.rotation;
        slot.titleScale = THREE.MathUtils.clamp(item.scale ?? 1, .25, 1);
        uniforms.titleOpacity.value = THREE.MathUtils.clamp(item.opacity ?? 1, 0, 1);
        setTitleBlend(slot.image.material, item.blend);
        uniforms.titleColour.value.set(item.titleColor ?? "#ffffff");
        uniforms.useTitleColour.value = item.titleColor ? 1 : 0;
        slot.titleColor = item.titleColor ? uniforms.titleColour.value : undefined;
        uniforms.titleGlowColour.value.set(item.glowColor ?? "#ffffff");
        uniforms.useTitleGlowColour.value = item.glowColor ? 1 : 0;
        uniforms.titleGlowIntensity.value = THREE.MathUtils.clamp(item.glowIntensity ?? 1, 0, 2);
      });
      wake();
      return;
    }
    clearSlots();
    imageSources = images.map(item => item.src);
    const gen = generation, signal = loader.signal;
    layout = discPanelLayout(images.length, controls.slotGap, controls.slotSize);
    const { step } = layout;
    const imageGeometry = plaque(layout);
    geometries.push(imageGeometry);
    // Aggregate CPU/GPU texture budget is bounded as the slot count grows.
    const size = 2 ** Math.floor(Math.log2(Math.max(64, Math.min(lowPower ? 512 : 1024, Math.sqrt(4_194_304 / Math.max(1, images.length))))));
    images.forEach((item, i) => {
      const thumb = document.createElement("canvas"); thumb.width = size; thumb.height = size;
      const texture = new THREE.CanvasTexture(thumb); texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const customTitle = item.titleColor ? new THREE.Color(item.titleColor) : new THREE.Color(0xffffff);
      const customGlow = item.glowColor ? new THREE.Color(item.glowColor) : new THREE.Color(0xffffff);
      const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: texture },
        imageSaturation, vibrance, imageOpacity, blur, dimBrightness, slotGlow,
        imageAspect: { value: 1 }, panelAspect: { value: layout.aspect }, rear: { value: 0 }, hover: { value: 0 },
        titleColour: { value: customTitle }, useTitleColour: { value: item.titleColor ? 1 : 0 },
        titleGlowColour: { value: customGlow }, useTitleGlowColour: { value: item.glowColor ? 1 : 0 },
        titleGlowIntensity: { value: THREE.MathUtils.clamp(item.glowIntensity ?? 1, 0, 2) },
        titleOpacity: { value: THREE.MathUtils.clamp(item.opacity ?? 1, 0, 1) }, screenBlend: { value: 0 },
        projectorTransform, projectorBounds, projectorSoftness, projectorPower, contactColour, contactStrength, rays: raysUniform },
        vertexShader: `uniform mat4 projectorTransform; varying vec2 vProjector; varying vec2 vUv;
          void main(){ vec4 world=modelMatrix*vec4(position,1.);
            vProjector=(projectorTransform*world).xy/2.35;
            vUv=uv; gl_Position=projectionMatrix*viewMatrix*world; }`,
        fragmentShader: `uniform sampler2D map;
        uniform float imageSaturation, vibrance, imageOpacity, blur, dimBrightness, slotGlow, projectorSoftness, projectorPower, contactStrength, rear, hover, imageAspect, panelAspect;
        uniform float useTitleColour, useTitleGlowColour, titleGlowIntensity, titleOpacity, screenBlend;
        uniform vec3 contactColour, titleColour, titleGlowColour;
        uniform vec4 projectorBounds; varying vec2 vProjector; varying vec2 vUv;
        ${rayShaderSource}
        ${contactShader}
        float feather(float edge){
          float width=.32+.26*projectorSoftness;
          float t=clamp((edge-(1.-width))/width,0.,1.);
          return clamp(1.-t*t*t*(t*(t*6.-15.)+10.),0.,1.);
        }
        void main(){
          float radial=(vProjector.x-projectorBounds.x)/(projectorBounds.y-projectorBounds.x);
          float halfWidth=mix(projectorBounds.z,projectorBounds.w,clamp(radial,0.,1.));
          float focus=feather(abs(radial*2.-1.))*feather(abs(vProjector.y)/halfWidth)*smoothstep(0.,.25,projectorPower);
          // Local card UVs make the artwork and title one rigid print. Preserve the uploaded
          // image ratio with contain-fit padding instead of stretching it to the card.
          vec2 fit=vec2(1.);
          if(imageAspect>panelAspect) fit.y=panelAspect/imageAspect;
          else fit.x=imageAspect/panelAspect;
          vec2 uv=(vUv-.5)/fit+.5;
          float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
          vec4 tex=texture2D(map,clamp(uv,0.,1.),rear*(1.-focus)*(1.-hover)*min(blur,2.)); tex.a*=inside;
          if(tex.a<.01) discard;
          float sourcePeak=max(tex.r,max(tex.g,tex.b));
          float titleInk=smoothstep(.1,.58,sourcePeak)*tex.a;
          vec3 c=mix(tex.rgb,titleColour*sourcePeak,titleInk*useTitleColour);
          float grey=dot(c,vec3(.2126,.7152,.0722));
          float chroma=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
          c=max(vec3(0.),mix(vec3(grey),c,imageSaturation*(1.+vibrance*(1.-chroma))));
          vec3 artworkCore=c;
          // Emission comes from the artwork itself, only where the fixed projector window overlaps it.
          vec2 lightWindow=discWindow(vProjector);
          float shafts=rayField(lightWindow);
          // Rays visibly travel across the print: lit where one lands, a little dimmer between them.
          c=mix(vec3(grey)*dimBrightness,c*(1.+slotGlow*.3)*(.9+shafts*.32),focus);
          c=mix(c,mix(tex.rgb,titleColour*sourcePeak,useTitleColour),hover*.85);
          // Extract the visible title ink from the uploaded artwork. There is deliberately no
          // baseline card emission: only bright/coloured title pixels cross the bloom threshold.
          vec3 titlePigment=c/max(max(c.r,max(c.g,c.b)),.12);
          vec3 automaticGlow=mix(contactColour,titlePigment,.68);
          vec3 titleLight=mix(automaticGlow,titleGlowColour,useTitleGlowColour);
          float titleGlow=titleInk*focus*(1.-hover)*(.08+.16*shafts)
            *contactReflection(lightWindow,shafts)*titleGlowIntensity;
          c+=titleLight*titleGlow*(.9+slotGlow*.45);
          // Bloom reads the emission, while this core blend keeps the uploaded logo's real
          // colour and detail visible instead of letting the glow bleach it into a white patch.
          c=mix(c,artworkCore*(1.+slotGlow*.1),titleInk*focus*.5);
          float outputAlpha=max(tex.a*imageOpacity,titleInk*focus*.92)*titleOpacity;
          vec3 blended=mix(c,clamp(c,0.,1.),screenBlend);
          gl_FragColor=vec4(blended*mix(1.,outputAlpha,screenBlend),outputAlpha); }` });
      setTitleBlend(material, item.blend);
      const group = new THREE.Group(); group.rotation.z = i * step; panels.add(group);
      // Only the transparent PNG is mounted: no glass rectangle, border or opaque backing.
      const image = new THREE.Mesh(imageGeometry, material); image.position.z = 0.041; group.add(image);
      slots.push({ group, image, texture, bands: new THREE.Vector4(.55,.55,.55,.55),
        samples: [], imageAspect: 1, titleColor: item.titleColor ? customTitle : undefined, angle: i * step, rotation: item.rotation,
        titleScale: THREE.MathUtils.clamp(item.scale ?? 1, .25, 1), weight: 0, lift: 0, scale: 1 });
    });
    // Decode one image at a time. Failed/CORS-blocked images leave the glass empty.
    void (async () => {
      for (let i = 0; i < images.length; i++) {
        if (destroyed || signal.aborted) return;
        if (!images[i].src) continue;
        try {
          const response = await fetch(images[i].src, { signal, mode: "cors", credentials: "same-origin" });
          if (!response.ok) continue;
          const blob = await response.blob(); if (blob.size > 12 * 1024 * 1024) continue;
          let bitmap: ImageBitmap | HTMLImageElement;
          try { bitmap = await createImageBitmap(blob); }
          catch {
            // Some browsers cannot decode SVG blobs with createImageBitmap; Image.decode can.
            const url = URL.createObjectURL(blob), image = new Image();
            try { image.src = url; await image.decode(); bitmap = image; }
            finally { URL.revokeObjectURL(url); }
          }
          const release = () => releaseDiscImage(bitmap);
          if (destroyed || gen !== generation) { release(); return; }
          const slot = slots[i], thumb = slot.texture.image as HTMLCanvasElement, ctx = thumb.getContext("2d")!;
          const scale = Math.min(size / bitmap.width, size / bitmap.height);
          thumb.width = Math.max(1, Math.round(bitmap.width * scale)); thumb.height = Math.max(1, Math.round(bitmap.height * scale));
          ctx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
          averageContext.clearRect(0, 0, 24, 24); averageContext.drawImage(bitmap, 0, 0, 24, 24);
          const pixels = averageContext.getImageData(0, 0, 24, 24).data;
          slot.bands.fromArray(discImageBands(pixels, 24));
          slot.imageAspect = bitmap.width / bitmap.height;
          slot.samples = [];
          // Eight cells per axis keep transparent title edges spatially accurate without a GPU
          // readback or a per-frame texture scan (at most 512 tiny samples across eight titles).
          for (let row = 0; row < COLOUR_GRID; row++) for (let col = 0; col < COLOUR_GRID; col++) {
            let sr = 0, sg = 0, sb = 0, total = 0;
            const x0 = Math.floor(col * 24 / COLOUR_GRID), x1 = Math.floor((col + 1) * 24 / COLOUR_GRID);
            const y0 = Math.floor(row * 24 / COLOUR_GRID), y1 = Math.floor((row + 1) * 24 / COLOUR_GRID);
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
              const p = (y * 24 + x) * 4, red = pixels[p] / 255, green = pixels[p + 1] / 255, blue = pixels[p + 2] / 255;
              const peak = Math.max(red, green, blue), chroma = peak - Math.min(red, green, blue);
              const weight = pixels[p + 3] / 255 * peak * (.12 + chroma * 3);
              sr += red * weight; sg += green * weight; sb += blue * weight; total += weight;
            }
            // Canvas rows start at the top; CanvasTexture UVs start at the bottom.
            if (total > .0001) slot.samples.push({ u: (col + .5) / COLOUR_GRID, v: 1 - (row + .5) / COLOUR_GRID,
              colour: new THREE.Color(sr / total, sg / total, sb / total).convertSRGBToLinear(), weight: total / Math.max(1, (x1 - x0) * (y1 - y0)) });
          }
          // WebGL textures cannot change size after first upload; replace and release the placeholder.
          const texture = new THREE.CanvasTexture(thumb); texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          slot.texture.dispose(); slot.texture = texture; slot.image.material.uniforms.map.value = texture;
          slot.image.material.uniforms.imageAspect.value = slot.imageAspect;
          release(); wake();
        } catch { /* Abort, network and cross-origin failures keep a usable placeholder. */ }
      }
    })();
    wake();
  }

  const anchor = new THREE.Vector3(), source = new THREE.Vector3();
  // Smoke is two lookups into one small tiling texture, never procedural noise per step.
  const noiseData = new Uint8Array(noiseSize * noiseSize);
  const waves = Array.from({ length: 14 }, () => [Math.ceil(Math.random() * 7) * (Math.random() < .5 ? -1 : 1), Math.ceil(Math.random() * 7), Math.random() * TAU]);
  for (let y = 0; y < noiseSize; y++) for (let x = 0; x < noiseSize; x++) {
    let sum = 0;
    for (const [fx, fy, phase] of waves) sum += Math.sin((x * fx + y * fy) / noiseSize * TAU + phase) / Math.hypot(fx, fy);
    noiseData[y * noiseSize + x] = THREE.MathUtils.clamp(127 + sum * 62, 0, 255);
  }
  const smokeTexture = own(new THREE.DataTexture(noiseData, noiseSize, noiseSize, THREE.RedFormat));
  smokeTexture.wrapS = smokeTexture.wrapT = THREE.RepeatWrapping;
  smokeTexture.minFilter = smokeTexture.magFilter = THREE.LinearFilter; smokeTexture.needsUpdate = true;
  const sourceLocal = { value: new THREE.Vector3() }, beamPlanes = { value: Array.from({ length: 4 }, () => new THREE.Vector3()) };
  const beamTime = { value: 0 }, beamMotion = { value: controls.rayMotion };
  const beamGlow = { value: controls.beamGlow }, rayStrength = { value: controls.rayStrength };
  const volumeScale = { value: 1 };
  // One convex hull, shaded once per pixel on its far side. Each pixel marches its view ray through
  // the cone, so the light has real depth and ends exactly on the disc plane instead of on a flat edge.
  const fanMaterial = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: beamColor }, power: { value: 0 }, time: beamTime, motion: beamMotion, prism: { value: controls.rayPrism }, rayStyle: { value: controls.rayStyle }, viewport: { value: new THREE.Vector2(1, 1) },
      projectorTransform, projectorBounds, sourceLocal, beamPlanes, beamGlow, rayStrength, volumeScale, rays: raysUniform, smokeTexture: { value: smokeTexture } },
    vertexShader: `uniform mat4 projectorTransform; varying vec3 vLocal, vCamera;
      void main(){ vec4 world=modelMatrix*vec4(position,1.);
        vLocal=(projectorTransform*world).xyz; vCamera=(projectorTransform*vec4(cameraPosition,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `#define BEAM_STEPS ${beamSteps}
      uniform vec3 tint, sourceLocal, beamPlanes[4]; uniform vec4 projectorBounds; uniform float power, prism, rayStyle, time, motion, beamGlow, rayStrength, volumeScale; uniform vec2 viewport; uniform sampler2D smokeTexture; varying vec3 vLocal, vCamera;
      ${rayShaderSource}
      void main(){
        vec3 toCamera=vCamera-vLocal; float span=length(toCamera); vec3 dir=toCamera/span;
        // The fragment is where the view ray leaves the hull; find where it entered.
        for(int i=0;i<4;i++){ float d=dot(beamPlanes[i],dir); if(d>.0001) span=min(span,dot(beamPlanes[i],sourceLocal-vLocal)/d); }
        if(dir.z<-.0001) span=min(span,(${BEAM_PLANE.toFixed(3)}-vLocal.z)/dir.z);
        // Interleaved jitter trades banding for a fine grain that bloom and FXAA dissolve.
        float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        float scatter=0., bodySum=0.; vec2 meanWindow=vec2(0.); float meanWeight=.0001;
        vec2 drift=vec2(time*.021,-time*.013)*motion;
        for(int i=0;i<BEAM_STEPS;i++){
          vec3 point=vLocal+dir*span*(float(i)+jitter)/float(BEAM_STEPS);
          float along=clamp((sourceLocal.z-point.z)/(sourceLocal.z-${BEAM_PLANE.toFixed(3)}),.002,1.);
          vec2 p=discWindow((sourceLocal.xy+(point.xy-sourceLocal.xy)/along)/2.35);
          float body=beamBody(p);
          if(body<=0.) continue;
          // Smoke is sampled in space, not in beam coordinates, so it does not smear along the cone.
          float smoke=texture2D(smokeTexture,point.xy*.31+point.z*.17+drift).r;
          smoke=smoke*.65+.35*texture2D(smokeTexture,point.yx*.83-drift*1.7).r;
          float shafts=rayField(p);
          // The off-screen source fades in. Near the glass, surface reflection takes over
          // from airborne haze so the original logo remains legible underneath the light.
          float landingHaze=1.-.48*smoothstep(.78,1.,along);
          float reach=smoothstep(.015,.42,along)*mix(1.18,1.,along)*landingHaze;
          float density=body*reach*((.05+smoke*smoke*.2)*beamGlow+shafts*(.9+smoke*1.1)*rayStrength);
          scatter+=density; bodySum+=body*reach*(1.-smoothstep(0.,.45,length(p)));
          meanWindow+=p*density; meanWeight+=density;
        }
        scatter*=span*volumeScale/float(BEAM_STEPS); bodySum*=span*volumeScale/float(BEAM_STEPS);
        vec2 p=meanWindow/meanWeight;
        float prismatic=step(.5,rayStyle)*(1.-step(1.5,rayStyle));
        float luminance=dot(tint,vec3(.2126,.7152,.0722));
        vec3 spectrum=.5+.5*cos(6.28318*(p.y*.42+p.x*.14+vec3(0.,.33,.67)));
        // Dispersion modulates the artwork's colour instead of replacing it with a rainbow.
        vec3 colour=tint*mix(vec3(1.8),vec3(.9)+spectrum*1.8,prism*prismatic*.45);
        // The haze carries the artwork pigment; the lamp's neutral core stays narrow.
        colour=mix(colour,vec3(max(.32,luminance)*1.38),clamp(bodySum*.025,0.,.1));
        // Fade the light before it reaches the canvas boundary, without masking the disc or text.
        vec2 screen=gl_FragCoord.xy/viewport;
        float frame=smoothstep(0.,.06,screen.x)*(1.-smoothstep(.93,1.,screen.x))*smoothstep(0.,.08,screen.y)*(1.-smoothstep(.92,1.,screen.y));
        gl_FragColor=vec4(colour,min(scatter*power*frame*.62,min(1.,.72*max(1.,beamGlow))));
      }` }));
  const beamGeometry = own(new THREE.BufferGeometry());
  const beamPositions = new THREE.Float32BufferAttribute(new Float32Array(54), 3).setUsage(THREE.DynamicDrawUsage);
  beamGeometry.setAttribute("position", beamPositions);
  const fan = new THREE.Mesh(beamGeometry, fanMaterial); fan.frustumCulled = false; scene.add(fan);
  const corners = Array.from({ length: 4 }, () => new THREE.Vector3());
  const hullFace = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2];
  const localCorners = Array.from({ length: 4 }, () => new THREE.Vector3()), planeA = new THREE.Vector3(), planeB = new THREE.Vector3(), discNormal = new THREE.Vector3();
  const projectionAxis = new THREE.Vector3(0, 0, 1);
  const titleSamplePoint = { x: 0, y: 0 };
  let projection = discProjectionWindow(layout, controls.focusRadius, controls.raySpread);
  let firstRays = true;
  let projectionLayout = layout, projectionRadius = controls.focusRadius, projectionSpread = controls.raySpread;

  // Each ray lives briefly: appears somewhere random, wanders, fades out, reappears elsewhere.
  // Fading through zero means a respawn can never be seen as a jump.
  type Ray = { x: number; y: number; vx: number; vy: number; width: number; peak: number; age: number; life: number; seed: number };
  const spawnRay = (ray: Ray, broad: boolean) => {
    ray.x = (Math.random() * 2 - 1) * .78; ray.y = (Math.random() * 2 - 1) * .78;
    const heading = Math.random() * TAU, speed = .025 + Math.random() * .07;
    ray.vx = Math.cos(heading) * speed; ray.vy = Math.sin(heading) * speed;
    ray.width = broad ? .2 + Math.random() * .14 : .045 + Math.random() * .08;
    ray.peak = broad ? .28 + Math.random() * .18 : .7 + Math.random() * .8;
    ray.life = 2.6 + Math.random() * 5; ray.age = 0; ray.seed = Math.random() * 100;
  };
  const rayStates = Array.from({ length: rayCount }, (_, i) => {
    const ray = { x: 0, y: 0, vx: 0, vy: 0, width: 0, peak: 0, age: 0, life: 1, seed: 0 };
    spawnRay(ray, i < 2);
    ray.age = ray.life * (.2 + .6 * i / rayCount);
    return ray;
  });
  function bandLight(x: number) {
    const b = imageBands.value, t = THREE.MathUtils.clamp(x * .5 + .5, 0, 1) * 3;
    return t < 1 ? THREE.MathUtils.lerp(b.x, b.y, t) : t < 2 ? THREE.MathUtils.lerp(b.y, b.z, t - 1) : THREE.MathUtils.lerp(b.z, b.w, t - 2);
  }
  function updateRays(dt: number) {
    const amount = renderedControls.rayMotion, style = controls.rayStyle;
    const widthScale = style === 2 ? 1.45 : style === 0 ? .82 : 1, peakScale = style === 2 ? .68 : style === 0 ? 1.15 : 1;
    rayStates.forEach((ray, i) => {
      ray.age += dt * amount * 1.8;
      ray.x += ray.vx * dt * amount * 2; ray.y += ray.vy * dt * amount * 2;
      if (ray.age >= ray.life || Math.abs(ray.x) > 1.05 || Math.abs(ray.y) > 1.05) spawnRay(ray, i < 2);
      const fade = Math.sin(Math.PI * ray.age / ray.life);
      const shimmer = 1 + amount * (.2 * Math.sin(time * 2.3 + ray.seed) + .14 * Math.sin(time * 5.7 + ray.seed * 1.7));
      const wanderX = amount * .05 * Math.sin(time * .9 + ray.seed), wanderY = amount * .05 * Math.cos(time * .73 + ray.seed * 2.1);
      raysUniform.value[i].set(ray.x + wanderX, ray.y + wanderY, ray.width * widthScale, ray.peak * peakScale * fade * fade * shimmer * bandLight(ray.x));
    });
  }

  // Dust only shows where a ray passes through it, which is what makes the shafts read as light.
  const moteGeometry = own(new THREE.BufferGeometry());
  moteGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(moteCount * 3), 3));
  moteGeometry.setAttribute("seed", new THREE.Float32BufferAttribute(Array.from({ length: moteCount * 4 }, () => Math.random()), 4));
  const moteMaterial = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: beamColor }, time: beamTime, motion: beamMotion, power: fanMaterial.uniforms.power, beamGlow, rayStrength, viewport: fanMaterial.uniforms.viewport, projectorBounds, sourceLocal, projectorFrame: { value: projectorFrame }, rays: raysUniform },
    vertexShader: `attribute vec4 seed; uniform float time, motion, power, beamGlow, rayStrength; uniform vec2 viewport; uniform vec3 sourceLocal; uniform vec4 projectorBounds; uniform mat4 projectorFrame; varying float vLight;
      ${rayShaderSource}
      void main(){
        float phase=seed.z+time*(.006+.012*seed.w)*motion;
        float along=mix(.18,.97,fract(phase));
        vec2 p=(seed.xy*2.-1.)*.95+.06*motion*vec2(sin(time*.31+seed.z*40.),cos(time*.27+seed.w*40.));
        float halfWidth=mix(projectorBounds.z,projectorBounds.w,p.x*.5+.5);
        vec3 landing=vec3((mix(projectorBounds.x,projectorBounds.y,p.x*.5+.5))*2.35,p.y*halfWidth*2.35,${BEAM_PLANE.toFixed(3)});
        vec4 world=projectorFrame*vec4(mix(sourceLocal,landing,along),1.);
        float twinkle=.55+.45*sin(time*(1.1+seed.w*2.3)*motion+seed.x*60.);
        vLight=beamBody(p)*(.1*beamGlow+rayField(p)*1.3*rayStrength)*twinkle*power*smoothstep(0.,.1,fract(phase))*(1.-smoothstep(.88,1.,fract(phase)));
        gl_Position=projectionMatrix*viewMatrix*world;
        gl_PointSize=(1.2+seed.w*2.2)*clamp(viewport.y/640.,.8,2.2);
      }`,
    fragmentShader: `uniform vec3 tint; varying float vLight;
      void main(){ vec2 c=gl_PointCoord*2.-1.; float a=1.-dot(c,c); if(a<=0.) discard;
        gl_FragColor=vec4(mix(tint,vec3(1.),.65)*1.5,a*a*min(vLight,1.)); }` }));
  const motes = new THREE.Points(moteGeometry, moteMaterial); motes.frustumCulled = false; scene.add(motes);
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), controls.bloom, 0.75, 0.72);
  // Feather the complete scene in the existing antialias pass: no extra render target.
  const output = new OutputPass(), antialias = new ShaderPass({ ...FXAAShader,
    uniforms: { ...FXAAShader.uniforms, arrival: { value: 0 }, entranceOpacity: { value: 0 }, scrollExit: { value: 0 }, portrait: { value: 0 }, mirror: { value: 0 }, edgeFeather: { value: new THREE.Vector2(.18, .14) } },
    fragmentShader: `uniform float arrival, entranceOpacity, scrollExit, portrait, mirror;
      uniform vec2 edgeFeather;
      float softBoundary(float distanceToEdge, float featherWidth) {
        float t=clamp(distanceToEdge/featherWidth,0.,1.);
        return t*t*t*(t*(t*6.-15.)+10.);
      }
      ${FXAAShader.fragmentShader}`.replace(
      "gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );",
      `gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );
       // Broad, zero-slope/acceleration fades remove clipped artwork at the
       // copy-side and bottom. Preserve the upper/right arc and all geometry.
       // Apply after bloom so glow cannot leave a hard rectangular seam.
       float sideX=mix(vUv.x,1.-vUv.x,mirror);
       float frame=softBoundary(sideX,edgeFeather.x)*(1.-smoothstep(.96,1.,sideX))
         *softBoundary(vUv.y,edgeFeather.y)*(1.-smoothstep(.92,1.,vUv.y));
       float copyFade=mix(.48,1.,smoothstep(.20,.56,sideX));
       float mobileFade=mix(.03,1.,1.-smoothstep(.4,.74,vUv.y));
       float readable=mix(1.,mix(copyFade,mobileFade,portrait),arrival);
       float exitT=clamp((scrollExit*(1.15-.15*vUv.x)-.03)/.97,0.,1.);
       float outgoing=1.-exitT*exitT*exitT*(exitT*(exitT*6.-15.)+10.);
       // The transparent canvas is premultiplied: fade colour and alpha together.
       gl_FragColor*=frame*readable*outgoing*entranceOpacity;`),
  });
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(antialias);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const restRay = new THREE.Ray(), restHit = new THREE.Vector3();
  const restPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.041);
  const slotCenter = new THREE.Vector3();
  const restPosition = new THREE.Vector3();
  const inverseDisc = new THREE.Matrix4();
  const inverseTilt = new THREE.Matrix4();
  const dragRay = new THREE.Ray(), dragHit = new THREE.Vector3();
  function pointerAngle(x: number, y: number, insideOnly = false) {
    pointer.set(x / width * 2 - 1, 1 - y / height * 2);
    raycaster.setFromCamera(pointer, camera);
    inverseTilt.copy(tilt.matrixWorld).invert();
    if (!dragRay.copy(raycaster.ray).applyMatrix4(inverseTilt).intersectPlane(restPlane, dragHit)) return null;
    const radius = Math.hypot(dragHit.x, dragHit.y);
    // Avoid unstable angles near the centre; a gesture may continue outside the glass.
    if (radius < R * .12 || (insideOnly && radius > R * 1.02)) return null;
    return Math.atan2(dragHit.y, dragHit.x);
  }
  const faceCamera = new THREE.Quaternion(), restRotation = new THREE.Quaternion();
  function resize(w: number, h: number) {
    width = Math.max(1, w); height = Math.max(1, h);
    // Cap total framebuffer pixels as well as DPR; Retina desktops otherwise create huge bloom buffers.
    const dpr = Math.min(2, devicePixelRatio || 1, Math.sqrt((lowPower ? 800_000 : 1_600_000) / (width * height))) * quality;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr); composer.setSize(width, height);
    fanMaterial.uniforms.viewport.value.set(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
    antialias.uniforms.resolution.value.set(1 / Math.max(1, Math.floor(width * dpr)), 1 / Math.max(1, Math.floor(height * dpr)));
    const feather = discViewportFeather(width, height);
    antialias.uniforms.edgeFeather.value.set(feather.side, feather.bottom);
    camera.aspect = width / height;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); wake();
  }
  function settleControl(current: number, target: number, dt: number, rate = 14) {
    if (motion.matches || firstPose) return target;
    const next = THREE.MathUtils.damp(current, target, rate, Math.max(dt, 1 / 60));
    if (Math.abs(next - target) <= .0005) return target;
    controlsSettling = true;
    return next;
  }
  function draw(dt: number) {
    if (lastGap !== controls.slotGap || lastSize !== controls.slotSize) { lastGap = controls.slotGap; lastSize = controls.slotSize; updateGap(); }
    const side = controls.projectorSide;
    const aimProfile = discAimProfileForWidth(width);
    // Breakpoint-specific aim values are read without creating objects in the animation loop.
    const aimFocusAngle = aimProfile === "mobile" ? controls.mobileFocusAngle
      : aimProfile === "tablet" ? controls.tabletFocusAngle : controls.focusAngle;
    const aimFocusRadius = aimProfile === "mobile" ? controls.mobileFocusRadius
      : aimProfile === "tablet" ? controls.tabletFocusRadius : controls.focusRadius;
    const aimOriginX = aimProfile === "mobile" ? controls.mobileOriginOffsetX
      : aimProfile === "tablet" ? controls.tabletOriginOffsetX : controls.originOffsetX;
    const aimOriginY = aimProfile === "mobile" ? controls.mobileOriginOffsetY
      : aimProfile === "tablet" ? controls.tabletOriginOffsetY : controls.originOffsetY;
    controlsSettling = false;
    if (lastGlassTint !== controls.glassTintColor) {
      lastGlassTint = controls.glassTintColor;
      targetGlassTint.set(lastGlassTint);
    }
    // Reuse two colours; paused previews keep drawing only until the new tint settles.
    glassTint.value.r = settleControl(glassTint.value.r, targetGlassTint.r, dt, 12);
    glassTint.value.g = settleControl(glassTint.value.g, targetGlassTint.g, dt, 12);
    glassTint.value.b = settleControl(glassTint.value.b, targetGlassTint.b, dt, 12);
    renderedControls.circleScale = settleControl(renderedControls.circleScale, controls.circleScale, dt, 10);
    renderedControls.glassOpacity = settleControl(renderedControls.glassOpacity, controls.glassOpacity, dt, 12);
    renderedControls.edgeThickness = settleControl(renderedControls.edgeThickness, controls.edgeThickness, dt, 12);
    glassEdgeWidth.value = renderedControls.edgeThickness;
    renderedControls.discTilt = settleControl(renderedControls.discTilt, controls.discTilt, dt, 12);
    renderedControls.discRoll = settleControl(renderedControls.discRoll, controls.discRoll, dt, 12);
    renderedControls.spinSpeed = settleControl(renderedControls.spinSpeed, controls.spinSpeed, dt, 12);
    renderedControls.focusAngle = settleControl(renderedControls.focusAngle, aimFocusAngle, dt, 15);
    renderedControls.focusRadius = settleControl(renderedControls.focusRadius, aimFocusRadius, dt, 15);
    renderedControls.originX = settleControl(renderedControls.originX, aimOriginX, dt, 15);
    renderedControls.originY = settleControl(renderedControls.originY, aimOriginY, dt, 15);
    renderedControls.raySpread = settleControl(renderedControls.raySpread, controls.raySpread, dt, 15);
    renderedControls.glowRadius = settleControl(renderedControls.glowRadius, controls.glowRadius, dt, 12);
    renderedControls.rayIntensity = settleControl(renderedControls.rayIntensity, controls.rayIntensity, dt, 12);
    renderedControls.bloom = settleControl(renderedControls.bloom, controls.bloom, dt, 12);
    renderedControls.lightIntensity = settleControl(renderedControls.lightIntensity, controls.lightIntensity, dt, 12);
    renderedControls.glowThreshold = settleControl(renderedControls.glowThreshold, controls.glowThreshold, dt, 12);
    renderedControls.beamGlow = settleControl(renderedControls.beamGlow, controls.beamGlow, dt, 12);
    renderedControls.rayStrength = settleControl(renderedControls.rayStrength, controls.rayStrength, dt, 12);
    renderedControls.surfaceReflection = settleControl(renderedControls.surfaceReflection, controls.surfaceReflection, dt, 12);
    renderedControls.rayPrism = settleControl(renderedControls.rayPrism, controls.rayPrism, dt, 12);
    renderedControls.rayLength = settleControl(renderedControls.rayLength, controls.rayLength, dt);
    renderedControls.rayElevation = settleControl(renderedControls.rayElevation, controls.rayElevation, dt);
    renderedControls.rayMotion = settleControl(renderedControls.rayMotion, controls.rayMotion, dt, 12);
    renderedControls.saturation = settleControl(renderedControls.saturation, controls.saturation, dt, 12);
    renderedControls.vibrance = settleControl(renderedControls.vibrance, controls.vibrance, dt, 12);
    renderedControls.desaturation = settleControl(renderedControls.desaturation, controls.desaturation, dt, 12);
    renderedControls.slotOpacity = settleControl(renderedControls.slotOpacity, controls.slotOpacity, dt, 12);
    renderedControls.slotBlur = settleControl(renderedControls.slotBlur, controls.slotBlur, dt, 12);
    renderedControls.unfocusedBrightness = settleControl(renderedControls.unfocusedBrightness, controls.unfocusedBrightness, dt, 12);
    imageSaturation.value = renderedControls.saturation; vibrance.value = renderedControls.vibrance;
    imageOpacity.value = renderedControls.slotOpacity; blur.value = renderedControls.slotBlur;
    dimBrightness.value = renderedControls.unfocusedBrightness;
    slotGlow.value = renderedControls.bloom * renderedControls.rayIntensity;
    projectorSoftness.value = renderedControls.glowRadius; projectorPower.value = renderedControls.rayIntensity;
    glassLight.value = renderedControls.lightIntensity;
    glassOpacity.value = renderedControls.glassOpacity;
    if (motion.matches) arrival = 1;
    else if (!paused && !dragging) arrival = Math.min(1, arrival + dt / controls.entranceDuration);
    smoothedExit = settleControl(smoothedExit, scrollExit, dt, 7.5);
    const composition = glassCircleComposition(width, height, arrival);
    const viewHeight = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    // Full circle approaches once, then its centre passes above the frame to form the reference arc.
    tilt.position.set((composition.x - .5) * viewHeight * camera.aspect * -side,
      (.5 - composition.y) * viewHeight, 0);
    tilt.scale.setScalar(composition.radius * viewHeight / R * renderedControls.circleScale);
    volumeScale.value = Math.min(3, tilt.scale.x);
    antialias.uniforms.arrival.value = composition.reveal;
    antialias.uniforms.entranceOpacity.value = motion.matches ? 1 : glassArrivalOpacity(arrival);
    antialias.uniforms.scrollExit.value = smoothedExit;
    antialias.uniforms.portrait.value = width <= 640 ? 1 : 0;
    antialias.uniforms.mirror.value = side > 0 ? 1 : 0;
    tilt.rotation.set(THREE.MathUtils.degToRad(renderedControls.discTilt), 0, THREE.MathUtils.degToRad(renderedControls.discRoll * side), "ZYX");
    if (!motion.matches && !paused) {
      time += dt;
      // The background circle never stops for hover or the separate movie-detail dialog.
      if (!dragging) {
        spinBlend = Math.min(1, spinBlend + dt / .65);
        // Position/scale settle independently; rotation flows through the landing unchanged.
        const arrivalSpin = glassArrivalSpinMultiplier(arrival);
        disc.rotation.z = (disc.rotation.z + renderedControls.spinSpeed * arrivalSpin * glassEase(spinBlend) * dt) % TAU;
      }
    }
    tilt.updateMatrixWorld(true);
    const focus = THREE.MathUtils.degToRad(renderedControls.focusAngle), dx = Math.cos(focus) * -side, dy = Math.sin(focus);
    const m = tilt.matrixWorld.elements, det = m[0] * m[5] - m[1] * m[4];
    const localFocus = Math.atan2((m[0] * dy - m[1] * dx) / det, (m[5] * dx - m[4] * dy) / det);
    // The still/reduced-motion view should also begin with a title under the projector.
    if (firstPose) { firstPose = false; disc.rotation.z = localFocus; tilt.updateMatrixWorld(true); }
    if (projectionLayout !== layout || projectionRadius !== renderedControls.focusRadius || projectionSpread !== renderedControls.raySpread) {
      projectionLayout = layout; projectionRadius = renderedControls.focusRadius; projectionSpread = renderedControls.raySpread;
      projection = discProjectionWindow(layout, projectionRadius, projectionSpread);
    }
    projectorFrame.makeRotationZ(localFocus).premultiply(tilt.matrixWorld);
    projectorTransform.value.copy(projectorFrame).invert();
    projectorBounds.value.set(projection.inner, projection.outer, projection.innerHalfWidth, projection.outerHalfWidth);
    anchor.set(Math.cos(localFocus) * R * projection.center, Math.sin(localFocus) * R * projection.center, 0.06);
    tilt.localToWorld(anchor);
    let coverage = 0, bandCoverage = 0;
    targetColor.setRGB(0, 0, 0);
    targetBands.set(0, 0, 0, 0);
    inverseDisc.copy(disc.matrixWorld).invert();
    disc.getWorldQuaternion(faceCamera).invert().multiply(camera.quaternion);
    const panelCenter = (layout.inner + layout.outer) * R / 2;
    hoverSettling = false;
    for (let index = 0; index < slots.length; index++) {
      // The DOM dialog owns the front-screen reveal. Its background print remains on the glass.
      const slot = slots[index], desired = opened < 0 && index === hovered ? .16 : 0;
      slot.lift = motion.matches ? desired : THREE.MathUtils.damp(slot.lift, desired, 9, dt);
      if (Math.abs(slot.lift - desired) < .001) slot.lift = desired; else hoverSettling = true;
      const desiredScale = desired > 0 ? 1.05 : 1;
      slot.scale = motion.matches ? desiredScale : THREE.MathUtils.damp(slot.scale, desiredScale, 9, dt);
      if (Math.abs(slot.scale - desiredScale) < .001) slot.scale = desiredScale; else hoverSettling = true;
      restPosition.set(Math.cos(slot.angle) * panelCenter, Math.sin(slot.angle) * panelCenter, 0);
      slot.group.position.copy(restPosition);
      restRotation.setFromAxisAngle(projectionAxis, slot.angle);
      slot.group.quaternion.copy(restRotation).slerp(faceCamera, slot.lift);
      slot.image.rotation.z = THREE.MathUtils.degToRad(slot.rotation ?? controls.slotRotation);
      slot.image.scale.setScalar(slot.titleScale);
      const titleOpacity = slot.image.material.uniforms.titleOpacity.value as number;
      slot.image.visible = titleOpacity > 0;
      // A small hover lift stays attached to the continuously rotating glass.
      slot.group.scale.setScalar(slot.scale);
      slot.group.updateMatrixWorld(true);
      slotCenter.set(0, 0, 0).applyMatrix4(slot.group.matrixWorld);
      slot.image.material.uniforms.rear.value = THREE.MathUtils.smoothstep(-slotCenter.z / R, .1, .75);
      slot.image.material.uniforms.hover.value = Math.min(1, slot.lift * 3);
      const projectionAngle = slot.angle + disc.rotation.z - localFocus;
      slot.weight = discProjectionCoverage(layout, projection, projectionAngle, renderedControls.glowRadius, slot.image.rotation.z, slot.titleScale) * titleOpacity;
      // Sample only title pigment actually inside the projector footprint. A title entering
      // halfway changes only from its illuminated half instead of recolouring the beam early.
      const fitX = slot.imageAspect > layout.aspect ? 1 : slot.imageAspect / layout.aspect;
      const fitY = slot.imageAspect > layout.aspect ? layout.aspect / slot.imageAspect : 1;
      let slotInkCoverage = 0;
      for (const sample of slot.samples) {
        const u = .5 + (sample.u - .5) * fitX, v = .5 + (sample.v - .5) * fitY;
        discTitlePoint(layout, u, v, projectionAngle, slot.image.rotation.z, titleSamplePoint, slot.titleScale);
        const mask = discProjectionMask(titleSamplePoint.x, titleSamplePoint.y, projection, renderedControls.glowRadius);
        const sampleWeight = sample.weight * mask * titleOpacity * slot.titleScale * slot.titleScale;
        if (sampleWeight <= .000001) continue;
        const colour = slot.titleColor ?? sample.colour;
        targetColor.r += colour.r * sampleWeight;
        targetColor.g += colour.g * sampleWeight;
        targetColor.b += colour.b * sampleWeight;
        coverage += sampleWeight; slotInkCoverage += sampleWeight;
      }
      // Density follows visible title pigment too; the invisible placement region is not a card.
      targetBands.addScaledVector(slot.bands, slotInkCoverage);
      bandCoverage += slotInkCoverage;
    }
    const artworkPresence = discArtworkPresence(coverage);
    if (coverage > .00001) targetColor.multiplyScalar(1 / coverage); else targetColor.copy(neutralBeamColor);
    const luminance = targetColor.r * 0.2126 + targetColor.g * 0.7152 + targetColor.b * 0.0722;
    const chroma = Math.max(targetColor.r, targetColor.g, targetColor.b) - Math.min(targetColor.r, targetColor.g, targetColor.b);
    const colourBoost = coverage > .00001 ? renderedControls.saturation * (1 + renderedControls.vibrance * (1 - chroma)) : 1;
    targetColor.setRGB(Math.max(0, luminance + (targetColor.r - luminance) * colourBoost),
      Math.max(0, luminance + (targetColor.g - luminance) * colourBoost), Math.max(0, luminance + (targetColor.b - luminance) * colourBoost));
    // A dark image changes hue, not whether the projector lamp exists.
    const brightest = Math.max(targetColor.r, targetColor.g, targetColor.b);
    if (brightest > .0001 && brightest < .45) targetColor.multiplyScalar(.45 / brightest);
    sampledColor.copy(targetColor);
    targetColor.copy(neutralBeamColor).lerp(sampledColor, artworkPresence);
    // Fast enough to follow each title edge, but eased so colour never flashes between frames.
    beamColor.lerp(targetColor, motion.matches || dt === 0 ? 1 : 1 - Math.exp(-dt * 12));
    if (bandCoverage > .00001) targetBands.multiplyScalar(1 / bandCoverage).lerp(neutralBands, 1 - artworkPresence);
    else targetBands.copy(neutralBands);
    imageBands.value.lerp(targetBands, motion.matches || dt === 0 ? 1 : 1 - Math.exp(-dt * 3));
    const energy = (imageBands.value.x + imageBands.value.y + imageBands.value.z + imageBands.value.w) * .25;
    const lampShimmer = 1 + renderedControls.rayMotion * (.035 * Math.sin(time * 3.1) + .025 * Math.sin(time * 7.3 + 1.2));
    contactStrength.value = renderedControls.rayIntensity * (.62 + renderedControls.bloom * .68) * (.66 + energy * .34) * lampShimmer;
    surfaceReflection.value = renderedControls.surfaceReflection;
    // The projector stays on the chosen side, independent of the rotating slots.
    // Changing the focus aims the beam; it never carries the projector around with the slot.
    const sourceZ = Math.max(4, anchor.z + 3);
    const halfView = (camera.position.z - sourceZ) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (!motion.matches && !paused) updateRays(dt); else if (firstRays) updateRays(0);
    firstRays = false;
    // The projector itself always lives beyond the visible canvas. Visitors see light entering
    // from the screen edge, never an apex floating in the mobile or desktop composition.
    const sourceLift = (renderedControls.rayLength - DISC_DEFAULTS.rayLength) * .025
      + (renderedControls.rayElevation - DISC_DEFAULTS.rayElevation) * .025;
    const origin = glassProjectorOrigin(width, side, renderedControls.originX,
      renderedControls.originY - sourceLift, beamOriginXFraction, beamOriginYFraction ?? -.09);
    source.set((origin.x - .5) * halfView * camera.aspect * 2, (.5 - origin.y) * halfView * 2, sourceZ);
    // A lamp behind the disc could not light its face: keep the source on the lit side.
    discNormal.set(0, 0, 1).transformDirection(projectorFrame);
    sourceLocal.value.copy(source).applyMatrix4(projectorTransform.value);
    if (sourceLocal.value.z < .18) {
      source.addScaledVector(discNormal, (.18 - sourceLocal.value.z) * tilt.scale.x);
      sourceLocal.value.copy(source).applyMatrix4(projectorTransform.value);
    }
    originGuide.visible = landingGuide.visible = aimGuides;
    if (aimGuides) {
      originGuide.position.copy(source); landingGuide.position.copy(anchor);
      originGuide.quaternion.copy(camera.quaternion); landingGuide.quaternion.copy(camera.quaternion);
    }
    // The hull is larger than the window so the light's soft edge fades out before reaching it.
    // A slightly broader coloured fan reaches the reflection centre; the shader keeps its
    // neutral core thin so widening the beam does not create a thick white hotspot.
    const hullX = (projection.outer - projection.inner) * .5 * .5, hullWidth = 1.5;
    localCorners[0].set((projection.inner - hullX) * R, -projection.innerHalfWidth * hullWidth * R, BEAM_PLANE);
    localCorners[1].set((projection.outer + hullX) * R, -projection.outerHalfWidth * hullWidth * R, BEAM_PLANE);
    localCorners[2].set((projection.outer + hullX) * R, projection.outerHalfWidth * hullWidth * R, BEAM_PLANE);
    localCorners[3].set((projection.inner - hullX) * R, projection.innerHalfWidth * hullWidth * R, BEAM_PLANE);
    localCorners.forEach((corner, i) => {
      corners[i].copy(corner).applyMatrix4(projectorFrame);
      const next = localCorners[(i + 1) % 4];
      beamPlanes.value[i].copy(planeA.subVectors(next, corner).cross(planeB.subVectors(sourceLocal.value, corner))).normalize();
    });
    hullFace.forEach((vertex, i) => {
      const point = vertex === 4 ? source : corners[vertex];
      beamPositions.setXYZ(i, point.x, point.y, point.z);
    });
    beamPositions.needsUpdate = true;
    // The projector remains on between titles. Only the artwork focus fades, never the light.
    fanMaterial.uniforms.power.value = renderedControls.rayIntensity;
    beamGlow.value = renderedControls.beamGlow; rayStrength.value = renderedControls.rayStrength;
    beamTime.value = time;
    beamMotion.value = renderedControls.rayMotion;
    fanMaterial.uniforms.prism.value = renderedControls.rayPrism;
    fanMaterial.uniforms.rayStyle.value = controls.rayStyle;
    saturation.value = renderedControls.desaturation; bloom.strength = renderedControls.bloom; bloom.enabled = renderedControls.bloom > .001;
    bloom.radius = renderedControls.glowRadius; bloom.threshold = renderedControls.glowThreshold;
    composer.render();
  }
  function tick(now: number) {
    raf = 0; if (destroyed || !active || document.hidden) return;
    const frameMs = last ? now - last : 0;
    const delta = Math.min(0.1, frameMs / 1000); last = now; elapsed += delta;
    // 30fps on coarse/low-core devices, 60fps otherwise; all movement is time-based.
    if (elapsed >= 1 / (lowPower ? 30 : 60) || delta === 0) {
      const start = performance.now(); draw(elapsed); elapsed = 0;
      if (performance.now() - start > 28 || frameMs > (lowPower ? 65 : 45)) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && quality > 0.65) { quality = Math.max(0.65, quality * 0.8); slowFrames = 0; resize(width, height); }
    }
    if (!raf && !motion.matches && (controlsSettling || hoverSettling || (!paused && (arrival < 1 || controls.spinSpeed !== 0 || (controls.rayMotion > 0 && controls.rayIntensity > 0))))) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!destroyed && active && !document.hidden && !raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; elapsed = 0; }
  const visibility = () => { if (document.hidden) stop(); else wake(); };
  const changeMotion = () => { stop(); wake(); };
  const lost = (event: Event) => { event.preventDefault(); stop(); onError?.(); };
  document.addEventListener("visibilitychange", visibility); motion.addEventListener("change", changeMotion);
  canvas.addEventListener("webglcontextlost", lost);
  const unbindDrag = bindCircleDrag(canvas, {
    begin(x, y) {
      if (destroyed || !active || firstPose || opened >= 0) return false;
      const angle = pointerAngle(x, y, true);
      if (angle === null) return false;
      dragging = true; dragAngle = angle; spinBlend = 0; hovered = -1;
      wake(); return true;
    },
    move(x, y) {
      if (!dragging) return;
      const angle = pointerAngle(x, y);
      if (angle === null) return;
      const delta = angle - dragAngle;
      // Unwrap the -PI/PI seam so reversing direction never jumps a full revolution.
      disc.rotation.z = (disc.rotation.z + Math.atan2(Math.sin(delta), Math.cos(delta))) % TAU;
      dragAngle = angle; tilt.updateMatrixWorld(true); wake();
    },
    end() { dragging = false; spinBlend = 0; wake(); },
  });
  setImages(initial);
  return {
    controls, resize,
    setImages,
    setScrollProgress(value: number) {
      const next = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
      if (Math.abs(next - scrollExit) < .001) return;
      scrollExit = next; wake();
    },
    setBeamOrigin(xFraction: number | null, yFraction: number) {
      beamOriginXFraction = typeof xFraction === "number" && Number.isFinite(xFraction) ? xFraction : null;
      beamOriginYFraction = Number.isFinite(yFraction) ? yFraction : null;
      wake();
    },
    setAimGuides(value: boolean) {
      aimGuides = value;
      originGuide.visible = landingGuide.visible = value;
      wake();
    },
    setActive(value: boolean) { active = value; if (value) wake(); else stop(); },
    setPaused(value: boolean) {
      if (paused === value) return;
      paused = value;
      if (!value) spinBlend = 0;
      stop(); wake();
    },
    canDrag(x: number, y: number) { return !firstPose && opened < 0 && pointerAngle(x, y, true) !== null; },
    setHover(index: number) { if (opened >= 0 || dragging) return; const next = index >= 0 && index < slots.length ? index : -1; if (hovered !== next) { hovered = next; wake(); } },
    setOpen(index: number) { opened = index >= 0 && index < slots.length ? index : -1; hovered = -1; wake(); },
    invalidate: wake,
    hit(x: number, y: number) {
      pointer.set(x / width * 2 - 1, 1 - y / height * 2); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(slots.filter(s => s.image.visible).map(s => s.image), false)[0];
      if (hit) return slots.findIndex(s => s.image === hit.object);
      // Keep the original footprint hittable while it lifts away from the pointer.
      // This prevents hover flicker without leaving a card selected over empty canvas.
      if (hovered >= 0 && slots[hovered]?.image.visible && restRay.copy(raycaster.ray).applyMatrix4(inverseDisc).intersectPlane(restPlane, restHit)) {
        const angle = slots[hovered].angle, c = Math.cos(angle), s = Math.sin(angle);
        const center = (layout.inner + layout.outer) / 2;
        const x = (restHit.x * c + restHit.y * s) / R - center;
        const y = (-restHit.x * s + restHit.y * c) / R;
        const rotation = slots[hovered].image.rotation.z, rc = Math.cos(rotation), rs = Math.sin(rotation);
        const radial = center + (x * rc + y * rs) / slots[hovered].titleScale;
        const tangent = (-x * rs + y * rc) / slots[hovered].titleScale;
        const fraction = (radial - layout.inner) / (layout.outer - layout.inner);
        if (fraction >= 0 && fraction <= 1 && Math.abs(tangent) <= layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * fraction) return hovered;
      }
      return -1;
    },
    dispose() {
      if (destroyed) return;
      destroyed = true; unbindDrag(); stop(); clearSlots();
      document.removeEventListener("visibilitychange", visibility); motion.removeEventListener("change", changeMotion);
      canvas.removeEventListener("webglcontextlost", lost);
      renderPass.dispose(); bloom.dispose(); output.dispose(); antialias.dispose(); composer.dispose();
      owned.forEach(v => v.dispose()); renderer.dispose();
      // React may reuse the canvas during Strict Mode / hot reload. Do not poison that context.
      if (!canvas.isConnected) renderer.forceContextLoss();
      averageCanvas.width = averageCanvas.height = 0;
    },
  };
}

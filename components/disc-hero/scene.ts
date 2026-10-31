import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { DISC_DEFAULTS, sanitizeDisc, discPanelLayout, discProjectionWindow, discProjectionCoverage, discImageColour, discImageBands, visibleDiscItems, type DiscControls } from "../../lib/content/disc";

export type DiscImage = { src: string; label: string; tint?: string };
export type DiscScene = ReturnType<typeof createDiscScene>;
const TAU = Math.PI * 2;
const R = 2.35;
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
  float beamBody(vec2 p){ float r=length(max(abs(p)-.42,0.))+.42; return 1.-smoothstep(.5,1.36,r); }`;
// Surface-space reflection, not a floating sprite or a glowing slot outline.
const contactShader = `float contactReflection(vec2 p,float shafts){
    float radius=max(abs(p.x),abs(p.y));
    // A physically plausible landing: a wide low-energy pool scattered by glass and brushed
    // metal, with each ray's own bright footprint inside it.
    float spread=mix(1.05,1.45,projectorSoftness);
    float edge=1.-smoothstep(spread*.72,spread,radius);
    float pool=exp(-dot(p*vec2(1.2,1.35),p*vec2(1.2,1.35)));
    float soft=exp(-dot(p*vec2(2.6,2.3),p*vec2(2.6,2.3)));
    return (pool*.17+soft*.2+shafts*pool*.8)*edge*contactStrength;
  }
  // Silver diffracts a highlight along the radius facing the lamp, the streak a real disc shows.
  vec3 discStreak(vec2 point){
    float angle=atan(point.y,point.x), radius=length(point);
    float streak=exp(-angle*angle*42.)+.35*exp(-angle*angle*7.);
    vec3 spectrum=.5+.5*cos(6.28318*(radius*3.4+angle*1.5+vec3(0.,.33,.67)));
    return mix(vec3(1.),spectrum*1.3,contactPrism*.35)*streak*contactStrength*.075;
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
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
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 35);
  camera.position.set(0, 0, 9.8);
  camera.lookAt(0, 0, 0);
  const tilt = new THREE.Group(); tilt.position.x = -0.6; scene.add(tilt);
  const disc = new THREE.Group(); tilt.add(disc);
  const owned = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(v: T): T => { owned.add(v); return v; };
  let destroyed = false, active = false, paused = false, raf = 0, last = 0, elapsed = 0, firstPose = true;
  let width = 1, height = 1, quality = 1, slowFrames = 0, time = 0, hovered = -1, opened = -1, hoverSettling = false;
  let beamOriginFraction: number | null = null;
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
  const beamColor = new THREE.Color(0x808080), targetColor = new THREE.Color();
  const imageBands = { value: new THREE.Vector4(.55, .55, .55, .55) };
  const targetBands = new THREE.Vector4();
  const contactColour = { value: beamColor }, contactStrength = { value: 0 }, contactPrism = { value: controls.rayPrism };
  // Few rays and few volume steps: this runs per covered pixel, so phones get the smaller budget.
  const rayCount = lowPower ? 5 : 7, beamSteps = lowPower ? 4 : 6, moteCount = lowPower ? 26 : 60;
  const raysUniform = { value: Array.from({ length: rayCount }, () => new THREE.Vector4(0, 0, .3, 0)) };
  const rayShaderSource = rayShader(rayCount);
  const studioLights: { light: THREE.Light; base: number }[] = [];

  // Fixed studio strips are baked once into a small environment, never captured every frame.
  RectAreaLightUniformsLib.init();
  const room = new THREE.Scene(); room.background = new THREE.Color(0x454b54);
  for (const [x, y, z, w, h, intensity] of [[-3, 3, 4, 1.1, 6, 8], [3, 0, 2, 0.4, 5, 5], [0, -4, 3, 6, 0.3, 3]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) }));
    strip.position.set(x, y, z); strip.lookAt(0, 0, 0); room.add(strip);
    const light = new THREE.RectAreaLight(0xf3f6ff, intensity * 2, w, h);
    light.position.copy(strip.position); light.quaternion.copy(strip.quaternion); scene.add(light);
    studioLights.push({ light, base: light.intensity });
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = own(pmrem.fromScene(room, 0.04, 0.1, 30, { size: 128 }));
  scene.environment = env.texture;
  pmrem.dispose();
  room.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); obj.material.dispose(); } });
  const ambient = new THREE.HemisphereLight(0xdbe4ff, 0x161821, 1.4); scene.add(ambient);
  studioLights.push({ light: ambient, base: ambient.intensity });

  // Radial anisotropy + fine angular roughness streaks. Only one 256² procedural texture.
  const data = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = Math.atan2(y - 127.5, x - 127.5), i = (y * 256 + x) * 4;
    data[i] = (Math.cos(a) * 0.5 + 0.5) * 255;
    data[i + 1] = (Math.sin(a) * 0.5 + 0.5) * 255;
    data[i + 2] = 210 + Math.sin(a * 291) * 35; data[i + 3] = 255;
  }
  const brushed = own(new THREE.DataTexture(data, 256, 256));
  brushed.minFilter = brushed.magFilter = THREE.LinearFilter; brushed.needsUpdate = true;
  const silver = own(new THREE.MeshPhysicalMaterial({ color: 0xcbd0d5, metalness: 1, roughness: 0.25, iridescence: 1,
    iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 360], anisotropy: 0.85, anisotropyMap: brushed, side: THREE.DoubleSide }));
  silver.onBeforeCompile = shader => {
    shader.uniforms.uDesaturation = saturation;
    Object.assign(shader.uniforms, { projectorTransform, projectorBounds, projectorSoftness, contactColour, contactStrength, contactPrism, rays: raysUniform });
    shader.vertexShader = `uniform mat4 projectorTransform; varying vec2 vDiscProjector; varying vec3 vDiscLocal;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDiscLocal=position; vDiscProjector=(projectorTransform*modelMatrix*vec4(position,1.)).xy/2.35;");
    shader.fragmentShader = `uniform float uDesaturation, contactStrength, contactPrism, projectorSoftness; uniform vec3 contactColour; uniform vec4 projectorBounds; varying vec2 vDiscProjector; varying vec3 vDiscLocal; ${rayShaderSource} ${contactShader}\n${shader.fragmentShader}`
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        float angle=atan(vDiscLocal.y,vDiscLocal.x);
        roughnessFactor *= .9+.1*sin(angle*291.)*sin(angle*113.)*exp(-fwidth(angle)*291.);`)
      .replace("#include <opaque_fragment>", `
        float rim=pow(clamp(1.-abs(dot(normal,geometryViewDir)),0.,1.),3.);
        float edge=smoothstep(2.28,2.35,length(vDiscLocal.xy));
        outgoingLight=outgoingLight*.38+vec3(.04)*rim*edge;
        outgoingLight=mix(outgoingLight,vec3(dot(outgoingLight,vec3(.2126,.7152,.0722))),uDesaturation);
        // Retain the artwork hue in the wide reflection; only the specular response adds white.
        vec2 lightWindow=discWindow(vDiscProjector);
        outgoingLight+=(mix(contactColour,vec3(1.),.28)*contactReflection(lightWindow,rayField(lightWindow))+discStreak(vDiscProjector))*float(gl_FrontFacing);
        #include <opaque_fragment>`);
  };
  disc.add(new THREE.Mesh(own(new THREE.RingGeometry(R * 0.22, R, 128, 2)), silver));
  // Three attached, closed layers share one bevelled geometry/material. The centre stays hollow.
  const shell = new THREE.Shape(); shell.absarc(0, 0, R - .014, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, R * .22 + .014, 0, TAU, true); shell.holes.push(hole);
  const layerGeometry = own(new THREE.ExtrudeGeometry(shell, { depth: .058, bevelEnabled: true,
    bevelSize: .012, bevelThickness: .009, bevelSegments: 1, steps: 1, curveSegments: 64 }));
  const backing = own(new THREE.MeshStandardMaterial({ color: 0x89939e, metalness: 1, roughness: .28, envMapIntensity: .7 }));
  backing.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { projectorTransform, contactStrength, contactPrism });
    shader.vertexShader = `uniform mat4 projectorTransform; varying vec2 vDiscProjector;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDiscProjector=(projectorTransform*modelMatrix*vec4(position,1.)).xy/2.35;");
    shader.fragmentShader = `uniform float contactStrength, contactPrism; varying vec2 vDiscProjector;\n${contactShader.slice(contactShader.indexOf("vec3 discStreak"))}\n${shader.fragmentShader}`
      .replace("#include <opaque_fragment>", "outgoingLight+=discStreak(vDiscProjector)*.55;\n#include <opaque_fragment>");
  };
  for (let layer = 0; layer < 3; layer++) {
    const mesh = new THREE.Mesh(layerGeometry, backing); mesh.position.z = -.068 * (layer + 1); disc.add(mesh);
  }
  const edgeMaterial = own(new THREE.MeshBasicMaterial({ color: 0xb2bcc8, transparent: true, opacity: 0.22 }));
  for (const radius of [R, R * 0.22, R * 0.27, R * 0.3]) {
    disc.add(new THREE.Mesh(own(new THREE.TorusGeometry(radius, radius === R ? 0.012 : 0.004, 4, 192)), edgeMaterial));
  }

  const glass = own(new THREE.MeshPhysicalMaterial({ color: 0xdde5f2, transmission: 0.9, roughness: 0.1, thickness: 0.025,
    ior: 1.45, metalness: 0, clearcoat: 0.1, envMapIntensity: 0.35, side: THREE.FrontSide, depthWrite: false }));
  const border = own(new THREE.LineBasicMaterial({ color: 0xcbd8ef, transparent: true, opacity: 0.18 }));
  type Slot = { group: THREE.Group; image: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; texture: THREE.CanvasTexture;
    average: THREE.Color; bands: THREE.Vector4; angle: number; weight: number; lift: number; tintMaterial?: THREE.MeshPhysicalMaterial };
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
      s.texture.dispose(); s.image.material.dispose(); s.tintMaterial?.dispose();
      s.texture.image.width = s.texture.image.height = 0;
    }
    geometries.forEach(g => g.dispose()); geometries.length = 0;
    panels.clear(); slots = []; hovered = opened = -1;
  }
  function updateGap() {
    // A spacing slider must not re-fetch/re-decode every image on each pointer move.
    const old = geometries.splice(0);
    layout = discPanelLayout(slots.length, controls.slotGap, controls.slotSize);
    const panelGeometry = plaque(layout);
    const imageGeometry = plaque(layout, 0.008);
    const edges = new THREE.EdgesGeometry(panelGeometry, 20);
    geometries.push(panelGeometry, imageGeometry, edges);
    for (const slot of slots) {
      slot.image.geometry = imageGeometry;
      slot.image.material.uniforms.panelAspect.value = layout.aspect;
      (slot.group.children[1] as THREE.Mesh).geometry = panelGeometry;
      (slot.group.children[2] as THREE.LineSegments).geometry = edges;
    }
    old.forEach(g => g.dispose());
  }
  function setImages(images: DiscImage[]) {
    images = visibleDiscItems(images);
    clearSlots();
    const gen = generation, signal = loader.signal;
    layout = discPanelLayout(images.length, controls.slotGap, controls.slotSize);
    const { step } = layout;
    const panelGeometry = plaque(layout);
    const imageGeometry = plaque(layout, 0.008);
    const edges = new THREE.EdgesGeometry(panelGeometry, 20);
    geometries.push(panelGeometry, imageGeometry, edges);
    // Aggregate CPU/GPU texture budget is bounded as the slot count grows.
    const size = 2 ** Math.floor(Math.log2(Math.max(64, Math.min(lowPower ? 512 : 1024, Math.sqrt(4_194_304 / Math.max(1, images.length))))));
    images.forEach((item, i) => {
      const thumb = document.createElement("canvas"); thumb.width = size; thumb.height = size;
      const ctx = thumb.getContext("2d")!;
      ctx.fillStyle = "#131923"; ctx.fillRect(0, 0, size, size);
      const texture = new THREE.CanvasTexture(thumb); texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.ShaderMaterial({ transparent: true, uniforms: { map: { value: texture },
        imageSaturation, vibrance, imageOpacity, blur, dimBrightness, slotGlow,
        imageAspect: { value: 1 }, panelAspect: { value: layout.aspect }, rear: { value: 0 }, hover: { value: 0 },
        projectorTransform, projectorBounds, projectorSoftness, projectorPower, contactColour, contactStrength, rays: raysUniform },
        vertexShader: `uniform mat4 projectorTransform; varying vec2 vProjector; varying vec2 vUv;
          void main(){ vec4 world=modelMatrix*vec4(position,1.);
            vProjector=(projectorTransform*world).xy/2.35;
            vUv=uv; gl_Position=projectionMatrix*viewMatrix*world; }`,
        fragmentShader: `uniform sampler2D map;
        uniform float imageSaturation, vibrance, imageOpacity, blur, dimBrightness, slotGlow, projectorSoftness, projectorPower, contactStrength, rear, hover, imageAspect, panelAspect;
        uniform vec3 contactColour;
        uniform vec4 projectorBounds; varying vec2 vProjector; varying vec2 vUv;
        ${rayShaderSource}
        ${contactShader.slice(0, contactShader.indexOf("// Silver diffracts"))}
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
          vec3 c=tex.rgb;
          float grey=dot(c,vec3(.2126,.7152,.0722));
          float chroma=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
          c=max(vec3(0.),mix(vec3(grey),c,imageSaturation*(1.+vibrance*(1.-chroma))));
          // Emission comes from the artwork itself, only where the fixed projector window overlaps it.
          vec2 lightWindow=discWindow(vProjector);
          float shafts=rayField(lightWindow);
          // Rays visibly travel across the print: lit where one lands, a little dimmer between them.
          c=mix(vec3(grey)*dimBrightness,c*(1.+slotGlow*.65)*(.84+shafts*.6),focus);
          c=mix(c,tex.rgb,hover*.85);
          c=mix(vec3(.012),c,tex.a);
          // Extract the visible title ink from the uploaded artwork. There is deliberately no
          // baseline card emission: only bright/coloured title pixels cross the bloom threshold.
          float sourcePeak=max(tex.r,max(tex.g,tex.b));
          float titleInk=smoothstep(.1,.58,sourcePeak)*tex.a;
          vec3 titlePigment=tex.rgb/max(sourcePeak,.12);
          vec3 titleLight=mix(contactColour,titlePigment,.68);
          float titleGlow=titleInk*focus*(1.-hover)*(.18+.34*shafts)
            *contactReflection(lightWindow,shafts);
          c+=titleLight*titleGlow*(.9+slotGlow*.45);
          gl_FragColor=vec4(c,imageOpacity); }` });
      const group = new THREE.Group(); group.rotation.z = i * step; panels.add(group);
      // The print sits just inside the raised glass edge; refraction must not wash out its lettering.
      const image = new THREE.Mesh(imageGeometry, material); image.position.z = 0.039; group.add(image);
      const tintMaterial = item.tint ? glass.clone() : undefined;
      if (tintMaterial) tintMaterial.color.set(item.tint!);
      const pane = new THREE.Mesh(panelGeometry, tintMaterial ?? glass); pane.position.z = 0.037; group.add(pane);
      const outline = new THREE.LineSegments(edges, border); outline.position.z = 0.041; group.add(outline);
      slots.push({ group, image, texture, average: new THREE.Color(0x808080), bands: new THREE.Vector4(.55,.55,.55,.55), angle: i * step, weight: 0, lift: 0, tintMaterial });
    });
    // Decode one image at a time. Failed/CORS-blocked images retain a labelled placeholder.
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
          const release = () => { if (bitmap instanceof ImageBitmap) bitmap.close(); else bitmap.src = ""; };
          if (destroyed || gen !== generation) { release(); return; }
          const slot = slots[i], thumb = slot.texture.image as HTMLCanvasElement, ctx = thumb.getContext("2d")!;
          const scale = Math.min(size / bitmap.width, size / bitmap.height);
          thumb.width = Math.max(1, Math.round(bitmap.width * scale)); thumb.height = Math.max(1, Math.round(bitmap.height * scale));
          ctx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
          averageContext.clearRect(0, 0, 24, 24); averageContext.drawImage(bitmap, 0, 0, 24, 24);
          const pixels = averageContext.getImageData(0, 0, 24, 24).data;
          const [r, g, b] = discImageColour(pixels);
          slot.bands.fromArray(discImageBands(pixels, 24));
          slot.average.setRGB(r, g, b, THREE.SRGBColorSpace);
          // WebGL textures cannot change size after first upload; replace and release the placeholder.
          const texture = new THREE.CanvasTexture(thumb); texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          slot.texture.dispose(); slot.texture = texture; slot.image.material.uniforms.map.value = texture;
          slot.image.material.uniforms.imageAspect.value = bitmap.width / bitmap.height;
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
  // One convex hull, shaded once per pixel on its far side. Each pixel marches its view ray through
  // the cone, so the light has real depth and ends exactly on the disc plane instead of on a flat edge.
  const fanMaterial = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: beamColor }, power: { value: 0 }, time: beamTime, motion: beamMotion, prism: { value: controls.rayPrism }, rayStyle: { value: controls.rayStyle }, viewport: { value: new THREE.Vector2(1, 1) },
      projectorTransform, projectorBounds, sourceLocal, beamPlanes, beamGlow, rayStrength, rays: raysUniform, smokeTexture: { value: smokeTexture } },
    vertexShader: `uniform mat4 projectorTransform; varying vec3 vLocal, vCamera;
      void main(){ vec4 world=modelMatrix*vec4(position,1.);
        vLocal=(projectorTransform*world).xyz; vCamera=(projectorTransform*vec4(cameraPosition,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `#define BEAM_STEPS ${beamSteps}
      uniform vec3 tint, sourceLocal, beamPlanes[4]; uniform vec4 projectorBounds; uniform float power, prism, rayStyle, time, motion, beamGlow, rayStrength; uniform vec2 viewport; uniform sampler2D smokeTexture; varying vec3 vLocal, vCamera;
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
          // Hidden near the lens; thickest close to it; a little extra where light bounces off the disc.
          float reach=smoothstep(.02,.3,along)*mix(1.25,1.,along)+exp(-(1.-along)*18.)*.35;
          float density=body*reach*((.05+smoke*smoke*.2)*beamGlow+shafts*(.9+smoke*1.1)*rayStrength);
          scatter+=density; bodySum+=body*reach*(1.-smoothstep(0.,.45,length(p)));
          meanWindow+=p*density; meanWeight+=density;
        }
        scatter*=span/float(BEAM_STEPS); bodySum*=span/float(BEAM_STEPS);
        vec2 p=meanWindow/meanWeight;
        float prismatic=step(.5,rayStyle)*(1.-step(1.5,rayStyle));
        float luminance=dot(tint,vec3(.2126,.7152,.0722));
        vec3 spectrum=.5+.5*cos(6.28318*(p.y*.42+p.x*.14+vec3(0.,.33,.67)));
        // Dispersion modulates the artwork's colour instead of replacing it with a rainbow.
        vec3 colour=tint*mix(vec3(1.8),vec3(.9)+spectrum*1.8,prism*prismatic*.45);
        // The haze carries the artwork pigment; the lamp's neutral core stays narrow.
        colour=mix(colour,vec3(max(.32,luminance)*1.55),clamp(bodySum*.1,0.,.4));
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
    const amount = controls.rayMotion, style = controls.rayStyle;
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
    uniforms: { tint: { value: beamColor }, time: beamTime, motion: beamMotion, power: fanMaterial.uniforms.power, viewport: fanMaterial.uniforms.viewport, projectorBounds, sourceLocal, projectorFrame: { value: projectorFrame }, rays: raysUniform },
    vertexShader: `attribute vec4 seed; uniform float time, motion, power; uniform vec2 viewport; uniform vec3 sourceLocal; uniform vec4 projectorBounds; uniform mat4 projectorFrame; varying float vLight;
      ${rayShaderSource}
      void main(){
        float phase=seed.z+time*(.006+.012*seed.w)*motion;
        float along=mix(.18,.97,fract(phase));
        vec2 p=(seed.xy*2.-1.)*.95+.06*motion*vec2(sin(time*.31+seed.z*40.),cos(time*.27+seed.w*40.));
        float halfWidth=mix(projectorBounds.z,projectorBounds.w,p.x*.5+.5);
        vec3 landing=vec3((mix(projectorBounds.x,projectorBounds.y,p.x*.5+.5))*2.35,p.y*halfWidth*2.35,${BEAM_PLANE.toFixed(3)});
        vec4 world=projectorFrame*vec4(mix(sourceLocal,landing,along),1.);
        float twinkle=.55+.45*sin(time*(1.1+seed.w*2.3)*motion+seed.x*60.);
        vLight=beamBody(p)*(.1+rayField(p)*1.3)*twinkle*power*smoothstep(0.,.1,fract(phase))*(1.-smoothstep(.88,1.,fract(phase)));
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
  const output = new OutputPass(), antialias = new ShaderPass(FXAAShader);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(antialias);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const restRay = new THREE.Ray(), restHit = new THREE.Vector3();
  const restPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.02);
  const slotCenter = new THREE.Vector3();
  const restPosition = new THREE.Vector3(), openPosition = new THREE.Vector3();
  const inverseDisc = new THREE.Matrix4();
  const faceCamera = new THREE.Quaternion(), restRotation = new THREE.Quaternion();
  function resize(w: number, h: number) {
    width = Math.max(1, w); height = Math.max(1, h);
    // Cap total framebuffer pixels as well as DPR; Retina desktops otherwise create huge bloom buffers.
    const dpr = Math.min(2, devicePixelRatio || 1, Math.sqrt((lowPower ? 800_000 : 1_600_000) / (width * height))) * quality;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr); composer.setSize(width, height);
    fanMaterial.uniforms.viewport.value.set(Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)));
    antialias.uniforms.resolution.value.set(1 / Math.max(1, Math.floor(width * dpr)), 1 / Math.max(1, Math.floor(height * dpr)));
    camera.aspect = width / height;
    // Fit the entire tilted disc plus its left offset in narrow portrait viewports.
    camera.position.z = Math.max(8.7, 6.5 / camera.aspect); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); wake();
  }
  function draw(dt: number) {
    if (lastGap !== controls.slotGap || lastSize !== controls.slotSize) { lastGap = controls.slotGap; lastSize = controls.slotSize; updateGap(); }
    imageSaturation.value = controls.saturation; vibrance.value = controls.vibrance;
    imageOpacity.value = controls.slotOpacity; blur.value = controls.slotBlur; dimBrightness.value = controls.unfocusedBrightness;
    slotGlow.value = controls.bloom * controls.rayIntensity;
    projectorSoftness.value = controls.glowRadius; projectorPower.value = controls.rayIntensity;
    studioLights.forEach(({ light, base }) => { light.intensity = base * controls.lightIntensity; });
    scene.environmentIntensity = controls.lightIntensity;
    const side = controls.projectorSide;
    // Centre narrow screens; gently offset on wide layouts to leave the heading readable.
    tilt.position.x = -side * 1.15 * THREE.MathUtils.smoothstep(camera.aspect, 1.35, 1.9);
    tilt.rotation.set(THREE.MathUtils.degToRad(controls.discTilt), 0, THREE.MathUtils.degToRad(controls.discRoll * side), "ZYX");
    if (!motion.matches && !paused && opened < 0) {
      time += dt;
      // Hold the selected plaque still while inspecting it; the projector continues moving softly.
      if (hovered < 0 && !hoverSettling) disc.rotation.z = (disc.rotation.z + controls.spinSpeed * dt) % TAU;
    }
    tilt.updateMatrixWorld(true);
    const focus = THREE.MathUtils.degToRad(controls.focusAngle), dx = Math.cos(focus), dy = Math.sin(focus);
    const m = tilt.matrixWorld.elements, det = m[0] * m[5] - m[1] * m[4];
    const localFocus = Math.atan2((m[0] * dy - m[1] * dx) / det, (m[5] * dx - m[4] * dy) / det);
    // The still/reduced-motion view should also begin with a title under the projector.
    if (firstPose) { firstPose = false; disc.rotation.z = localFocus; tilt.updateMatrixWorld(true); }
    if (projectionLayout !== layout || projectionRadius !== controls.focusRadius || projectionSpread !== controls.raySpread) {
      projectionLayout = layout; projectionRadius = controls.focusRadius; projectionSpread = controls.raySpread;
      projection = discProjectionWindow(layout, projectionRadius, projectionSpread);
    }
    projectorFrame.makeRotationZ(localFocus).premultiply(tilt.matrixWorld);
    projectorTransform.value.copy(projectorFrame).invert();
    projectorBounds.value.set(projection.inner, projection.outer, projection.innerHalfWidth, projection.outerHalfWidth);
    anchor.set(Math.cos(localFocus) * R * projection.center, Math.sin(localFocus) * R * projection.center, 0.06);
    tilt.localToWorld(anchor);
    let coverage = 0;
    targetColor.setRGB(0, 0, 0);
    targetBands.set(0, 0, 0, 0);
    inverseDisc.copy(disc.matrixWorld).invert();
    disc.getWorldQuaternion(faceCamera).invert().multiply(camera.quaternion);
    const panelCenter = (layout.inner + layout.outer) * R / 2;
    const openScale = 1.45, openZ = 2.6;
    const openView = (camera.position.z - openZ) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const marginX = Math.max(.05, openView * camera.aspect - (layout.outer - layout.inner) * R / 2 * openScale - .15);
    const marginY = Math.max(.05, openView - layout.outerHalfWidth * R * openScale - .32);
    hoverSettling = false;
    for (let index = 0; index < slots.length; index++) {
      // Hover only lifts a little. Clicking opens fully and holds the scene for the detail card.
      const slot = slots[index], desired = index === opened ? 1 : index === hovered ? .16 : 0;
      slot.lift = motion.matches ? desired : THREE.MathUtils.damp(slot.lift, desired, 9, dt);
      if (Math.abs(slot.lift - desired) < .001) slot.lift = desired; else hoverSettling = true;
      restPosition.set(Math.cos(slot.angle) * panelCenter, Math.sin(slot.angle) * panelCenter, 0);
      openPosition.copy(restPosition).applyMatrix4(disc.matrixWorld);
      openPosition.set(THREE.MathUtils.clamp(openPosition.x, -marginX, marginX),
        THREE.MathUtils.clamp(openPosition.y, -marginY, marginY), openZ).applyMatrix4(inverseDisc);
      slot.group.position.copy(restPosition).lerp(openPosition, slot.lift);
      restRotation.setFromAxisAngle(projectionAxis, slot.angle);
      slot.group.quaternion.copy(restRotation).slerp(faceCamera, slot.lift);
      slot.group.scale.setScalar(1 + (openScale - 1) * slot.lift);
      slot.group.updateMatrixWorld(true);
      slotCenter.set(0, 0, 0).applyMatrix4(slot.group.matrixWorld);
      slot.image.material.uniforms.rear.value = THREE.MathUtils.smoothstep(-slotCenter.z / R, .1, .75);
      slot.image.material.uniforms.hover.value = Math.min(1, slot.lift * 3);
      slot.weight = discProjectionCoverage(layout, projection, slot.angle + disc.rotation.z - localFocus, controls.glowRadius);
      coverage += slot.weight;
      targetColor.r += slot.average.r * slot.weight;
      targetColor.g += slot.average.g * slot.weight;
      targetColor.b += slot.average.b * slot.weight;
      targetBands.addScaledVector(slot.bands, slot.weight);
    }
    if (coverage > .00001) targetColor.multiplyScalar(1 / coverage); else targetColor.copy(beamColor);
    const luminance = targetColor.r * 0.2126 + targetColor.g * 0.7152 + targetColor.b * 0.0722;
    const chroma = Math.max(targetColor.r, targetColor.g, targetColor.b) - Math.min(targetColor.r, targetColor.g, targetColor.b);
    const colourBoost = coverage > .00001 ? controls.saturation * (1 + controls.vibrance * (1 - chroma)) : 1;
    targetColor.setRGB(Math.max(0, luminance + (targetColor.r - luminance) * colourBoost),
      Math.max(0, luminance + (targetColor.g - luminance) * colourBoost), Math.max(0, luminance + (targetColor.b - luminance) * colourBoost));
    // A dark image changes hue, not whether the projector lamp exists.
    const brightest = Math.max(targetColor.r, targetColor.g, targetColor.b);
    if (brightest > .0001 && brightest < .45) targetColor.multiplyScalar(.45 / brightest);
    beamColor.lerp(targetColor, motion.matches || dt === 0 ? 1 : 1 - Math.exp(-dt * 4));
    if (coverage > .00001) targetBands.multiplyScalar(1 / coverage); else targetBands.copy(imageBands.value);
    imageBands.value.lerp(targetBands, motion.matches || dt === 0 ? 1 : 1 - Math.exp(-dt * 3));
    const energy = (imageBands.value.x + imageBands.value.y + imageBands.value.z + imageBands.value.w) * .25;
    const lampShimmer = 1 + controls.rayMotion * (.035 * Math.sin(time * 3.1) + .025 * Math.sin(time * 7.3 + 1.2));
    contactStrength.value = controls.rayIntensity * (.62 + controls.bloom * .68) * (.66 + energy * .34) * lampShimmer * controls.surfaceReflection;
    contactPrism.value = controls.rayStyle === 1 ? controls.rayPrism : controls.rayPrism * .35;
    // The projector stays on the chosen side, independent of the rotating slots.
    // Changing the focus aims the beam; it never carries the projector around with the slot.
    const halfView = (camera.position.z - 1.4) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const drift = controls.rayMotion * (.09 * Math.sin(time * .33) + .05 * Math.sin(time * .57 + 1.4));
    if (!motion.matches && !paused && opened < 0) updateRays(dt); else if (firstRays) updateRays(0);
    firstRays = false;
    // The projector itself always lives beyond the visible canvas. Visitors see light entering
    // from the screen edge, never an apex floating in the mobile or desktop composition.
    const sourceFraction = 1.08 + (controls.rayLength - 3) / 6 * .42;
    const linkedOrigin = beamOriginFraction === null ? controls.rayElevation * .55
      : (.5 - THREE.MathUtils.clamp(beamOriginFraction, .04, .96)) * halfView * 2
        + (controls.rayElevation - DISC_DEFAULTS.rayElevation) * .12;
    source.set(side * halfView * camera.aspect * sourceFraction,
      THREE.MathUtils.clamp(linkedOrigin + drift, -halfView * .92, halfView * .92), 1.4);
    // A lamp behind the disc could not light its face: keep the source on the lit side.
    discNormal.set(0, 0, 1).transformDirection(projectorFrame);
    sourceLocal.value.copy(source).applyMatrix4(projectorTransform.value);
    if (sourceLocal.value.z < .9) { source.addScaledVector(discNormal, .9 - sourceLocal.value.z); sourceLocal.value.z = .9; }
    // The hull is larger than the window so the light's soft edge fades out before reaching it.
    const hullX = (projection.outer - projection.inner) * .5 * .36, hullWidth = 1.36;
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
    fanMaterial.uniforms.power.value = controls.rayIntensity;
    beamGlow.value = controls.beamGlow; rayStrength.value = controls.rayStrength;
    beamTime.value = time;
    beamMotion.value = controls.rayMotion;
    fanMaterial.uniforms.prism.value = controls.rayPrism;
    fanMaterial.uniforms.rayStyle.value = controls.rayStyle;
    saturation.value = controls.desaturation; bloom.strength = controls.bloom; bloom.enabled = controls.bloom > 0;
    bloom.radius = controls.glowRadius; bloom.threshold = controls.glowThreshold;
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
    if (!raf && !motion.matches && (hoverSettling || (!paused && opened < 0 && ((controls.spinSpeed !== 0 && hovered < 0) || (controls.rayMotion > 0 && controls.rayIntensity > 0))))) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!destroyed && active && !document.hidden && !raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; elapsed = 0; }
  const visibility = () => { if (document.hidden) stop(); else wake(); };
  const changeMotion = () => { stop(); wake(); };
  const lost = (event: Event) => { event.preventDefault(); stop(); onError?.(); };
  document.addEventListener("visibilitychange", visibility); motion.addEventListener("change", changeMotion);
  canvas.addEventListener("webglcontextlost", lost);
  setImages(initial);
  return {
    controls, resize,
    setImages,
    setBeamOrigin(fraction: number) {
      beamOriginFraction = Number.isFinite(fraction) ? fraction : null;
      wake();
    },
    setActive(value: boolean) { active = value; if (value) wake(); else stop(); },
    setPaused(value: boolean) { paused = value; stop(); wake(); },
    setHover(index: number) { if (opened >= 0) return; const next = index >= 0 && index < slots.length ? index : -1; if (hovered !== next) { hovered = next; wake(); } },
    setOpen(index: number) { opened = index >= 0 && index < slots.length ? index : -1; hovered = -1; wake(); },
    invalidate: wake,
    hit(x: number, y: number) {
      pointer.set(x / width * 2 - 1, 1 - y / height * 2); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(slots.map(s => s.image), false)[0];
      if (hit) return slots.findIndex(s => s.image === hit.object);
      // Keep the original footprint hittable while it lifts away from the pointer.
      // This prevents hover flicker without leaving a card selected over empty canvas.
      if (hovered >= 0 && slots[hovered] && restRay.copy(raycaster.ray).applyMatrix4(inverseDisc).intersectPlane(restPlane, restHit)) {
        const angle = slots[hovered].angle, c = Math.cos(angle), s = Math.sin(angle);
        const radial = (restHit.x * c + restHit.y * s) / R;
        const tangent = (-restHit.x * s + restHit.y * c) / R;
        const fraction = (radial - layout.inner) / (layout.outer - layout.inner);
        if (fraction >= 0 && fraction <= 1 && Math.abs(tangent) <= layout.innerHalfWidth + (layout.outerHalfWidth - layout.innerHalfWidth) * fraction) return hovered;
      }
      return -1;
    },
    dispose() {
      if (destroyed) return;
      destroyed = true; stop(); clearSlots();
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

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { DISC_DEFAULTS, sanitizeDisc, discPanelLayout, discProjectionWindow, discProjectionCoverage, visibleDiscItems, type DiscControls } from "../../lib/content/disc";

export type DiscImage = { src: string; label: string; tint?: string };
export type DiscScene = ReturnType<typeof createDiscScene>;
const TAU = Math.PI * 2;
const R = 2.35;
const vertex = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;

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
  let width = 1, height = 1, quality = 1, slowFrames = 0;
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
  const panelAspect = { value: 1 };
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
    shader.vertexShader = `varying vec3 vDiscLocal;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDiscLocal=position;");
    shader.fragmentShader = `uniform float uDesaturation; varying vec3 vDiscLocal;\n${shader.fragmentShader}`
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        float angle=atan(vDiscLocal.y,vDiscLocal.x);
        roughnessFactor *= .9+.1*sin(angle*291.)*sin(angle*113.)*exp(-fwidth(angle)*291.);`)
      .replace("#include <opaque_fragment>", `
        float rim=pow(clamp(1.-abs(dot(normal,geometryViewDir)),0.,1.),3.);
        float edge=smoothstep(2.28,2.35,length(vDiscLocal.xy));
        outgoingLight=outgoingLight*.38+vec3(.04)*rim*edge;
        outgoingLight=mix(outgoingLight,vec3(dot(outgoingLight,vec3(.2126,.7152,.0722))),uDesaturation);
        #include <opaque_fragment>`);
  };
  disc.add(new THREE.Mesh(own(new THREE.RingGeometry(R * 0.22, R, 192, 3)), silver));
  const edgeMaterial = own(new THREE.MeshBasicMaterial({ color: 0xb2bcc8, transparent: true, opacity: 0.22 }));
  for (const radius of [R, R * 0.22, R * 0.27, R * 0.3]) {
    disc.add(new THREE.Mesh(own(new THREE.TorusGeometry(radius, radius === R ? 0.012 : 0.004, 4, 192)), edgeMaterial));
  }

  const glass = own(new THREE.MeshPhysicalMaterial({ color: 0xdde5f2, transmission: 0.9, roughness: 0.1, thickness: 0.025,
    ior: 1.45, metalness: 0, clearcoat: 0.1, envMapIntensity: 0.35, side: THREE.FrontSide, depthWrite: false }));
  const border = own(new THREE.LineBasicMaterial({ color: 0xcbd8ef, transparent: true, opacity: 0.18 }));
  type Slot = { group: THREE.Group; image: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; texture: THREE.CanvasTexture;
    average: THREE.Color; angle: number; weight: number; tintMaterial?: THREE.MeshPhysicalMaterial };
  let slots: Slot[] = [], generation = 0, lastGap = controls.slotGap, lastSize = controls.slotSize;
  let layout = discPanelLayout(initial.length, controls.slotGap, controls.slotSize);
  let loader = new AbortController();
  const averageCanvas = document.createElement("canvas"); averageCanvas.width = averageCanvas.height = 1;
  const averageContext = averageCanvas.getContext("2d", { willReadFrequently: true })!;
  const panels = new THREE.Group(); disc.add(panels);
  const geometries: THREE.BufferGeometry[] = [];

  function clearSlots() {
    loader.abort(); loader = new AbortController(); generation++;
    for (const s of slots) { s.texture.dispose(); s.image.material.dispose(); s.tintMaterial?.dispose(); s.texture.image.width = s.texture.image.height = 0; }
    geometries.forEach(g => g.dispose()); geometries.length = 0;
    panels.clear(); slots = [];
  }
  function updateGap() {
    // A spacing slider must not re-fetch/re-decode every image on each pointer move.
    const old = geometries.splice(0);
    layout = discPanelLayout(slots.length, controls.slotGap, controls.slotSize);
    panelAspect.value = layout.aspect;
    const panelGeometry = plaque(layout);
    const imageGeometry = plaque(layout, 0.008);
    const edges = new THREE.EdgesGeometry(panelGeometry, 20);
    geometries.push(panelGeometry, imageGeometry, edges);
    for (const slot of slots) {
      slot.image.geometry = imageGeometry;
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
    panelAspect.value = layout.aspect;
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
      ctx.strokeStyle = "#4e5a6d"; ctx.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
      ctx.fillStyle = "#d3d9e3"; ctx.font = `500 ${size * 0.06}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(item.label || `IMAGE ${i + 1}`, size / 2, size * 0.5, size * 0.85);
      ctx.font = `${size * 0.035}px sans-serif`; ctx.fillStyle = "#7e8da3";
      ctx.fillText("ARTWORK TO FOLLOW", size / 2, size * 0.61, size * 0.8);
      const texture = new THREE.CanvasTexture(thumb); texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.ShaderMaterial({ transparent: true, uniforms: { map: { value: texture },
        imageSaturation, vibrance, imageOpacity, blur, dimBrightness, panelAspect, slotGlow,
        projectorTransform, projectorBounds, projectorSoftness, projectorPower },
        vertexShader: `uniform mat4 projectorTransform; varying vec2 vUv, vProjector;
          void main(){ vUv=uv; vec4 world=modelMatrix*vec4(position,1.);
            vProjector=(projectorTransform*world).xy/2.35;
            gl_Position=projectionMatrix*viewMatrix*world; }`,
        fragmentShader: `uniform sampler2D map;
        uniform float imageSaturation, vibrance, imageOpacity, blur, dimBrightness, panelAspect, slotGlow, projectorSoftness, projectorPower;
        uniform vec4 projectorBounds; varying vec2 vUv, vProjector;
        float feather(float edge){
          float width=.18+.18*projectorSoftness;
          float t=clamp((edge-(1.-width))/width,0.,1.);
          return clamp(1.-t*t*t*(t*(t*6.-15.)+10.),0.,1.);
        }
        void main(){
          float radial=(vProjector.x-projectorBounds.x)/(projectorBounds.y-projectorBounds.x);
          float halfWidth=mix(projectorBounds.z,projectorBounds.w,clamp(radial,0.,1.));
          float focus=feather(abs(radial*2.-1.))*feather(abs(vProjector.y)/halfWidth)*smoothstep(0.,.25,projectorPower);
          vec2 uv=(vUv-.5)*vec2(max(1.,panelAspect),max(1.,1./panelAspect))+.5;
          float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
          vec4 tex=texture2D(map,clamp(uv,0.,1.),(1.-focus)*blur); tex.a*=inside; vec3 c=tex.rgb;
          float grey=dot(c,vec3(.2126,.7152,.0722));
          float chroma=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
          c=max(vec3(0.),mix(vec3(grey),c,imageSaturation*(1.+vibrance*(1.-chroma))));
          // Emission comes from the artwork itself, only where the fixed projector window overlaps it.
          c=mix(vec3(grey)*dimBrightness,c*(1.+slotGlow*.65),focus);
          c=mix(vec3(.012),c,tex.a);
          gl_FragColor=vec4(c,imageOpacity); }` });
      const group = new THREE.Group(); group.rotation.z = i * step; panels.add(group);
      // The print sits just inside the raised glass edge; refraction must not wash out its lettering.
      const image = new THREE.Mesh(imageGeometry, material); image.position.z = 0.039; group.add(image);
      const tintMaterial = item.tint ? glass.clone() : undefined;
      if (tintMaterial) tintMaterial.color.set(item.tint!);
      const pane = new THREE.Mesh(panelGeometry, tintMaterial ?? glass); pane.position.z = 0.037; group.add(pane);
      const outline = new THREE.LineSegments(edges, border); outline.position.z = 0.041; group.add(outline);
      slots.push({ group, image, texture, average: new THREE.Color(0x808080), angle: i * step, weight: 0, tintMaterial });
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
          ctx.clearRect(0, 0, size, size); ctx.fillStyle = "#10141c"; ctx.fillRect(0, 0, size, size);
          const scale = Math.min(size / bitmap.width, size / bitmap.height);
          ctx.drawImage(bitmap, (size - bitmap.width * scale) / 2, (size - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
          averageContext.clearRect(0, 0, 1, 1); averageContext.drawImage(bitmap, 0, 0, 1, 1);
          const rgba = averageContext.getImageData(0, 0, 1, 1).data;
          slot.average.setRGB(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, THREE.SRGBColorSpace);
          release(); slot.texture.needsUpdate = true; wake();
        } catch { /* Abort, network and cross-origin failures keep a usable placeholder. */ }
      }
    })();
    wake();
  }

  const anchor = new THREE.Vector3(), source = new THREE.Vector3();
  const beamColor = new THREE.Color(0x808080), targetColor = new THREE.Color();
  // Four lightweight faces widen from the right-hand projector onto the fixed plaque-shaped window.
  // Unlike a point flare, the landing area follows both dimensions of the slot.
  const fanMaterial = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: beamColor }, power: { value: 0 }, prism: { value: controls.rayPrism }, rayStyle: { value: controls.rayStyle }, viewport: { value: new THREE.Vector2(1, 1) } },
    vertexShader: vertex,
    fragmentShader: `uniform vec3 tint; uniform float power, prism, rayStyle; uniform vec2 viewport; varying vec2 vUv;
      void main(){
        float along=vUv.x;
        // Triangle UVs narrow toward the source: normalize before feathering both outer edges.
        float across=(vUv.y-.5)*2./max(1.-along,.001);
        float envelope=exp(-across*across*2.8)*(1.-smoothstep(.25,.98,abs(across)));
        envelope*=smoothstep(0.,.06,along)*(1.-smoothstep(.6,1.,along));
        // Fade the light before it reaches the canvas boundary, without masking the disc or text.
        vec2 screen=gl_FragCoord.xy/viewport;
        envelope*=smoothstep(0.,.08,screen.x)*(1.-smoothstep(.78,1.,screen.x));
        envelope*=smoothstep(0.,.08,screen.y)*(1.-smoothstep(.92,1.,screen.y));
        float core=exp(-across*across*32.);
        float filaments=0.;
        for(int i=0;i<9;i++){
          float f=float(i), center=sin(f*2.399)*.82;
          float band=(across-center)/(.025+.025*fract(f*.618));
          filaments+=exp(-band*band)*(.28+.4*fract(f*.37));
        }
        float prismatic=step(.5,rayStyle)*(1.-step(1.5,rayStyle));
        float luminance=dot(tint,vec3(.2126,.7152,.0722));
        vec3 spectrum=.5+.5*cos(6.28318*(across*.65+vec3(0.,.33,.67)));
        // Dispersion modulates the artwork's colour instead of replacing it with a rainbow.
        vec3 colour=tint*mix(vec3(1.8),vec3(.9)+spectrum*1.8,prism*prismatic*.45);
        colour+=vec3(luminance*.4)*core*(1.-along);
        float cinema=1.-step(.5,rayStyle);
        float shaft=.48+core*mix(.18,.4,cinema)+filaments*prismatic*.25;
        float falloff=mix(1.,.4,along);
        gl_FragColor=vec4(colour,envelope*shaft*falloff*power*.3);
      }` }));
  const beamGeometry = own(new THREE.BufferGeometry());
  const beamPositions = new THREE.Float32BufferAttribute(new Float32Array(36), 3).setUsage(THREE.DynamicDrawUsage);
  beamGeometry.setAttribute("position", beamPositions);
  beamGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => [0, 0, 0, 1, 1, .5]).flat(), 2));
  const fan = new THREE.Mesh(beamGeometry, fanMaterial); fan.frustumCulled = false; scene.add(fan);
  const corners = Array.from({ length: 4 }, () => new THREE.Vector3());
  const projectionAxis = new THREE.Vector3(0, 0, 1);
  let projection = discProjectionWindow(layout, controls.focusRadius, controls.raySpread);
  let projectionLayout = layout, projectionRadius = controls.focusRadius, projectionSpread = controls.raySpread;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), controls.bloom, 0.75, 0.72);
  const output = new OutputPass(), antialias = new ShaderPass(FXAAShader);
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(antialias);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
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
    camera.position.z = Math.max(8.8, 10.2 / camera.aspect); camera.updateProjectionMatrix(); wake();
  }
  function draw(dt: number) {
    if (lastGap !== controls.slotGap || lastSize !== controls.slotSize) { lastGap = controls.slotGap; lastSize = controls.slotSize; updateGap(); }
    imageSaturation.value = controls.saturation; vibrance.value = controls.vibrance;
    imageOpacity.value = controls.slotOpacity; blur.value = controls.slotBlur; dimBrightness.value = controls.unfocusedBrightness;
    slotGlow.value = controls.bloom * controls.rayIntensity;
    projectorSoftness.value = controls.glowRadius; projectorPower.value = controls.rayIntensity;
    studioLights.forEach(({ light, base }) => { light.intensity = base * controls.lightIntensity; });
    scene.environmentIntensity = controls.lightIntensity;
    tilt.rotation.set(THREE.MathUtils.degToRad(controls.discTilt), 0, THREE.MathUtils.degToRad(controls.discRoll), "ZYX");
    if (!motion.matches && !paused) disc.rotation.z = (disc.rotation.z + controls.spinSpeed * dt) % TAU;
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
    for (const slot of slots) {
      slot.weight = discProjectionCoverage(layout, projection, slot.angle + disc.rotation.z - localFocus, controls.glowRadius);
      coverage += slot.weight;
      targetColor.r += slot.average.r * slot.weight;
      targetColor.g += slot.average.g * slot.weight;
      targetColor.b += slot.average.b * slot.weight;
    }
    if (coverage > .00001) targetColor.multiplyScalar(1 / coverage); else targetColor.copy(beamColor);
    const luminance = targetColor.r * 0.2126 + targetColor.g * 0.7152 + targetColor.b * 0.0722;
    const chroma = Math.max(targetColor.r, targetColor.g, targetColor.b) - Math.min(targetColor.r, targetColor.g, targetColor.b);
    const colourBoost = coverage > .00001 ? controls.saturation * (1 + controls.vibrance * (1 - chroma)) : 1;
    targetColor.setRGB(Math.max(0, luminance + (targetColor.r - luminance) * colourBoost),
      Math.max(0, luminance + (targetColor.g - luminance) * colourBoost), Math.max(0, luminance + (targetColor.b - luminance) * colourBoost));
    beamColor.lerp(targetColor, motion.matches || dt === 0 ? 1 : 1 - Math.exp(-dt * 4));
    // The projector lives in the dark space to the right of the entire disc.
    // Changing the focus aims the beam; it never carries the projector around with the slot.
    source.set(R + controls.rayLength, controls.rayElevation, 1.4);
    corners[0].set(projection.inner * R, -projection.innerHalfWidth * R, .065);
    corners[1].set(projection.outer * R, -projection.outerHalfWidth * R, .065);
    corners[2].set(projection.outer * R, projection.outerHalfWidth * R, .065);
    corners[3].set(projection.inner * R, projection.innerHalfWidth * R, .065);
    for (const corner of corners) { corner.applyAxisAngle(projectionAxis, localFocus); tilt.localToWorld(corner); }
    for (let face = 0; face < 4; face++) {
      const a = corners[face], b = corners[(face + 1) % 4];
      beamPositions.setXYZ(face * 3, a.x, a.y, a.z);
      beamPositions.setXYZ(face * 3 + 1, b.x, b.y, b.z);
      beamPositions.setXYZ(face * 3 + 2, source.x, source.y, source.z);
    }
    beamPositions.needsUpdate = true;
    // The projector remains on between titles. Only the artwork focus fades, never the light.
    fanMaterial.uniforms.power.value = controls.rayIntensity;
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
    if (!raf && !motion.matches && !paused && controls.spinSpeed !== 0) raf = requestAnimationFrame(tick);
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
    setActive(value: boolean) { active = value; if (value) wake(); else stop(); },
    setPaused(value: boolean) { paused = value; stop(); wake(); },
    invalidate: wake,
    hit(x: number, y: number) {
      pointer.set(x / width * 2 - 1, 1 - y / height * 2); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(slots.map(s => s.image), false)[0];
      return hit ? slots.findIndex(s => s.image === hit.object) : -1;
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

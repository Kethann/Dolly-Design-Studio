import * as THREE from "three";
import { releaseDiscImage, type DiscControls } from "../../lib/content/disc";

const GLASS_RADIUS = 2.35;
const MAX_MARKS = 12;
const EFFECT_ID: Record<DiscControls["glassEffect"], number> = { clear: 0, frosted: 1, liquid: 2, ribbed: 3, hammered: 4, crystal: 5, bubble: 6 };
const PATTERN_ID: Record<DiscControls["patternKind"], number> = { none: 0, rings: 1, rays: 2, grid: 3, dots: 4, waves: 5, diamonds: 6, image: 7 };
const EDGE_ID: Record<DiscControls["edgeStyle"], number> = { classic: 0, double: 1, dashed: 2, beaded: 3, film: 4, rope: 5, scallop: 6, gear: 7, image: 8 };
// How far each surface blurs the page behind it, in CSS pixels at full strength.
const BACKDROP_BLUR: Record<DiscControls["glassEffect"], number> = { clear: 0, frosted: 18, liquid: 0, ribbed: 6, hammered: 7, crystal: 4, bubble: 2 };

type LoadedMap = { value: THREE.Texture | null };
type MapSlot = { src: string; texture: LoadedMap; aspect: { value: number }; ink: { value: THREE.Vector2 }; ready: { value: number }; abort: AbortController | null };

type DesignOptions = {
  disc: THREE.Object3D; controls: DiscControls; renderer: THREE.WebGLRenderer; lowPower: boolean;
  noise: THREE.Texture; rayShaderSource: string; contactShader: string;
  shared: Record<string, { value: unknown }>;
  resolveImage: (src: string) => string; wake: () => void;
};
type Settle = (current: number, target: number, dt: number, rate?: number) => number;

/**
 * The portal's Glass design: surface effect, pattern, custom edge and picture.
 * A separate pane above the clear glass, hidden unless something is switched on,
 * so the default circle costs and looks exactly what it did before.
 */
export function createGlassDesign({ disc, controls, renderer, lowPower, noise, rayShaderSource, contactShader, shared, resolveImage, wake }: DesignOptions) {
  const slot = (): MapSlot => ({ src: "", texture: { value: null }, aspect: { value: 1 }, ink: { value: new THREE.Vector2() }, ready: { value: 0 }, abort: null });
  const maps = { pattern: slot(), edge: slot(), picture: slot() };
  const rendered = { amount: controls.glassEffectAmount, scale: controls.glassEffectScale, patternAmount: controls.patternAmount, patternScale: controls.patternScale,
    edgeWidth: controls.edgeWidth, edgeBrightness: controls.edgeBrightness, markSize: controls.ringMarkSize, pictureSize: controls.pictureSize, pictureDistance: controls.pictureDistance,
    pictureAngle: controls.pictureAngle, pictureRotation: controls.pictureRotation, pictureOpacity: controls.pictureOpacity };
  const uniform = {
    effect: { value: 0 }, effectAmount: { value: 0 }, effectScale: { value: 1 }, flowTime: { value: 0 }, spin: { value: 0 },
    patternKind: { value: 0 }, patternAmount: { value: 0 }, patternScale: { value: 1 }, patternColor: { value: new THREE.Color(controls.patternColor) }, patternGlass: { value: 1 }, patternCover: { value: 0 },
    edgeKind: { value: 0 }, edgeWidth: { value: 0 }, edgeRepeats: { value: 72 }, edgeBrightness: { value: 1 }, edgeColor: { value: new THREE.Color(controls.edgeColor) }, edgeGlass: { value: 1 },
    edgeShape: { value: new THREE.Vector3() }, markCount: { value: 0 }, markSize: { value: 1 },
    pictureOn: { value: 0 }, pictureSize: { value: .4 }, pictureCentre: { value: new THREE.Vector2() }, pictureTurn: { value: 0 }, pictureOpacity: { value: 1 }, pictureGlass: { value: 1 }, pictureFollow: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...shared, ...uniform, noiseMap: { value: noise },
      patternMap: maps.pattern.texture, patternAspect: maps.pattern.aspect, patternInk: maps.pattern.ink, patternReady: maps.pattern.ready,
      edgeMap: maps.edge.texture, edgeAspect: maps.edge.aspect, edgeInk: maps.edge.ink, edgeReady: maps.edge.ready,
      pictureMap: maps.picture.texture, pictureAspect: maps.picture.aspect, pictureInk: maps.picture.ink, pictureReady: maps.picture.ready },
    vertexShader: `uniform mat4 projectorTransform; varying vec2 vGlass, vProjector;
      void main(){ vec4 world=modelMatrix*vec4(position,1.);
        vGlass=position.xy/${GLASS_RADIUS.toFixed(2)}; vProjector=(projectorTransform*world).xy/${GLASS_RADIUS.toFixed(2)};
        gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `#define MAX_MARKS ${MAX_MARKS}
      #define TAU 6.28318531
      uniform vec4 projectorBounds; uniform vec3 contactColour, glassTint;
      uniform float projectorSoftness, contactStrength, surfaceReflection;
      uniform float effect, effectAmount, effectScale, flowTime, spin;
      uniform float patternKind, patternAmount, patternScale, patternGlass, patternCover, patternAspect, patternReady; uniform vec3 patternColor; uniform vec2 patternInk;
      uniform float edgeKind, edgeWidth, edgeRepeats, edgeBrightness, edgeGlass, edgeAspect, edgeReady; uniform vec3 edgeColor, edgeShape; uniform vec2 edgeInk;
      uniform float markCount, markSize;
      uniform float pictureOn, pictureSize, pictureTurn, pictureOpacity, pictureGlass, pictureFollow, pictureAspect, pictureReady; uniform vec2 pictureCentre, pictureInk;
      uniform sampler2D noiseMap, patternMap, edgeMap, pictureMap;
      varying vec2 vGlass, vProjector;
      ${rayShaderSource}
      ${contactShader}
      vec2 turn(vec2 p,float a){ float c=cos(a), s=sin(a); return vec2(c*p.x-s*p.y,s*p.x+c*p.y); }
      float line(float value,float width){ float w=max(fwidth(value),.00001); return 1.-smoothstep(width-w,width+w,abs(value)); }
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float heightAt(vec2 q){ vec2 flow=vec2(flowTime*.019,-flowTime*.013);
        return texture2D(noiseMap,q+flow).r*.62+texture2D(noiseMap,q*2.1-flow*1.6).r*.38; }
      // Colour and strength of one printed layer: 0 keeps the artwork as it is, 1 turns it into etched glass.
      vec4 printed(vec3 art,float artAlpha,float ink,float glassy,vec3 tint,float light){
        float bevel=clamp(length(vec2(dFdx(ink),dFdy(ink)))*2.2,0.,1.);
        vec3 glass=tint*(.42+light*.7)+vec3(.86,.93,1.)*bevel*(.35+light*.8);
        float glassAlpha=clamp(ink*(.2+light*.55)+bevel*(.3+light*.55),0.,1.);
        return vec4(mix(art,glass,glassy),mix(artAlpha,glassAlpha,glassy));
      }
      float inkOf(vec4 t,vec2 mode){ // mode.x: the image has no see-through areas, so its brightness draws the shape; mode.y: dark marks on a light page.
        float l=dot(t.rgb,vec3(.2126,.7152,.0722));
        return mix(t.a,mix(l,1.-l,mode.y)*t.a,mode.x);
      }
      float patternField(vec2 g,float r,float angle,float kind,float scale){
        vec2 q=g*11./scale;
        if(kind<1.5){ return line(sin(r*44./scale),.1); }
        if(kind<2.5){ float n=floor(64./scale+.5); return line(sin(angle*n*.5),.14); }
        if(kind<3.5){ return max(line(sin(q.x*3.14159),.08),line(sin(q.y*3.14159),.08)); }
        if(kind<4.5){ vec2 c=fract(q)-.5; float d=length(c), w=min(fwidth(d),.08); return 1.-smoothstep(.17-w,.17+w,d); }
        if(kind<5.5){ return line(sin((q.y+.28*sin(q.x*1.7))*3.14159),.1); }
        return max(line(sin((q.x+q.y)*2.26),.08),line(sin((q.x-q.y)*2.26),.08));
      }
      void main(){
        float r=length(vGlass), aa=max(fwidth(r),.00025), angle=atan(vGlass.y,vGlass.x);
        float wave=.5+.5*cos(angle*edgeShape.y); wave=mix(wave,smoothstep(.32,.68,wave),edgeShape.z);
        float outline=1.-edgeShape.x*wave;
        float inside=1.-smoothstep(outline-aa,outline,r);
        if(inside<=0.) discard;
        // The same fixed light as the rim: patterns catch it as the disc turns beneath the lamp.
        vec2 radial=vProjector/max(length(vProjector),.0001);
        float sweep=pow(abs(dot(radial,normalize(vec2(.65,.76)))),6.);
        float lampFacing=exp(-pow(atan(vProjector.y,vProjector.x)*1.5,2.));
        float rake=.14+.86*clamp(pow(sweep,1.4)*.75+lampFacing*.55,0.,1.);
        vec2 lightWindow=discWindow(vProjector);
        float contact=clamp(contactReflection(lightWindow,rayField(lightWindow))*surfaceReflection,0.,1.);
        float light=clamp(rake*.65+contact*1.5,0.,1.);
        vec2 bend=vec2(0.);
        vec4 sum=vec4(0.); // Front to back, premultiplied.
        #define LAYER(colour,alpha) { float layerAlpha=clamp(alpha,0.,1.); sum.rgb+=(colour)*layerAlpha*(1.-sum.a); sum.a+=layerAlpha*(1.-sum.a); }

        // Surface finish.
        vec2 slope=vec2(0.); float shine=48., sparkle=0.; vec3 fire=vec3(1.);
        if(effect>.5&&effect<1.5){
          // Frosted: milky scatter and a fine tooth. The real blur of the page is the layer behind the canvas.
          float tooth=hash(floor(gl_FragCoord.xy));
          float milk=effectAmount*(.09+.17*smoothstep(.1,.98,r))*(.86+.28*tooth);
          vec3 frost=mix(glassTint,vec3(1.),.72)*(.5+light*.75);
          float inner=exp(-(1.-min(r,1.))/.045);
          LAYER(frost+contactColour*contact*.5,milk*(1.+contact*2.2)+inner*.12*effectAmount)
        } else if(effect<2.5&&effect>1.5){
          vec2 q=vGlass*.42/effectScale; float e=.006, h=heightAt(q);
          slope=vec2(heightAt(q+vec2(e,0.))-h,heightAt(q+vec2(0.,e))-h)/e*.075;
          bend=slope*.09;
          float crest=exp(-pow((h-.5)/.012,2.));
          LAYER(vec3(.82,.92,1.)*(.55+light),crest*.08*effectAmount*(.35+light))
          shine=70.;
        } else if(effect<3.5&&effect>2.5){
          float n=floor(110./effectScale+.5), flute=cos(angle*n);
          float fade=1.-smoothstep(.45,.9,fwidth(r)*n/max(r,.05)+aa*n*.2);
          slope=vec2(-vGlass.y,vGlass.x)/max(r,.02)*flute*.95*smoothstep(.02,.1,r)*fade;
          bend=slope*.012; shine=28.;
          LAYER(vec3(.015,.02,.04),(1.-abs(flute))*.1*effectAmount*fade)
        } else if(effect<4.5&&effect>3.5){
          vec2 q=vGlass*15./effectScale, cell=floor(q), nearest=vec2(0.); float best=9.;
          for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
            vec2 id=cell+vec2(float(x),float(y)), centre=id+vec2(hash(id),hash(id+17.))*.8+.1;
            float d=dot(q-centre,q-centre); if(d<best){ best=d; nearest=q-centre; }
          }
          slope=nearest*1.05; bend=slope*.016; shine=38.;
        } else if(effect>5.5){
          // Soap-bubble film: colours run through a thin skin, gathering toward the rim.
          vec2 q=vGlass*.34/effectScale; float e=.006, h=heightAt(q);
          slope=vec2(heightAt(q+vec2(e,0.))-h,heightAt(q+vec2(0.,e))-h)/e*.05;
          bend=slope*.05; shine=64.;
          fire=mix(vec3(1.),.5+.5*cos(TAU*(h*3.2+r*1.3+vec3(0.,.33,.67))),.72);
          LAYER(fire*(.62+light*.6),effectAmount*(.05+.3*pow(min(r,1.),5.))*(1.+contact*1.6))
        } else if(effect>4.5){
          float n=floor(44./effectScale+.5), m=floor(9./effectScale+.5);
          vec2 facet=vec2(angle/TAU*n,r*m), id=floor(facet), f=fract(facet);
          id.x=mod(id.x,n); float half_=step(f.x,f.y);
          float seed=hash(id+half_*.5);
          slope=vec2(cos(seed*TAU),sin(seed*TAU))*(.25+hash(id+half_+3.)*.65);
          bend=slope*.014; shine=90.;
          fire=.62+.5*cos(TAU*(seed*2.+vec3(0.,.33,.67)));
          sparkle=hash(id+half_+9.);
          float seam=1.-smoothstep(0.,.05,min(min(f.x,1.-f.x),min(min(f.y,1.-f.y),abs(f.x-f.y))));
          LAYER(vec3(.9,.95,1.)*(.4+light),seam*.12*effectAmount*(.3+light))
        }
        if(effect>1.5){
          vec2 fixedSlope=turn(slope,spin);
          vec3 normal=normalize(vec3(-fixedSlope,1.));
          float glint=pow(max(dot(normal,normalize(vec3(.26,.34,.9))),0.),shine);
          float depth=clamp(dot(slope,slope)*.5,0.,1.);
          vec3 colour=mix(vec3(.82,.92,1.),contactColour+.35,contact)*fire;
          LAYER(colour,glint*(.3+light*.95)*effectAmount*(.8+sparkle*.5))
          LAYER(vec3(.015,.02,.045),depth*.14*effectAmount)
        }

        // Circular marks on the rim.
        float marks=0.;
        float markWidth=max(.0013,aa*.8)*1.15;
        for(int n=0;n<MAX_MARKS;n++){
          if(float(n)>=markCount) break;
          float na=markCount==2.?(n==0?.64:-2.18):.64+float(n)*TAU/markCount;
          vec2 centre=.959*vec2(cos(na),sin(na));
          marks+=exp(-pow((length(vGlass-centre)-.019*markSize)/markWidth,2.));
        }
        if(marks>0.) LAYER(mix(vec3(.74,.84,.98),vec3(.98,.93,.86),clamp(sweep*.8+lampFacing*.25,0.,1.)),marks*.9*rake)

        // The edge, in place of the classic rim.
        if(edgeKind>.5){
          float half_=mix(.003,.03,edgeWidth), rimR=outline-half_-.004, dr=r-rimR;
          float u=angle/TAU*edgeRepeats, cell=fract(u)-.5, along=cell*TAU*max(r,.2)/edgeRepeats;
          float cover=0.; vec3 colour=edgeColor; float alpha=1.;
          if(edgeKind<1.5) cover=max(line(dr-half_*.8,half_*.2),line(dr+half_*.8,half_*.2));
          else if(edgeKind<2.5) cover=line(dr,half_*.4)*(1.-smoothstep(.27,.3,abs(cell)));
          else if(edgeKind<3.5){ float d=length(vec2(along,dr)), w=max(aa,.0006); cover=1.-smoothstep(half_*.8-w,half_*.8+w,d); }
          else if(edgeKind<4.5){
            vec2 hole=abs(vec2(along,dr))-vec2(TAU/edgeRepeats*.22,half_*.34);
            float d=length(max(hole,0.))+min(max(hole.x,hole.y),0.), w=max(aa,.0006);
            cover=max(smoothstep(-w,w,d)*(1.-smoothstep(half_-w,half_+w,abs(dr))),max(line(dr-half_,half_*.09),line(dr+half_,half_*.09)));
            cover*=.8;
          }
          else if(edgeKind<5.5){ float twist=sin(angle*edgeRepeats); cover=max(line(dr-twist*half_*.7,half_*.32),line(dr+twist*half_*.7,half_*.32)); }
          else if(edgeKind<7.5){ float w=max(aa,.0006); cover=1.-smoothstep(half_*.3-w,half_*.3+w,abs(r-outline+.006)); }
          else if(edgeReady>.5){
            float inRing=1.-smoothstep(half_-aa,half_+aa,abs(dr));
            vec2 uv=vec2(fract(u),dr/(half_*2.)+.5);
            vec2 dx=vec2(fwidth(u)<.5?dFdx(u):dFdx(fract(u+.5)),dFdx(uv.y)), dy=vec2(fwidth(u)<.5?dFdy(u):dFdy(fract(u+.5)),dFdy(uv.y));
            vec4 t=textureGrad(edgeMap,uv,dx,dy);
            vec4 shaded=printed(t.rgb,t.a,inkOf(t,edgeInk),edgeGlass,edgeColor,rake);
            colour=shaded.rgb; cover=shaded.a*inRing;
          }
          if(edgeKind<7.5) { colour=edgeColor*(.5+rake*.62+contact*.8); alpha=.35+rake*.65; }
          LAYER(colour,cover*alpha*edgeBrightness)
        }

        // A picture on the glass, then the pattern across the disc; both bend with the surface.
        if(pictureOn>.5&&pictureReady>.5){
          vec2 frame=pictureFollow>.5?vGlass:turn(vGlass,spin);
          vec2 p=turn(frame+bend-pictureCentre,-pictureTurn)/pictureSize;
          p.x/=pictureAspect>1.?1.:pictureAspect; p.y*=pictureAspect>1.?pictureAspect:1.;
          vec2 uv=p+.5;
          float box=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
          if(box>0.){ vec4 t=texture2D(pictureMap,uv); vec4 shaded=printed(t.rgb,t.a,inkOf(t,pictureInk),pictureGlass,mix(glassTint,vec3(1.),.65),light);
            LAYER(shaded.rgb,shaded.a*pictureOpacity) }
        }
        if(patternKind>.5){
          vec2 g=vGlass+bend; float fadeRim=1.-smoothstep(.93,.985,r);
          if(patternKind>6.5){
            if(patternReady>.5){
              vec2 uv=patternCover>.5?g*.5*vec2(min(1.,1./patternAspect),min(1.,patternAspect))/patternScale+.5
                :g*2.6/patternScale*vec2(1./patternAspect,1.);
              vec4 t=texture2D(patternMap,uv); vec4 shaded=printed(t.rgb,t.a,inkOf(t,patternInk),patternGlass,patternColor,light);
              LAYER(shaded.rgb,shaded.a*patternAmount*fadeRim)
            }
          } else {
            float field=patternField(g,length(g),atan(g.y,g.x),patternKind,patternScale);
            vec4 shaded=printed(patternColor,field,field,patternGlass,patternColor,light);
            LAYER(shaded.rgb,shaded.a*patternAmount*fadeRim)
          }
        }
        gl_FragColor=vec4(sum.rgb/max(sum.a,.0001),sum.a*inside);
      }`,
  });
  const geometry = new THREE.CircleGeometry(GLASS_RADIUS, 192);
  const mesh = new THREE.Mesh(geometry, material);
  // Over the clear pane, under the titles.
  mesh.position.z = .02; mesh.renderOrder = -1; mesh.visible = false;
  disc.add(mesh);

  function load(which: MapSlot, src: string, wrap: boolean) {
    if (which.src === src) return;
    which.src = src; which.abort?.abort(); which.abort = null; which.ready.value = 0;
    const old = which.texture.value; which.texture.value = null; old?.dispose();
    if (!src) { wake(); return; }
    const abort = new AbortController(); which.abort = abort;
    void (async () => {
      try {
        const response = await fetch(resolveImage(src), { signal: abort.signal, mode: "cors", credentials: "same-origin" });
        if (!response.ok) return;
        const blob = await response.blob(); if (blob.size > 12 * 1024 * 1024) return;
        let image: ImageBitmap | HTMLImageElement;
        try { image = await createImageBitmap(blob); }
        catch {
          const url = URL.createObjectURL(blob), element = new Image();
          try { element.src = url; await element.decode(); image = element; }
          finally { URL.revokeObjectURL(url); }
        }
        try {
          if (abort.signal.aborted || which.src !== src) return;
          const limit = lowPower ? 1024 : 2048, shrink = Math.min(1, limit / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * shrink)); canvas.height = Math.max(1, Math.round(image.height * shrink));
          const context = canvas.getContext("2d", { willReadFrequently: false })!;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          // A small sample tells a transparent PNG from a flat picture, and light paper from dark.
          const probe = document.createElement("canvas"); probe.width = probe.height = 32;
          const probeContext = probe.getContext("2d", { willReadFrequently: true })!;
          probeContext.drawImage(canvas, 0, 0, 32, 32);
          const pixels = probeContext.getImageData(0, 0, 32, 32).data;
          let see = 0, bright = 0;
          for (let i = 0; i < pixels.length; i += 4) { if (pixels[i + 3] < 200) see++; bright += (.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]) / 255; }
          const total = pixels.length / 4;
          which.ink.value.set(see / total < .02 ? 1 : 0, bright / total > .55 ? 1 : 0);
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
          if (wrap) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          else if (which === maps.edge) texture.wrapS = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          which.texture.value = texture; which.aspect.value = canvas.width / canvas.height; which.ready.value = 1;
          wake();
        } finally { releaseDiscImage(image); }
      } catch { /* A missing or blocked image leaves the layer empty; the glass itself carries on. */ }
    })();
  }

  let frost: HTMLElement | null = null, frostKey = "", frostOpacity = -1, frostShown = false;
  const point = new THREE.Vector3();
  return {
    setFrostLayer(element: HTMLElement | null) { frost = element; frostKey = ""; frostOpacity = -1; frostShown = false; },
    /** Tells the clear pane whether to keep drawing its own rim and marks, and the outline to cut. */
    update(dt: number, settle: Settle, time: number, motionAllowed: boolean) {
      load(maps.pattern, controls.patternKind === "image" ? controls.patternImage : "", true);
      load(maps.edge, controls.edgeStyle === "image" ? controls.edgeImage : "", false);
      load(maps.picture, controls.pictureImage, false);
      rendered.amount = settle(rendered.amount, controls.glassEffectAmount, dt, 12);
      rendered.scale = settle(rendered.scale, controls.glassEffectScale, dt, 12);
      rendered.patternAmount = settle(rendered.patternAmount, controls.patternAmount, dt, 12);
      rendered.patternScale = settle(rendered.patternScale, controls.patternScale, dt, 12);
      rendered.edgeWidth = settle(rendered.edgeWidth, controls.edgeWidth, dt, 12);
      rendered.edgeBrightness = settle(rendered.edgeBrightness, controls.edgeBrightness, dt, 12);
      rendered.markSize = settle(rendered.markSize, controls.ringMarkSize, dt, 12);
      rendered.pictureSize = settle(rendered.pictureSize, controls.pictureSize, dt, 12);
      rendered.pictureDistance = settle(rendered.pictureDistance, controls.pictureDistance, dt, 12);
      rendered.pictureAngle = settle(rendered.pictureAngle, controls.pictureAngle, dt, 12);
      rendered.pictureRotation = settle(rendered.pictureRotation, controls.pictureRotation, dt, 12);
      rendered.pictureOpacity = settle(rendered.pictureOpacity, controls.pictureOpacity, dt, 12);
      uniform.effect.value = EFFECT_ID[controls.glassEffect]; uniform.effectAmount.value = rendered.amount; uniform.effectScale.value = rendered.scale;
      if (motionAllowed) uniform.flowTime.value = time * controls.glassEffectFlow;
      uniform.patternKind.value = PATTERN_ID[controls.patternKind]; uniform.patternAmount.value = rendered.patternAmount; uniform.patternScale.value = rendered.patternScale;
      uniform.patternColor.value.set(controls.patternColor); uniform.patternGlass.value = controls.patternGlass; uniform.patternCover.value = controls.patternFit === "cover" ? 1 : 0;
      // An edge image still loading (or never chosen) must not leave the disc with no edge at all.
      const edgeReady = controls.edgeStyle !== "image" || maps.edge.ready.value > 0;
      const edge = edgeReady ? EDGE_ID[controls.edgeStyle] : 0;
      uniform.edgeKind.value = edge; uniform.edgeWidth.value = rendered.edgeWidth; uniform.edgeRepeats.value = controls.edgeRepeats;
      uniform.edgeBrightness.value = rendered.edgeBrightness; uniform.edgeColor.value.set(controls.edgeColor); uniform.edgeGlass.value = controls.edgeGlass;
      const shaped = edge === 6 || edge === 7;
      uniform.edgeShape.value.set(shaped ? .012 + rendered.edgeWidth * .024 : 0, controls.edgeRepeats, edge === 7 ? 1 : 0);
      const classicMarks = edge === 0 && controls.ringMarks === 2 && controls.ringMarkSize === 1;
      uniform.markCount.value = classicMarks ? 0 : controls.ringMarks; uniform.markSize.value = rendered.markSize;
      const picture = !!controls.pictureImage;
      const angle = THREE.MathUtils.degToRad(rendered.pictureAngle);
      uniform.pictureOn.value = picture ? 1 : 0; uniform.pictureSize.value = rendered.pictureSize; uniform.pictureOpacity.value = rendered.pictureOpacity;
      uniform.pictureCentre.value.set(Math.cos(angle) * rendered.pictureDistance, Math.sin(angle) * rendered.pictureDistance);
      uniform.pictureTurn.value = THREE.MathUtils.degToRad(rendered.pictureRotation); uniform.pictureGlass.value = controls.pictureGlass; uniform.pictureFollow.value = controls.pictureFollow;
      mesh.visible = controls.glassEffect !== "clear" || controls.patternKind !== "none" || edge !== 0 || !classicMarks || picture;
      return { classicEdge: edge === 0, classicMarks, shape: uniform.edgeShape.value };
    },
    /** Liquid keeps moving even if the disc and rays are set to stand still. */
    animating() { return controls.glassEffect === "liquid" && controls.glassEffectFlow > 0 && controls.glassEffectAmount > 0; },
    setSpin(value: number) { uniform.spin.value = value; },
    /** Keeps the real blur of the page behind the canvas exactly under the projected glass. */
    syncFrost(tilt: THREE.Object3D, camera: THREE.Camera, width: number, height: number, opacity: number, ready: boolean) {
      if (!frost) return;
      const blur = ready ? BACKDROP_BLUR[controls.glassEffect] * rendered.amount * (lowPower ? .6 : 1) : 0;
      if (blur < .25) { if (frostShown) { frost.style.display = "none"; frostShown = false; } return; }
      if (!frostShown) { frost.style.display = "block"; frostShown = true; frostKey = ""; frostOpacity = -1; }
      const m = tilt.matrixWorld.elements;
      const key = `${width}|${height}|${blur.toFixed(1)}|${m[0].toFixed(4)}|${m[1].toFixed(4)}|${m[5].toFixed(4)}|${m[12].toFixed(3)}|${m[13].toFixed(3)}`;
      if (key !== frostKey) {
        frostKey = key;
        const points: string[] = [];
        for (let i = 0; i < 72; i++) {
          const a = i / 72 * Math.PI * 2;
          point.set(Math.cos(a) * GLASS_RADIUS, Math.sin(a) * GLASS_RADIUS, 0).applyMatrix4(tilt.matrixWorld).project(camera);
          points.push(`${((point.x * .5 + .5) * width).toFixed(1)}px ${((.5 - point.y * .5) * height).toFixed(1)}px`);
        }
        frost.style.clipPath = `polygon(${points.join(",")})`;
        const filter = `blur(${blur.toFixed(1)}px) saturate(1.12)`;
        frost.style.backdropFilter = filter; frost.style.setProperty("-webkit-backdrop-filter", filter);
      }
      if (Math.abs(opacity - frostOpacity) > .004) { frostOpacity = opacity; frost.style.opacity = opacity.toFixed(3); }
    },
    dispose() {
      for (const which of Object.values(maps)) { which.abort?.abort(); which.src = ""; which.texture.value?.dispose(); which.texture.value = null; }
      disc.remove(mesh); material.dispose(); geometry.dispose();
    },
  };
}

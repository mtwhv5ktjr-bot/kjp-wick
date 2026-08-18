/* KJP — 3D POST: BLOOM.
 *
 * The neon relight put cyan and magenta tubes on every ceiling and left them
 * flat — bright pixels with no glow are just bright pixels. Bloom is what makes
 * a light source read as EMITTING. This is the standard three-target chain:
 *
 *   scene → [full RT] → threshold+downsample → [W/4] → blur H → [W/4] → blur V
 *         → additive composite back over the scene → blit to the 2D canvas
 *
 * Runs INSIDE r3dFrame, before the g.drawImage blit — so the 2D HUD, subtitles
 * and post grade never bloom. Only pre-authored HDR emissives (tubes, monitors,
 * exit signs, the Director's pulse) pass the threshold; ordinary lit walls do
 * not, or the whole frame hazes over — the failure that makes bloom look cheap.
 * Gated on OPT.bloom, which the quality governor may switch off. Bloom targets
 * live at pixelRatio 1 regardless of the main renderer — a 4x downsample of a
 * 2x-DPR frame is still plenty for a blur.
 */
"use strict";

const R3DP = { ready: false, rtScene: null, rtA: null, rtB: null, quad: null, cam: null,
               matThresh: null, matBlur: null, matComp: null, w: 0, h: 0 };

const _VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const _FS_THRESH = `
  precision highp float; varying vec2 vUv; uniform sampler2D tex; uniform float thr;
  void main(){
    vec3 c = texture2D(tex, vUv).rgb;
    float l = max(max(c.r, c.g), c.b);
    /* soft knee: nothing under thr, full above thr+0.4 — a hard cut flickers */
    float k = smoothstep(thr, thr + 0.4, l);
    gl_FragColor = vec4(c * k, 1.0);
  }`;
const _FS_BLUR = `
  precision highp float; varying vec2 vUv; uniform sampler2D tex; uniform vec2 dir;
  void main(){
    /* 9-tap gaussian, separable */
    vec3 s = texture2D(tex, vUv).rgb * 0.227;
    s += (texture2D(tex, vUv + dir * 1.0).rgb + texture2D(tex, vUv - dir * 1.0).rgb) * 0.194;
    s += (texture2D(tex, vUv + dir * 2.0).rgb + texture2D(tex, vUv - dir * 2.0).rgb) * 0.121;
    s += (texture2D(tex, vUv + dir * 3.0).rgb + texture2D(tex, vUv - dir * 3.0).rgb) * 0.054;
    s += (texture2D(tex, vUv + dir * 4.0).rgb + texture2D(tex, vUv - dir * 4.0).rgb) * 0.016;
    gl_FragColor = vec4(s, 1.0);
  }`;
/* The composite does its OWN tone mapping + sRGB encode. Letting three.js
   tone-map a ShaderMaterial output and then also encode the render target as
   sRGB double-darkened the frame — the bloomed path measured DARKER than the
   direct one (luma 24 vs 40). Now the scene target holds pure linear HDR, and
   this shader applies ACES then the sRGB curve exactly once, matching the
   direct path's exposure. */
/* v2.0.72-75 the composite grew a small grade suite that the canvas post
   cannot do per-pixel in linear space: chromatic aberration that swells with
   damage, a per-district lift/gamma/gain grade, fine film grain, and a filmic
   vignette. Uniforms drive them from the sim each frame. */
const _FS_COMP = `
  precision highp float; varying vec2 vUv;
  uniform sampler2D scene; uniform sampler2D bloom;
  uniform float amt, expo, aberr, grain, vig, time;
  uniform vec3 lift, gain;
  vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
  vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    /* v2.0.72 chromatic aberration — R/B split radially, growing with the
       aberr uniform (set by damage). Zero when unhurt, so it costs nothing
       visually until it means something. */
    vec2 dir = uv - 0.5;
    float ab = aberr * (0.004 + dot(dir, dir) * 0.02);
    vec3 c;
    c.r = texture2D(scene, uv - dir * ab).r;
    c.g = texture2D(scene, uv).g;
    c.b = texture2D(scene, uv + dir * ab).b;
    vec3 b = texture2D(bloom, uv).rgb;
    vec3 hdr = (c + b * amt) * expo;
    vec3 col = srgb(aces(hdr));
    /* v2.0.73 grade: lift raises shadows toward a tint, gain scales highlights —
       a cheap two-point grade, per district */
    col = col * gain + lift * (1.0 - col);
    /* v2.0.74 film grain — per-pixel, animated, subtle */
    col += (hash(uv * 900.0 + time) - 0.5) * grain;
    /* v2.0.75 filmic vignette — darkens the corners smoothly */
    col *= 1.0 - vig * dot(dir, dir) * 1.4;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

function r3dPostInit(){
  if (R3DP.ready) return true;
  const w = W, h = H;
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
                 type: THREE.HalfFloatType || THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false };
  R3DP.rtScene = new THREE.WebGLRenderTarget(w, h, opts);
  const q = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
              type: opts.type, depthBuffer: false, stencilBuffer: false };
  R3DP.rtA = new THREE.WebGLRenderTarget(w >> 2, h >> 2, q);
  R3DP.rtB = new THREE.WebGLRenderTarget(w >> 2, h >> 2, q);
  R3DP.matThresh = new THREE.ShaderMaterial({ vertexShader: _VS, fragmentShader: _FS_THRESH,
    uniforms: { tex: { value: null }, thr: { value: 0.72 } }, depthTest: false, depthWrite: false });
  R3DP.matBlur = new THREE.ShaderMaterial({ vertexShader: _VS, fragmentShader: _FS_BLUR,
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2(1 / (w >> 2), 0) } }, depthTest: false, depthWrite: false });
  R3DP.matComp = new THREE.ShaderMaterial({ vertexShader: _VS, fragmentShader: _FS_COMP,
    uniforms: { scene: { value: null }, bloom: { value: null }, amt: { value: 1.15 }, expo: { value: 1.55 },
      aberr: { value: 0 }, grain: { value: 0.028 }, vig: { value: 0.28 }, time: { value: 0 },
      lift: { value: new THREE.Color(0, 0, 0) }, gain: { value: new THREE.Color(1, 1, 1) } },
    depthTest: false, depthWrite: false, toneMapped: false });
  R3DP.matThresh.toneMapped = false; R3DP.matBlur.toneMapped = false;
  R3DP.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), R3DP.matThresh);
  R3DP.quad.frustumCulled = false;
  R3DP.scene2 = new THREE.Scene(); R3DP.scene2.add(R3DP.quad);
  R3DP.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R3DP.w = w; R3DP.h = h; R3DP.ready = true;
  return true;
}

/* Full frame with bloom. Returns false if bloom is off so the caller renders
   plainly — the direct path stays bit-identical to pre-bloom. */
function r3dPostRender(){
  if (!OPT.bloom || !r3dPostInit()) return false;
  const R = R3D.renderer;
  const bakTM = R.toneMapping;
  /* 1: scene into an HDR target — tone mapping OFF here so bright emissives keep
     values >1 for the threshold to find. Mapping is applied at composite. */
  R.toneMapping = THREE.NoToneMapping;
  /* linear working space for the whole chain — the composite encodes sRGB
     itself, once. Output colour space is restored before returning. */
  const bakCS = R.outputColorSpace;
  if (THREE.LinearSRGBColorSpace) R.outputColorSpace = THREE.LinearSRGBColorSpace;
  R.setRenderTarget(R3DP.rtScene);
  R.render(R3D.scene, R3D.cam);
  /* 2: threshold + downsample */
  R3DP.quad.material = R3DP.matThresh;
  R3DP.matThresh.uniforms.tex.value = R3DP.rtScene.texture;
  R.setRenderTarget(R3DP.rtA); R.render(R3DP.scene2, R3DP.cam);
  /* 3: blur H, then V */
  R3DP.quad.material = R3DP.matBlur;
  R3DP.matBlur.uniforms.tex.value = R3DP.rtA.texture; R3DP.matBlur.uniforms.dir.value.set(1 / (R3DP.w >> 2), 0);
  R.setRenderTarget(R3DP.rtB); R.render(R3DP.scene2, R3DP.cam);
  R3DP.matBlur.uniforms.tex.value = R3DP.rtB.texture; R3DP.matBlur.uniforms.dir.value.set(0, 1 / (R3DP.h >> 2));
  R.setRenderTarget(R3DP.rtA); R.render(R3DP.scene2, R3DP.cam);
  /* 4: composite to the canvas — the shader tone-maps and encodes itself */
  R3DP.quad.material = R3DP.matComp;
  R3DP.matComp.uniforms.scene.value = R3DP.rtScene.texture;
  R3DP.matComp.uniforms.bloom.value = R3DP.rtA.texture;
  R3DP.matComp.uniforms.expo.value = R.toneMappingExposure || 1.55;   // set below, read here
  /* drive the grade from the sim: aberration from recent damage, and a
     per-district lift/gain grade from the theme's own grade colours */
  const u = R3DP.matComp.uniforms;
  u.aberr.value = OPT.reduceMotion ? 0 : ((typeof P !== "undefined" && P && P.hurtT > 0) ? Math.min(1, P.hurtT * 2.2) : (u.aberr.value * 0.9));
  u.time.value = (u.time.value + 0.017) % 1000;
  try {
    const th = themeOf();
    const lo = th.gradeLo && r3dRgb ? new THREE.Color(r3dRgb(th.gradeLo)) : new THREE.Color(0, 0, 0);
    u.lift.value.setRGB(lo.r * 0.5, lo.g * 0.5, lo.b * 0.5);
    u.gain.value.setRGB(1.04, 1.02, 1.06);          // a touch cool in the highlights — the cyberpunk tilt
  } catch(e){}
  u.grain.value = (OPT.grain === 0 || OPT.reduceMotion) ? 0 : 0.028;
  u.vig.value = 0.26;
  R.setRenderTarget(null); R.render(R3DP.scene2, R3DP.cam);
  R.toneMapping = bakTM;
  R.outputColorSpace = bakCS;
  return true;
}

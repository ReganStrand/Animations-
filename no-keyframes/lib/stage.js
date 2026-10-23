// stage.js: the 3-D world of No Keyframes (three.js), drawn into the film's 2-D canvas.
//
// One renderer, one scene, one camera. Everything in the scene is set from t on every call (the film
// is a pure function of time). Antialiasing comes from the motion-blur accumulation: the camera is
// jittered by a sub-pixel per sample (Halton 2,3), because MSAA costs ~3x in software WebGL.
//
// The world: a near-black void, a polished floor that reflects (three's Reflector, half-res target,
// blurred and fresnel-weighted in our own shader, with light pools and impact rings), studio light
// from a procedural softbox environment, volumetric beams, lit dust, and Anton glyphs extruded in 3-D.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import * as M from './motion.js';

export { THREE };
export const HEX = { ink: 0x0c0d0e, paper: 0xf0ece4, red: 0xe22822 };
export let R = null, scene = null, camera = null, FONT = null, ENV = null, floor = null, KEY = null, FILL = null;
export const MAT = {};
// portrait frames sit further from wide words (narrow horizontal view): thinner fog keeps them readable
const FOG_DENSITY = M.FORMAT.portrait ? 0.025 : 0.034;

// ------------------------------------------------------------------ init

export async function init({ font }) {
  const cv = document.createElement('canvas');
  cv.width = M.W; cv.height = M.H;
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  R.setPixelRatio(1);
  R.setSize(M.W, M.H, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  // A shoulder only: identity below 0.72 so the void and fog stay exactly brand black (Neutral's toe
  // crushed them below the clear colour and drew a horizon), Neutral-style roll-off above so the
  // red stays red (ACES pushes it to orange) and highlights desaturate gently to white.
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
      color *= toneMappingExposure;
      float peak = max( color.r, max( color.g, color.b ) );
      const float s = 0.72;
      if ( peak <= s ) return color;
      float d = 1.0 - s;
      float newPeak = 1.0 - d * d / ( peak + d - s );
      vec3 c = color * ( newPeak / peak );
      float g = 1.0 - 1.0 / ( 0.14 * ( peak - newPeak ) + 1.0 );
      return mix( c, vec3( newPeak ), g );
    }`);
  R.toneMapping = THREE.CustomToneMapping;
  R.toneMappingExposure = 1.0;
  R.localClippingEnabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(HEX.ink);
  scene.fog = new THREE.FogExp2(HEX.ink, FOG_DENSITY);
  camera = new THREE.PerspectiveCamera(30, M.W / M.H, 0.05, 400);

  const pmrem = new THREE.PMREMGenerator(R);
  ENV = studioEnv(pmrem);
  makeMaterials();
  KEY = new THREE.DirectionalLight(0xfff1e2, 1.6);
  KEY.position.set(-4, 7, 9);
  FILL = new THREE.DirectionalLight(0xffe2cc, 0.55);
  FILL.position.set(6, 2, 4);
  scene.add(KEY, FILL, KEY.target, FILL.target);
  floor = makeFloor();
  scene.add(floor);
  FONT = new Font(await new Promise((res, rej) => new TTFLoader().load(font, res, undefined, rej)));
}

// Softboxes around a dark room, prefiltered once. Warm key high front-left, two strip rims behind,
// a faint top fill and a dim warm floor bounce: bevels catch a bright edge, faces read off-white.
function studioEnv(pmrem) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x030303);
  const panel = (w, h, hex, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(9, 4, 0xfff0e0, 4.2, [-5, 7, 6]);
  panel(1.4, 11, 0xffe4cc, 3.4, [8, 3, -3]);
  panel(1.4, 11, 0xfff6ee, 1.8, [-8, 2.5, -4]);
  panel(16, 3, 0xffffff, 0.35, [0, 9, -8]);
  panel(40, 40, 0x2b2622, 0.45, [0, -7, 0]);
  const tex = pmrem.fromScene(s, 0.03).texture;
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

// [face, side] material pairs for TextGeometry's two groups (caps, extrusion walls)
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: ENV, ...o });
  MAT.paper = [std({ color: HEX.paper, roughness: 0.5, metalness: 0.0, envMapIntensity: 1.35 }),
    std({ color: 0x9a948b, roughness: 0.28, metalness: 0.35, envMapIntensity: 1.5 })];
  MAT.red = [std({ color: HEX.red, emissive: HEX.red, emissiveIntensity: 0.32, roughness: 0.42, envMapIntensity: 0.55 }),
    std({ color: 0x7c140f, emissive: 0x4a0b08, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.25, envMapIntensity: 0.9 })];
  MAT.graphite = [std({ color: 0x77767a, roughness: 0.3, metalness: 0.35, envMapIntensity: 1.6 }),
    std({ color: 0x36363a, roughness: 0.22, metalness: 0.6, envMapIntensity: 1.5 })];
  MAT.paperDim = [std({ color: 0xb5b0a7, roughness: 0.5, envMapIntensity: 0.8 }),
    std({ color: 0x5c5852, roughness: 0.3, metalness: 0.35, envMapIntensity: 0.9 })];
  MAT.slab = std({ color: 0x141517, roughness: 0.34, metalness: 0.45, envMapIntensity: 0.65 });
  MAT.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX.red).multiplyScalar(3.0) });
  MAT.white = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4e8).multiplyScalar(2.2) });
  for (const v of Object.values(MAT)) for (const m of [v].flat()) lit(m);
}

// Every lit material, with its base levels, so the whole world can be dimmed (setLight) without
// touching exposure (exposure would also move the fog away from the clear colour).
const LIT = new Set();
function lit(m) {
  if (!m.isMeshStandardMaterial) return m;
  m.userData.env0 = m.envMapIntensity;
  LIT.add(m);
  return m;
}
export function setLight(k) {
  KEY.intensity = 1.6 * k;
  FILL.intensity = 0.55 * k;
  for (const m of LIT) m.envMapIntensity = m.userData.env0 * k;
  floor.material.uniforms.uLight.value = 0.35 + 0.65 * k;
}

// A copy of a material pair whose back faces glow (the inside of a cut glyph reads red-hot) and that
// clips against its own planes; used for the halves of sliced type.
export function cutMaterials(pair, hot = 0xff3a1e) {
  return pair.map((m) => {
    const c = m.clone();
    c.side = THREE.DoubleSide;
    c.clippingPlanes = [new THREE.Plane()];
    const hc = new THREE.Color(hot).multiplyScalar(2.4);
    c.onBeforeCompile = (sh) => {
      sh.uniforms.uHot = { value: hc };
      sh.fragmentShader = 'uniform vec3 uHot;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(uHot, 1.0);\n');
    };
    c.customProgramCacheKey = () => 'hotcut';
    return lit(c);
  });
}

// ------------------------------------------------------------------ floor

const FloorShader = {
  name: 'NKFloor',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uBase: { value: new THREE.Color(0x0e0f10) },
    uRefl: { value: 0.5 }, uBlur: { value: 2.6 }, uTexel: { value: new THREE.Vector2(2 / 1920, 2 / 1080) },
    uPool: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uPoolR: { value: [3, 3, 3, 3] },
    uPoolColor: { value: new THREE.Color(0xfff0dc) },
    uRing: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uRingColor: { value: new THREE.Color(0xfff3e6) },
    uFogColor: { value: new THREE.Color(HEX.ink) }, uFogDensity: { value: FOG_DENSITY },
    uLight: { value: 1 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vWorld; varying float vDepth;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      vec4 mv = viewMatrix * w;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 color;
    uniform vec3 uBase; uniform float uRefl; uniform float uBlur; uniform vec2 uTexel;
    uniform vec4 uPool[4]; uniform float uPoolR[4]; uniform vec3 uPoolColor;
    uniform vec4 uRing[4]; uniform vec3 uRingColor;
    uniform vec3 uFogColor; uniform float uFogDensity; uniform float uLight;
    varying vec4 vUv; varying vec3 vWorld; varying float vDepth;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = 0.05 + 0.95 * pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
      float n1 = vnoise(vWorld.xz * 0.33), n2 = vnoise(vWorld.xz * 2.9 + 13.1);
      // polished-concrete micro-roughness: wobble the reflection lookup a little
      vec2 wob = (vec2(vnoise(vWorld.xz * 0.6 + 3.7), vnoise(vWorld.xz * 0.6 + 9.2)) - 0.5) * 0.005;
      vec4 uv = vUv; uv.xy += wob * uv.w;
      vec3 r = texture2DProj(tDiffuse, uv).rgb * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + 0.39;
        vec2 o = vec2(cos(a), sin(a)) * uTexel * uBlur * uv.w;
        r += texture2DProj(tDiffuse, vec4(uv.xy + o, uv.zw)).rgb * 0.1;
      }
      vec3 lit = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        float d = length(vWorld.xz - uPool[i].xz);
        lit += uPoolColor * uPool[i].w * exp(-d * d / (uPoolR[i] * uPoolR[i]));
      }
      vec3 base = uBase * (0.8 + 0.4 * n1) * (0.94 + 0.12 * n2) * uLight;
      vec3 col = base * (1.0 + lit * 5.0) + lit * 0.018;
      col += r * mix(0.08, 0.8, fres) * uRefl * (0.8 + 0.4 * n1);
      for (int i = 0; i < 4; i++) {
        float d = length(vWorld.xz - uRing[i].xy);
        float w = uRing[i].z;
        col += uRingColor * uRing[i].w * exp(-pow((d - w) / (0.03 + w * 0.09), 2.0));
      }
      float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

function makeFloor() {
  const f = new Reflector(new THREE.PlaneGeometry(600, 600), {
    textureWidth: Math.round(M.W / 2), textureHeight: Math.round(M.H / 2), clipBias: 0.002, shader: FloorShader, multisample: 0,
  });
  f.rotation.x = -Math.PI / 2;
  f.material.uniforms.uTexel.value.set(2 / M.W, 2 / M.H);
  return f;
}
export const floorU = () => floor.material.uniforms;

// ------------------------------------------------------------------ atmosphere

// Dust: points drifting through a box; brighter inside the light beams, bokeh-dim when big (near the lens).
export function makeDust({ n = 2400, center = [0, 2, 0], size = [30, 5, 30], seed = 7, scale = 1 } = {}) {
  const rnd = M.mulberry32(seed);
  const pos = new Float32Array(n * 3), sd = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = center[0] + (rnd() - 0.5) * size[0];
    pos[i * 3 + 1] = center[1] + (rnd() - 0.5) * size[1];
    pos[i * 3 + 2] = center[2] + (rnd() - 0.5) * size[2];
    sd[i * 3] = rnd(); sd[i * 3 + 1] = rnd(); sd[i * 3 + 2] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(sd, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 1 }, uSize: { value: 0.016 * scale }, uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(0xfff1e4) },
      uBeamA: { value: [0, 1, 2].map(() => new THREE.Vector4()) }, uBeamD: { value: [0, 1, 2].map(() => new THREE.Vector4()) },
    },
    vertexShader: /* glsl */`
      attribute vec3 seed;
      uniform float uTime, uScale, uSize;
      uniform vec4 uBeamA[3]; uniform vec4 uBeamD[3];
      varying float vA;
      void main() {
        vec3 p = position;
        float tt = uTime + seed.x * 40.0;
        p += vec3(sin(tt * 0.31 + seed.y * 6.28) * 0.35, sin(tt * 0.23 + seed.z * 6.28) * 0.22 + 0.04 * uTime, cos(tt * 0.27 + seed.x * 6.28) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = max(-mv.z, 0.05);
        float s = uSize * (0.35 + 1.3 * seed.y * seed.y);
        float px = s * uScale / depth;
        gl_PointSize = clamp(px, 1.0, 160.0);
        // inside a beam (apex a, unit direction d, cone half-angle tan in d.w): lit
        vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
        float lit = 0.12;
        for (int i = 0; i < 3; i++) {
          vec3 rel = wp - uBeamA[i].xyz;
          float along = dot(rel, uBeamD[i].xyz);
          float rad = length(rel - along * uBeamD[i].xyz);
          float cone = max(along, 0.0) * uBeamD[i].w + 0.05;
          lit += uBeamA[i].w * smoothstep(1.0, 0.35, rad / cone) * step(0.0, along);
        }
        // energy spread: a big (defocused) mote is dimmer per pixel; tiny ones twinkle a little
        vA = 1.8 * lit * clamp(4.0 / (px * px), 0.015, 1.0) * (0.55 + 0.45 * sin(tt * 1.7 + seed.z * 9.0));
        vA *= smoothstep(0.15, 0.6, depth);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.55, d) * vA * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// A volumetric shaft: an open cone, additive, brightest along its axis as seen from the camera.
export function makeBeam({ apex, target, r0 = 0.15, r1 = 2.4, color = 0xfff0de, intensity = 0.22 }) {
  const a = new THREE.Vector3(...apex), b = new THREE.Vector3(...target);
  const h = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r0, r1, h, 64, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: intensity }, uColor: { value: new THREE.Color(color) }, uH: { value: h } },
    vertexShader: /* glsl */`
      uniform float uH; varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = -position.y / uH;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uI; uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float fall = smoothstep(0.0, 0.12, vY) * (1.0 - 0.55 * vY) * smoothstep(1.02, 0.85, vY);
        gl_FragColor = vec4(uColor * uI * edge * fall, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  m.userData.beam = { apex: a, dir: b.clone().sub(a).normalize(), tan: (r1 - r0) / h };
  return m;
}

// ------------------------------------------------------------------ type

const geoCache = new Map();
// One glyph, pivot at the bottom centre of its ink on the baseline (rises from the floor, lands on it).
export function glyphGeo(ch, size, depth, bevel = size * 0.018, curve = 7) {
  const key = `${ch}|${size}|${depth}|${bevel}|${curve}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new TextGeometry(ch, { font: FONT, size, depth, curveSegments: curve, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel * 0.75, bevelOffset: 0, bevelSegments: 2 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  g.translate(-cx, 0, -cz);
  g.computeBoundingSphere();
  g.userData = { cx, w: b.max.x - b.min.x, top: b.max.y, bottom: b.min.y };
  geoCache.set(key, g);
  return g;
}
const adv = (ch, size) => ((FONT.data.glyphs[ch] || FONT.data.glyphs.H).ha * size) / FONT.data.resolution;
export const capHeight = (size) => glyphGeo('H', size, 0.01, 0).userData.top;

// A word (or line) as one mesh per glyph, centred on x, baseline at y = 0, depth centred on z = 0.
// glyphs[i] = { mesh, ch, home: Vector3, w } so each letter can move on its own clock.
export function word3D(str, { size = 1, depth = 0.3, track = 0.015, mat = MAT.paper, bevel, align = 'center' } = {}) {
  const group = new THREE.Group();
  const items = [];
  let x = 0;
  for (const ch of str) {
    if (ch !== ' ') {
      const geo = glyphGeo(ch, size, depth, bevel);
      items.push({ ch, geo, x: x + geo.userData.cx });
    }
    x += adv(ch, size) + track * size;
  }
  const width = x - track * size;
  const off = align === 'left' ? 0 : align === 'right' ? -width : -width / 2;
  const glyphs = items.map((it) => {
    const mesh = new THREE.Mesh(it.geo, mat);
    mesh.position.set(it.x + off, 0, 0);
    group.add(mesh);
    return { mesh, ch: it.ch, home: mesh.position.clone(), w: it.geo.userData.w };
  });
  return { group, glyphs, width, height: capHeight(size), size };
}

// ------------------------------------------------------------------ camera + projection

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
// pos, look: [x,y,z]; fov: vertical degrees; roll: radians about the view axis
export function setCamera({ pos, look, fov = 30, roll = 0, up = [0, 1, 0] }) {
  camera.fov = fov;
  camera.aspect = M.W / M.H;
  camera.position.set(...pos);
  camera.up.set(...up).normalize();
  camera.lookAt(look[0], look[1], look[2]);
  if (roll) camera.rotateZ(roll);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
// Screen position of a world point and how many pixels one world unit spans there.
export function project(p) {
  _v.set(p[0], p[1], p[2]);
  const depth = -_v.clone().applyMatrix4(camera.matrixWorldInverse).z;
  _v.project(camera);
  const ppu = M.H / (2 * Math.tan((camera.fov * Math.PI) / 360) * Math.max(depth, 1e-3));
  return { x: (_v.x + 1) * 0.5 * M.W, y: (1 - _v.y) * 0.5 * M.H, depth, ppu, onScreen: depth > 0 };
}
// Distance at which a w x h subject fills `fill` of the frame (whichever axis binds first).
export function fitDistance(w, h, fov = camera.fov, fill = 0.8) {
  const tv = Math.tan((fov * Math.PI) / 360), th = tv * (M.W / M.H);
  return Math.max(w / (2 * th * fill), h / (2 * tv * fill));
}

// ------------------------------------------------------------------ render

const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const JIT = Array.from({ length: 64 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

export function renderTo(ctx, { alpha = 1 } = {}) {
  const s = M.SAMPLE;
  if (s.n > 1) {
    const [jx, jy] = JIT[s.k % JIT.length];
    camera.setViewOffset(M.W, M.H, jx, jy, M.W, M.H);
  } else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  R.render(scene, camera);
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(R.domElement, 0, 0);
  ctx.restore();
}

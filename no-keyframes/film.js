// No Keyframes: Regan Strand's voice memo as a 3-D kinetic type film. Pure function of time:
// window.seek(t) paints frame t (lib/motion.js); the 3-D world is lib/stage.js.
// Words land on their spoken times (lyrics.json, forced-aligned to audio/vo.wav); camera moves
// and accents are placed against those same times. docs/shotlist.md is the plan.
import * as M from './lib/motion.js';
import * as S from './lib/stage.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const { THREE } = S;
const { W, H, FORMAT, clamp, lerp, E } = M;
const P = FORMAT.portrait;
// a wider lens in portrait: the narrow frame would otherwise put wide words far away, deep in the fog
const FOV0 = P ? 38 : 30;

// ---------------------------------------------------------------- brand
const C = { ink: '#0C0D0E', paper: '#F0ECE4', red: '#E22822' };
const DISPLAY = 'Display', UI = 'UI';
// the prompt this film was made from (Regan's own words), typed on in shot 11
const PROMPT_TEXT = 'build a super high ultra clean detailed motion vfx typography animation';

// ---------------------------------------------------------------- the words, as spoken
const LYR = await fetch('lyrics.json').then((r) => r.json());
const WORDS = LYR.lines.flatMap((l, li) => l.words.map((w, wi) => ({ ...w, line: li, i: wi, text: w.w.replace(/[.,?!—]/g, '') })));
function word(txt, near) {
  const c = WORDS.filter((w) => w.text.toLowerCase() === txt.toLowerCase());
  if (!c.length) throw new Error(`no word "${txt}" in lyrics.json`);
  return c.reduce((a, b) => (Math.abs(b.t0 - near) < Math.abs(a.t0 - near) ? b : a));
}
// a run of spoken words from `first` (near time) through `last`
function run(first, near, last) {
  const a = WORDS.indexOf(word(first, near));
  let b = a;
  while (WORDS[b].text.toLowerCase() !== last.toLowerCase()) b++;
  return WORDS.slice(a, b + 1);
}

// ---------------------------------------------------------------- time helpers (seconds)
const SPR = {
  rise: { stiffness: 300, damping: 23 },
  slam: { stiffness: 560, damping: 30 },
  snap: { stiffness: 420, damping: 27 },
  soft: { stiffness: 120, damping: 21 },
};
const spr = (t, t0, cfg = SPR.rise) => M.spring(t - t0, cfg);
const ramp = (t, a, b, f = E.inOutCubic) => f(clamp((t - a) / (b - a)));
const hash = (i, s = 1) => M.hash01(i, s);

// Hermite path through keys {t, pos, look, fov, roll, up?, stop}. Tangents are Catmull-Rom (velocity
// carries through a key) unless the key says stop (it eases in and out of it).
function path(keys) {
  const comp = (k) => [...k.pos, ...k.look, k.fov ?? FOV0, k.roll ?? 0, ...(k.up ?? [0, 1, 0])];
  const V = keys.map(comp), T = keys.map((k) => k.t), n = V.length;
  const tan = V.map((v, i) => {
    if (keys[i].stop) return v.map(() => 0);
    if (i === 0) return v.map((x, c) => ((V[1][c] - x) / (T[1] - T[0])) * (keys[0].carry ?? 0.5));
    if (i === n - 1) return v.map((x, c) => ((x - V[i - 1][c]) / (T[i] - T[i - 1])) * (keys[i].carry ?? 0.5));
    return v.map((x, c) => (V[i + 1][c] - V[i - 1][c]) / (T[i + 1] - T[i - 1]));
  });
  return (t) => {
    if (t <= T[0]) return unpack(V[0]);
    if (t >= T[n - 1]) return unpack(V[n - 1]);
    let i = 0;
    while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], s = (t - T[i]) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return unpack(V[i].map((a, c) => h00 * a + h10 * h * tan[i][c] + h01 * V[i + 1][c] + h11 * h * tan[i + 1][c]));
  };
}
const unpack = (v) => ({ pos: v.slice(0, 3), look: v.slice(3, 6), fov: v[6], roll: v[7], up: v.slice(8, 11) });

// ---------------------------------------------------------------- text in the world (Inter on a card)
function textCard(worldH, { w = 2048, h = 192 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const worldW = (worldH * w) / h;
  const geo = new THREE.PlaneGeometry(worldW, worldH);
  geo.translate(worldW / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  let last = null;
  return {
    mesh, c, w, h, worldW, worldH,
    paint(key, fn) { if (key === last) return; last = key; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); fn(c, w, h); tex.needsUpdate = true; },
  };
}
// What has been typed of a run of spoken words at t (each word types on over its first ~70 %).
function typedText(words, t, { lead = 0.02, cps = 34 } = {}) {
  let s = '';
  for (const w of words) {
    const a = w.t0 - lead;
    if (t < a) break;
    const dur = Math.max(0.04, Math.min((w.t1 - w.t0) * 0.7, w.w.length / cps));
    s += (s ? ' ' : '') + w.w.slice(0, Math.max(1, Math.ceil(clamp((t - a) / dur) * w.w.length)));
  }
  return s;
}
// Where the cursor sits (canvas px) after what has been typed at t: continuous between characters, so
// the motion blur draws a streak, not a ghost cursor at each step.
function cursorPx(c2d, words, t, { lead = 0.02, cps = 34 } = {}) {
  let done = '', px = 0;
  for (const w of words) {
    const a = w.t0 - lead;
    if (t < a) break;
    const dur = Math.max(0.04, Math.min((w.t1 - w.t0) * 0.7, w.w.length / cps));
    const f = clamp((t - a) / dur) * w.w.length, i = Math.floor(f);
    const pre = done ? done + ' ' : '';
    const base = i === 0 ? c2d.measureText(done).width : c2d.measureText(pre + w.w.slice(0, i)).width;
    const next = c2d.measureText(pre + w.w.slice(0, Math.min(i + 1, w.w.length))).width;
    px = base + (f - i) * (next - base);
    done = pre + w.w;
  }
  return px;
}
const cursorAt = (c2d, str, k) => {
  const f = k * str.length, i = Math.floor(f);
  const a = c2d.measureText(str.slice(0, i)).width, b = c2d.measureText(str.slice(0, Math.min(i + 1, str.length))).width;
  return a + (f - i) * (b - a);
};

// A typed Inter line in the world. align: where the card's origin sits relative to the text.
function typedLine(words, { worldH = 0.5, px = 112, align = 'left', w = 2048, h = 192, weight = 400 } = {}) {
  const card = textCard(worldH, { w, h });
  const font = `${weight} ${px}px ${UI}`;
  card.c.font = font;
  const full = card.c.measureText(words.map((x) => x.w).join(' ')).width;
  const x0 = align === 'left' ? 8 : align === 'center' ? (w - full) / 2 : w - full - 8;
  if (align !== 'left') card.mesh.geometry.translate(-(card.worldW * (align === 'center' ? 0.5 : 1)), 0, 0);
  return {
    mesh: card.mesh, card,
    update(t, opacity = 1) {
      const s = typedText(words, t);
      card.paint(s, (c) => { c.font = font; c.fillStyle = C.paper; c.textBaseline = 'middle'; c.fillText(s, x0, h / 2 + 4); });
      card.mesh.visible = s.length > 0 && opacity > 0;
      card.mesh.material.opacity = opacity;
    },
  };
}

// ---------------------------------------------------------------- 3-D type helpers
// Lines of Anton, stacked and centred: returns every glyph with its home in the group's space.
function lines3D(lines, { size = 1, depth = 0.3, mat = S.MAT.paper, lead = 0.24, align = 'center' } = {}) {
  const group = new THREE.Group();
  const words = lines.map((s) => S.word3D(s, { size, depth, mat, align }));
  const capH = words[0].height, step = capH + lead * size;
  words.forEach((w, i) => { w.group.position.y = (lines.length - 1 - i) * step; group.add(w.group); });
  const glyphs = words.flatMap((w, li) => w.glyphs.map((g) => ({ ...g, line: li, word: w })));
  return { group, words, glyphs, capH, width: Math.max(...words.map((w) => w.width)), height: (lines.length - 1) * step + capH, size };
}
// Rise through the floor, glyph by glyph (pivot on the baseline).
function riseGlyphs(glyphs, t, t0, { stagger = 0.032, drop = 1.7, size = 1, tilt = -0.32, cfg = SPR.rise } = {}) {
  glyphs.forEach((g, i) => {
    const k = spr(t, t0 + i * stagger, cfg);
    g.mesh.visible = k > 0;
    g.mesh.position.set(g.home.x, g.home.y + (k - 1) * drop * size, g.home.z);
    g.mesh.rotation.set((1 - k) * tilt, 0, 0);
  });
}
function slideGlyphs(glyphs, t, t0, { from = 6, stagger = 0.022, cfg = SPR.rise } = {}) {
  const n = glyphs.length;
  glyphs.forEach((g, i) => {
    const k = spr(t, t0 + (from > 0 ? n - 1 - i : i) * stagger, cfg);
    g.mesh.visible = k > 0;
    g.mesh.position.set(g.home.x + (1 - k) * from, g.home.y, g.home.z);
    g.mesh.rotation.set(0, (1 - k) * Math.sign(from) * 0.5, -(1 - k) * Math.sign(from) * 0.08);
  });
}
function popGlyphs(glyphs, t, t0, { stagger = 0.022, cfg = SPR.snap } = {}) {
  glyphs.forEach((g, i) => {
    const k = spr(t, t0 + i * stagger, cfg);
    g.mesh.visible = k > 0.001;
    const s = Math.max(k, 0.001);
    g.mesh.scale.set(s, s, s);
    g.mesh.position.copy(g.home);
    g.mesh.rotation.set(0, (1 - k) * 0.6, 0);
  });
}
const worldPos = (obj, local = [0, 0, 0]) => { obj.updateWorldMatrix(true, false); return new THREE.Vector3(...local).applyMatrix4(obj.matrixWorld); };

// ---------------------------------------------------------------- events the world shares
// Floor rings (impacts) and camera shakes, both keyed to spoken times.
const RINGS = [];   // {t, x, z, r, k}
const SHAKES = [];  // {t, amp, decay}
const ring = (t, p, r = 2.6, k = 0.5) => RINGS.push({ t, x: p.x, z: p.z, r, k });
const shake = (t, amp, decay = 0.18) => SHAKES.push({ t, amp, decay });

// ---------------------------------------------------------------- stations
const ST = {};
const LIST = [];
function station(name, build) { const s = build(); s.name = name; LIST.push(s); ST[name] = s; return s; }
function dustFor(center, size, n = 1600, seed = 1) {
  const d = S.makeDust({ n, center, size, seed });
  return d;
}

// A: the prompt line types on; CLAUDE CODE rises through the mirror floor (0 - 3 s)
function buildA() {
  const grp = new THREE.Group();
  const size = P ? 1.15 : 1.25, depth = 0.42;
  const T = lines3D(P ? ['CLAUDE', 'CODE'] : ['CLAUDE CODE'], { size, depth, lead: 0.28 });
  T.group.position.set(0, 0, -0.8);
  const line = run('this', 0.5, 'using');
  const L = typedLine(line, { worldH: 0.6 });
  const lx = P ? -1.45 : -2.35, ly = 0.5, lz = 2.9;
  L.mesh.position.set(lx, ly, lz);
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.46, 0.065), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.red).multiplyScalar(1.7) }));
  const beam = S.makeBeam({ apex: [-3.0, 9.5, 4.2], target: [-1.0, 0, 2.2], r0: 0.18, r1: 2.3, intensity: 0.22 });
  const dust = dustFor([0, 2.5, 1], [16, 5, 14], 1600, 11);
  grp.add(T.group, L.mesh, cursor, beam, dust);
  S.scene.add(grp);
  const wClaude = word('Claude', 1.4), wCode = word('Code', 2.1);
  const claudeG = T.glyphs.slice(0, 6), codeG = T.glyphs.slice(6);
  L.card.c.font = `400 112px ${UI}`;
  const lineEnd = ((L.card.c.measureText(line.map((w) => w.w).join(' ')).width + 26) / L.card.w) * L.card.worldW;
  ring(wClaude.t0 + 0.05, new THREE.Vector3(-1.5, 0, -0.8), 3.4, 0.35);
  return {
    grp, beams: [beam], dust: [dust], T, lx, ly, lz, lineEnd,
    pool: { x: -1.0, z: 2.2, r: 2.4, k: 0.16 },
    win: [0, 3.05],
    update(t) {
      riseGlyphs(claudeG, t, wClaude.t0 - 0.07, { size });
      riseGlyphs(codeG, t, wCode.t0 - 0.07, { size });
      const away = ramp(t, wClaude.t0 - 0.04, wClaude.t0 + 0.26, E.inCubic);
      L.update(t, 1 - away);
      L.mesh.position.y = ly - away * 0.6;
      L.card.c.font = `400 112px ${UI}`;
      const px = cursorPx(L.card.c, line, t) + 26;
      cursor.position.set(lx + (px / L.card.w) * L.card.worldW, ly - away * 0.6, lz);
      const typing = line.some((w) => t > w.t0 - 0.05 && t < w.t1 + 0.1);
      cursor.visible = (typing || (t * 1.8) % 1 < 0.6) && away < 0.9;
    },
  };
}

// B: MOTION / GRAPHICS / DESIGN, a tower of words that slide in on their spoken times (2.3 - 5.2 s)
function buildB() {
  const grp = new THREE.Group();
  const size = 0.95, depth = 0.36;
  const T = lines3D(['MOTION', 'GRAPHICS', 'DESIGN.'], { size, depth, lead: 0.2 });
  const at = [9.2, 0, -2.2];
  T.group.position.set(...at);
  const toDo = typedLine(run('to', 2.4, 'some'), { worldH: 0.85, align: P ? 'center' : 'right' });
  if (P) toDo.mesh.position.set(at[0], T.height + 0.5, at[2]);
  else toDo.mesh.position.set(at[0] - T.width / 2 - 0.3, T.height - T.capH * 0.5, at[2] + 0.2);
  const beam = S.makeBeam({ apex: [12.5, 10, 0.5], target: [9.2, 0, -1.2], r0: 0.2, r1: 2.6, intensity: 0.16 });
  const dust = dustFor([8, 2.5, -1], [14, 5, 12], 1200, 12);
  grp.add(T.group, toDo.mesh, beam, dust);
  S.scene.add(grp);
  const times = [word('motion', 3.1), word('graphics', 3.5), word('design', 4.0)];
  const tTo0 = word('to', 2.4).t0;
  return {
    grp, beams: [beam], dust: [dust], T, at, toDo,
    center: [at[0], T.height / 2, at[2]], pool: { x: at[0], z: at[2] + 1, r: 3.0, k: 0.09 },
    win: [2.3, 5.2],
    update(t) {
      T.words.forEach((w, i) => slideGlyphs(w.glyphs, t, times[i].t0 - 0.1, { from: i % 2 ? 7 : -7 }));
      toDo.update(t, ramp(t, tTo0 + 0.12, tTo0 + 0.2));
    },
  };
}

// C: I'M NOT / CREATING / ANYTHING, lying on the floor, seen from above; words drop onto it (5.2 - 8 s)
function buildC() {
  const grp = new THREE.Group();
  const block = new THREE.Group();
  const depth = 0.34;
  const sIm = 0.82, sNot = 1.5, sBig = P ? 0.92 : 1.12;
  const im = S.word3D("I'M", { size: sIm, depth, align: 'left' });
  const not = S.word3D('NOT', { size: sNot, depth, mat: S.MAT.red, align: 'left' });
  const cre = S.word3D('CREATING', { size: sBig, depth, align: 'left' });
  const any = S.word3D('ANYTHING', { size: sBig, depth, align: 'left' });
  const lead = 0.28;
  const yAny = 0, yCre = any.height + lead, yTop = yCre + cre.height + lead;
  im.group.position.set(0, yTop, 0);
  not.group.position.set(im.width + 0.22 * sIm, yTop, 0);
  cre.group.position.set(0, yCre, 0);
  any.group.position.set(0, yAny, 0);
  const bw = Math.max(im.width + 0.22 * sIm + not.width, cre.width, any.width), bh = yTop + not.height;
  for (const w of [im, not, cre, any]) { w.group.position.x -= bw / 2; w.group.position.y -= bh / 2; block.add(w.group); }
  block.rotation.x = -Math.PI / 2;
  const at = [16, 0.2, -12];
  block.position.set(...at);
  const dust = dustFor([16, 3, -12], [14, 6, 12], 900, 13);
  grp.add(block, dust);
  S.scene.add(grp);
  const items = [[im, word("I'm", 5.2)], [not, word('not', 5.4)], [cre, word('creating', 5.6)], [any, word('anything', 6.3)]];
  for (const [w, sw] of items) {
    const c = worldPos(w.group, [w.width / 2, w.height / 2, 0]);
    ring(sw.t0 + 0.06, c, w === not ? 3.0 : 2.0, w === not ? 0.14 : 0.08);
    shake(sw.t0 + 0.05, w === not ? 0.05 : 0.02);
  }
  return {
    grp, dust: [dust], at, bw, bh,
    pool: { x: at[0], z: at[2], r: 4.2, k: 0.12 },
    win: [5.15, 7.62],
    update(t) {
      for (const [w, sw] of items) {
        w.glyphs.forEach((g, i) => {
          const k = spr(t, sw.t0 - 0.12 + i * 0.022, SPR.slam);
          g.mesh.visible = k > 0;
          g.mesh.position.set(g.home.x, g.home.y, g.home.z + (1 - k) * 6);   // local z = world up
          const s = 1 + (1 - k) * 0.25;
          g.mesh.scale.set(s, s, s);
        });
      }
    },
  };
}

// D: AFTER EFFECTS in graphite flies in from the dark, then a red line slices it and the halves fall (7 - 10.6 s)
function buildD() {
  const grp = new THREE.Group();
  const size = P ? 1.2 : 1.3, depth = 0.42;
  const T = lines3D(P ? ['AFTER', 'EFFECTS'] : ['AFTER EFFECTS'], { size, depth, mat: S.MAT.graphite, lead: 0.3 });
  const at = [16, 0, -30];
  T.group.position.set(...at);
  const cutY = T.capH * 0.47;
  const parts = T.glyphs.map((g, i) => {
    const top = new THREE.Mesh(g.mesh.geometry, S.cutMaterials(S.MAT.graphite));
    const bot = new THREE.Mesh(g.mesh.geometry, S.cutMaterials(S.MAT.graphite));
    g.mesh.parent.add(top, bot);
    g.mesh.parent.remove(g.mesh);
    return { top, bot, home: g.home, line: g.line, i, s1: hash(i, 3), s2: hash(i, 7), s3: hash(i, 11) };
  });
  // the slice: a glowing bar per line, drawn left to right
  const bars = T.words.map((w) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 0.035), S.MAT.glow);
    b.position.set(0, cutY, depth / 2 + 0.06);
    w.group.add(b);
    return { b, w };
  });
  const from = typedLine([word('from', 7.7)], { worldH: 0.95, align: 'left' });
  const fromPos = worldPos(T.words[0].group, [-T.words[0].width / 2, T.height + 0.55, 0]);
  if (P) fromPos.y = T.height + 0.55;
  from.mesh.position.copy(fromPos);
  const beam = S.makeBeam({ apex: [12.5, 10, -25], target: [15.5, 0, -29], r0: 0.2, r1: 2.8, intensity: 0.16 });
  const dust = dustFor([16, 2.5, -27], [14, 5, 14], 1000, 14);
  grp.add(T.group, from.mesh, beam, dust);
  S.scene.add(grp);
  const wA = word('After', 7.9), wE = word('Effects', 8.3);
  const tSlice = wE.t1 - 0.12, slice = 0.18;
  const localTop = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY), localBot = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY);
  const none = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
  // when the blade passes each glyph
  const xs = parts.map((p) => p.home.x), xmin = Math.min(...xs), xmax = Math.max(...xs);
  parts.forEach((p) => { p.tc = tSlice + ((p.home.x - xmin) / Math.max(xmax - xmin, 1e-3)) * slice; });
  shake(tSlice + 0.02, 0.035, 0.25);
  return {
    grp, beams: [beam], dust: [dust], at, T, cutY,
    pool: { x: at[0], z: at[2] + 1.2, r: 3.6, k: 0.1 },
    win: [6.9, 10.7],
    update(t) {
      parts.forEach((p) => {
        // fly in from the dark: AFTER on "After", EFFECTS on "Effects"
        const isE = P ? p.line === 1 : p.i >= 5;
        const t0 = (isE ? wE.t0 : wA.t0) - 0.16 + (isE ? p.i - 5 : p.i) * 0.03;
        const k = spr(t, t0, SPR.rise);
        const dt = t - p.tc;
        const flyZ = -(1 - k) * 14, spin = (1 - k) * (p.s1 - 0.5) * 2.4;
        p.top.visible = k > 0;
        p.top.position.set(p.home.x, p.home.y, p.home.z + flyZ);
        p.top.rotation.set(0, spin, 0);
        p.bot.visible = dt > 0;
        p.bot.position.copy(p.top.position);
        p.bot.rotation.set(0, 0, 0);
        if (dt > 0) {
          // top half slides along the cut, then falls forward and tumbles; bottom half sinks
          const slide = (0.25 + 0.3 * p.s1) * (1 - Math.exp(-dt * 7));
          const fall = Math.max(0, dt - 0.1);
          p.top.position.x += slide + fall * (0.4 + 0.5 * p.s2);
          p.top.position.y -= 2.3 * fall * fall;
          p.top.position.z += fall * (0.8 + 0.7 * p.s3);
          p.top.rotation.set(fall * (1.5 + p.s3 * 2), 0, -fall * (1.2 + p.s2 * 2) - slide * 0.3);
          const sink = Math.max(0, dt - 0.28);
          p.bot.position.y -= 0.62 * sink * sink + 0.12 * sink;
          p.bot.rotation.set(sink * 0.5 * (p.s2 - 0.5), 0, sink * 0.4 * (p.s1 - 0.5));
          p.top.visible = p.top.position.y > -4;
          p.bot.visible = p.bot.position.y > -2.6 && t < 10.7;
        }
      });
      T.group.updateMatrixWorld(true);
      parts.forEach((p) => {
        const cut = t >= p.tc;
        for (const m of p.top.material) m.clippingPlanes[0].copy(cut ? localTop : none).applyMatrix4(p.top.matrixWorld);
        for (const m of p.bot.material) m.clippingPlanes[0].copy(localBot).applyMatrix4(p.bot.matrixWorld);
      });
      bars.forEach(({ b, w }) => {
        const k = clamp((t - tSlice) / slice), out = ramp(t, tSlice + slice + 0.05, tSlice + slice + 0.35);
        const len = (w.width + 1.2) * k;
        b.visible = k > 0 && out < 1;
        b.scale.set(Math.max(len, 1e-3), 1 - out, 1 - out);
        b.position.x = -w.width / 2 - 0.6 + len / 2;
      });
      from.update(t, 1 - ramp(t, tSlice, tSlice + 0.3));
    },
  };
}

// E: "This is all done" / INSIDE opens like doors / the CLAUDE CODE wall, and the camera goes through the O (8.7 - 12.6 s)
function buildE() {
  const grp = new THREE.Group();
  const doneZ = -37, insideZ = -43;
  const inside = lines3D(['INSIDE'], { size: 1.6, depth: 0.5 });
  inside.group.position.set(16, 0, insideZ);
  const wallSize = P ? 2.7 : 2.8;
  const wall = lines3D(P ? ['CLAUDE', 'CODE'] : ['CLAUDE CODE'], { size: wallSize, depth: 1.1, lead: 0.3 });
  const wallZ = -62;
  wall.group.position.set(16, 0, wallZ);
  const beam = S.makeBeam({ apex: [9, 15, -52], target: [13.5, 0, -59], r0: 0.3, r1: 4.8, intensity: 0.17 });
  const beamW = S.makeBeam({ apex: [24, 15, -53], target: [19.5, 0, -60], r0: 0.3, r1: 4.4, intensity: 0.13 });
  const dust = dustFor([16, 3, -50], [20, 6, 28], 1700, 15);
  grp.add(inside.group, wall.group, beam, beamW, dust);
  S.scene.add(grp);
  const claudeG = wall.glyphs.slice(0, 6), codeG = wall.glyphs.slice(6);
  const O = codeG[1];
  const oPos = worldPos(O.mesh.parent, [O.home.x, wall.capH * 0.5, 0]);
  const claudePos = worldPos(claudeG[0].mesh.parent, [(claudeG[0].home.x + claudeG[5].home.x) / 2, P ? wall.height - wall.capH * 0.5 : wall.capH * 0.5, 0]);
  const wIn = word('inside', 10.5), wCl = word('Claude', 11.4), wCo = word('Code', 11.8);
  ring(wCl.t0 + 0.05, new THREE.Vector3(16 - 3, 0, wallZ), 6, 0.35);
  ring(wCo.t0 + 0.05, new THREE.Vector3(oPos.x, 0, wallZ), 5, 0.35);
  return {
    grp, beams: [beam, beamW], dust: [dust], inside, wall, oPos, claudePos, wallZ, doneZ, insideZ,
    pool: { x: 16, z: wallZ + 4, r: 7, k: 0.1 },
    win: [8.6, 12.6],
    update(t) {
      riseGlyphs(inside.glyphs, t, wIn.t0 - 0.08, { size: 1.6, stagger: 0.03 });
      const open = ramp(t, wIn.t0 + 0.42, wIn.t0 + 0.95, E.inOutCubic);
      inside.glyphs.forEach((g, i) => { g.mesh.position.x += (i < 3 ? -1 : 1) * open * 6.5; g.mesh.rotation.y = (i < 3 ? 1 : -1) * open * 0.55; });
      riseGlyphs(claudeG, t, wCl.t0 - 0.16, { size: wallSize, stagger: 0.03, drop: 1.4, cfg: SPR.snap });
      riseGlyphs(codeG, t, wCo.t0 - 0.2, { size: wallSize, stagger: 0.03, drop: 1.4, cfg: SPR.snap });
    },
  };
}

// F: the gallery behind the wall: four slabs, a red NO stamped on each "No", the word struck out (12.3 - 19 s)
function buildF() {
  const grp = new THREE.Group();
  const E_ = ST.E;
  const items = [
    { word: 'DESKTOP', sNo: word('No', 12.9), w: word('desktop', 13.2) },
    { word: 'WORKSTATION', sNo: word('No', 14.6), w: word('workstation', 14.7) },
    { word: 'AFTER EFFECTS', sNo: word('No', 15.9), w: run('After', 16.5, 'Effects') },
    { word: 'KEYFRAMES', sNo: word('No', 17.5), w: word('keyframes', 17.6) },
  ];
  const slabW = P ? 4.4 : 6.0, slabH = P ? 3.3 : 2.5, gap = P ? 1.6 : 1.5, z = E_.wallZ - 13;
  const x0 = E_.oPos.x;
  const slabGeo = new RoundedBoxGeometry(slabW, slabH, 0.3, 3, 0.06);
  items.forEach((it, k) => {
    const g = new THREE.Group();
    g.position.set(x0 + k * (slabW + gap), 0, z);
    const slab = new THREE.Mesh(slabGeo, S.MAT.slab);
    slab.position.set(0, 0.3 + slabH / 2, 0);
    g.add(slab);
    const avail = slabW - 0.7;
    const size0 = 0.72;
    const no = S.word3D('NO', { size: size0, depth: 0.28, mat: S.MAT.red, align: 'left' });
    const wd = S.word3D(it.word, { size: size0, depth: 0.28, align: 'left' });
    let scale = 1, rowY = 0.3 + slabH / 2 - no.height / 2;
    if (P) {
      // stacked: NO above, the word below (scaled to fit)
      scale = Math.min(1, avail / wd.width);
      no.group.position.set(-no.width / 2, 0.3 + slabH * 0.58, 0.28);
      wd.group.scale.setScalar(scale);
      wd.group.position.set(-(wd.width * scale) / 2, 0.3 + slabH * 0.22, 0.28);
    } else {
      const total = no.width + 0.3 + wd.width;
      scale = Math.min(1, avail / total);
      const sx = -(total * scale) / 2;
      no.group.scale.setScalar(scale);
      wd.group.scale.setScalar(scale);
      no.group.position.set(sx, rowY + (it.word === 'KEYFRAMES' ? 0.35 : 0), 0.28);
      wd.group.position.set(sx + (no.width + 0.3) * scale, rowY + (it.word === 'KEYFRAMES' ? 0.35 : 0), 0.28);
    }
    g.add(no.group, wd.group);
    // the strike: a red bar drawn across the word
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.05), S.MAT.glow);
    g.add(bar);
    it.g = g; it.no = no; it.wd = wd; it.bar = bar; it.scale = scale;
    it.t0 = it.sNo.t0;
    it.tw = Array.isArray(it.w) ? it.w[0].t0 : it.w.t0;
    it.tEnd = Array.isArray(it.w) ? it.w[it.w.length - 1].t1 : it.w.t1;
    it.center = new THREE.Vector3(g.position.x, 0.3 + slabH / 2, z);
    grp.add(g);
    ring(it.t0 + 0.04, new THREE.Vector3(g.position.x, 0, z + 0.6), 3.0, 0.11);
    shake(it.t0 + 0.03, 0.04 + k * 0.012, 0.16);
  });
  // keyframe diamonds on the last slab: a timeline track, seven keys, popped on "keyframes", then cracked
  const kf = items[3];
  const track = new THREE.Mesh(new THREE.BoxGeometry(slabW - 1.0, 0.02, 0.02), S.MAT.paperDim[0]);
  const ty = P ? 0.3 + slabH * 0.08 : 0.3 + 0.48;
  track.position.set(0, ty, 0.3);
  kf.g.add(track);
  const half = new THREE.ConeGeometry(0.17, 0.2, 4, 1);
  half.translate(0, 0.1, 0);
  const nD = P ? 5 : 7;
  const diamonds = Array.from({ length: nD }, (_, i) => {
    const d = new THREE.Group();
    const up = new THREE.Mesh(half, S.MAT.paper[0]), dn = new THREE.Mesh(half, S.MAT.paper[0]);
    dn.rotation.z = Math.PI;
    d.add(up, dn);
    d.position.set((i - (nD - 1) / 2) * ((slabW - 1.4) / (nD - 1)), ty, 0.32);
    kf.g.add(d);
    return { d, up, dn, s1: hash(i, 21), s2: hash(i, 23) };
  });
  const dust = dustFor([x0 + 1.5 * (slabW + gap), 2.5, z + 4], [4 * (slabW + gap), 5, 14], 1800, 16);
  grp.add(dust);
  const beams = [S.makeBeam({ apex: [x0 + 1.5 * (slabW + gap), 12, z + 2], target: [x0 + 1.5 * (slabW + gap), 0, z + 1], r0: 0.4, r1: 7.5, intensity: 0.06 })];
  grp.add(beams[0]);
  S.scene.add(grp);
  const tKey = kf.w.t0, tCrack = kf.tEnd - 0.15;
  return {
    grp, beams, dust: [dust], items, slabW, slabH, z, x0, gap,
    pool: { x: x0 + 1.5 * (slabW + gap), z: z + 1.5, r: 9, k: 0.07 },
    win: [11.9, 19.0],
    update(t) {
      for (const it of items) {
        // NO slams onto the slab face from in front of it
        const k = spr(t, it.t0 - 0.09, SPR.slam);
        it.no.group.visible = k > 0;
        const s = (1 + (1 - k) * 0.9) * it.scale;
        it.no.group.scale.set(s, s * (1 - 0.1 * M.wobble((t - it.t0) / 0.5, 2.2, 5)), s);
        it.no.group.position.z = 0.28 + (1 - k) * 2.5;
        popGlyphs(it.wd.glyphs, t, it.tw - 0.04, { stagger: 0.018 });
        // strike at the end of the word
        const sk = ramp(t, it.tEnd - 0.14, it.tEnd + 0.02, E.outCubic);
        const wdw = it.wd.width * it.scale;
        it.bar.visible = sk > 0;
        it.bar.scale.set(Math.max((wdw + 0.24) * sk, 1e-3), 1, 1);
        it.bar.position.set(it.wd.group.position.x - 0.12 + ((wdw + 0.24) * sk) / 2, it.wd.group.position.y + it.wd.height * it.scale * 0.48, 0.48);
      }
      diamonds.forEach((q, i) => {
        const k = spr(t, tKey + i * 0.035, SPR.snap);
        q.d.visible = k > 0.001;
        const s = Math.max(k, 0.001);
        q.d.scale.set(s, s, s);
        q.d.rotation.set(0, (1 - k) * 2.5, Math.PI / 4 * 0 + 0);
        const dt = t - (tCrack + i * 0.03);
        q.up.position.set(0, 0, 0); q.dn.position.set(0, 0, 0); q.up.rotation.set(0, 0, 0); q.dn.rotation.set(0, 0, Math.PI);
        if (dt > 0) {
          q.up.position.set(dt * (0.6 * (q.s1 - 0.5)), dt * 1.4 - 4.9 * dt * dt, dt * (0.8 + q.s2));
          q.up.rotation.set(dt * 4 * q.s2, 0, dt * 5 * (q.s1 - 0.5));
          q.dn.position.set(-dt * 0.4 * (q.s2 - 0.5), -4.9 * dt * dt - dt * 0.4, dt * (0.5 + q.s1 * 0.6));
          q.dn.rotation.set(-dt * 3 * q.s1, 0, Math.PI + dt * 4 * (q.s2 - 0.5));
          const f = 1 - ramp(t, tCrack + 0.2, tCrack + 0.7);
          q.up.scale.setScalar(Math.max(f, 0.001)); q.dn.scale.setScalar(Math.max(f, 0.001));
        } else { q.up.scale.setScalar(1); q.dn.scale.setScalar(1); }
      });
    },
  };
}

// G: INCREDIBLE, letters flying past the lens into place syllable by syllable; HOW / IS THIS? in Inter (18.9 - 23.3 s)
const G0 = [60, 0, -110];
function buildG() {
  const grp = new THREE.Group();
  const size = P ? 2.1 : 2.2;
  const T = lines3D(P ? ['IN', 'CRED', 'IBLE'] : ['INCREDIBLE'], { size, depth: 0.6, lead: 0.22 });
  T.group.position.set(...G0);
  const how = typedLine([word('How', 19.0)], { worldH: 1.3, align: 'left' });
  const leftX = G0[0] - T.width / 2;
  how.mesh.position.set(leftX + 0.05, T.height + 0.85, G0[2]);
  const isThis = typedLine(run('is', 20.1, 'this'), { worldH: 1.3, align: 'right' });
  isThis.mesh.position.set(G0[0] + T.width / 2, T.height + 0.85, G0[2]);
  const beam = S.makeBeam({ apex: [G0[0] - 4, 14, G0[2] + 6], target: [G0[0], 0, G0[2] + 1], r0: 0.3, r1: 6.5, intensity: 0.12 });
  const dust = dustFor([G0[0], 3, G0[2] + 6], [24, 7, 22], 2200, 17);
  grp.add(T.group, how.mesh, isThis.mesh, beam, dust);
  S.scene.add(grp);
  // syllables from the aligner's phones: IN 19.45, CRED 19.62, I 19.82, BLE 19.85
  const wI = word('incredible', 19.5), ph = wI.phones;
  const tK = ph.find((p) => p[0] === 'K')[1], tB = ph.find((p) => p[0] === 'B')[1];
  const tI2 = ph.filter((p) => p[0] === 'AH')[0][1];
  const syl = [wI.t0, wI.t0, tK, tK, tK, tK, tI2, tB, tB, tB];
  ring(wI.t0 + 0.03, new THREE.Vector3(G0[0], 0, G0[2] + 0.5), 7, 0.6);
  shake(wI.t0 + 0.02, 0.06, 0.22);
  return {
    grp, beams: [beam], dust: [dust], T, syl, how, isThis,
    pool: { x: G0[0], z: G0[2] + 1.5, r: 6, k: 0.1 },
    win: [18.9, 22.4],
    update(t) {
      // sink away during "Oh, and don't forget" (set first: the glyph maths below reads the group's matrix)
      const sink = ramp(t, tOhL() - 0.3, tOhL() + 0.45, E.inCubic);
      T.group.position.y = -sink * (T.height + 1.2);
      T.glyphs.forEach((g, i) => {
        const t0 = syl[i] - 0.14 + (i % 3) * 0.012;
        const k = spr(t, t0, { stiffness: 340, damping: 25 });
        g.mesh.visible = k > 0;
        // from just behind the lens (a fixed point: the camera at the hit), past it, into place
        const home = worldPos(g.mesh.parent, [g.home.x, g.home.y, g.home.z]);
        const src = new THREE.Vector3(G0[0] + (g.home.x) * 0.25 + (hash(i, 31) - 0.5) * 2, 1.2 + (hash(i, 37) - 0.5) * 1.5, G0[2] + 16);
        const p = src.lerp(home, k);
        g.mesh.position.copy(g.mesh.parent.worldToLocal(p));
        g.mesh.rotation.set((1 - k) * 1.2 * (hash(i, 41) - 0.5), (1 - k) * 1.6 * (hash(i, 43) - 0.5), 0);
      });
      how.update(t);
      isThis.update(t);
      how.mesh.material.opacity *= 1 - ramp(t, 20.9, 21.3);
      isThis.mesh.material.opacity *= 1 - ramp(t, 20.9, 21.3);
    },
  };
}

// I/J/K: SKILL forms and blows away as dust; the prompt is typed and PROMPT rises out of it; the
// finale: CLAUDE CODE with the film's words drifting in the haze (22.5 - 33.5 s)
function buildK() {
  const grp = new THREE.Group();
  // SKILL
  const skillAt = [G0[0], 0, G0[2] + 7];
  const SK = lines3D(['SKILL'], { size: 1.9, depth: 0.5 });
  const skillMats = S.cutMaterials(S.MAT.paper, 0xfff2e2);
  SK.glyphs.forEach((g) => { g.mesh.material = skillMats; });
  SK.group.position.set(...skillAt);
  const wSkill = word('skill', 25.3);
  const tForm = wSkill.t0 - 0.06, tGone = wSkill.t1 + 0.04;
  // dust sampled from SKILL's surface, released as the dissolve front passes
  const nP = 2600;
  const sampler = (() => {
    const pos = new Float32Array(nP * 3), sd = new Float32Array(nP * 3);
    const r = M.mulberry32(77);
    SK.group.updateMatrixWorld(true);
    const per = Math.ceil(nP / SK.glyphs.length);
    let k = 0;
    const v = new THREE.Vector3();
    SK.glyphs.forEach((g) => {
      const m = new THREE.Mesh(g.mesh.geometry);
      const s = new MeshSurfaceSampler(m).setRandomGenerator(r).build();
      for (let j = 0; j < per && k < nP; j++, k++) {
        s.sample(v);
        v.add(g.home).add(SK.words[0].group.position).add(SK.group.position);
        pos.set([v.x, v.y, v.z], k * 3);
        sd.set([r(), r(), r()], k * 3);
      }
    });
    return { pos, sd };
  })();
  const xs = []; for (let i = 0; i < nP; i++) xs.push(sampler.pos[i * 3]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(sampler.pos, 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(sampler.sd, 3));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uFront: { value: -1e3 }, uScale: { value: 1 }, uXmin: { value: xmin }, uXmax: { value: xmax }, uWind: { value: new THREE.Vector3(-1.6, 1.1, 0.9) } },
    vertexShader: /* glsl */`
      attribute vec3 seed; uniform float uT, uFront, uScale, uXmin, uXmax; uniform vec3 uWind; varying float vA;
      void main() {
        float rel = uFront - position.x;              // > 0: the front has passed this point
        float age = rel / 6.0 + seed.x * 0.05;        // seconds since release (front moves ~6 m/s)
        vec3 p = position;
        if (rel > 0.0) {
          p += uWind * age * (0.6 + seed.y) + vec3(sin(seed.z * 40.0 + age * 3.0), cos(seed.x * 30.0 + age * 2.0), sin(seed.y * 50.0)) * age * 0.35;
          p.y += age * age * 0.8 * seed.z;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((0.012 + 0.02 * seed.z) * uScale / -mv.z, 1.0, 24.0);
        vA = rel > 0.0 ? clamp(1.0 - age / (0.7 + seed.y * 0.9), 0.0, 1.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * smoothstep(1.0, 0.3, d) * vA * 1.4, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(pg, pmat);
  motes.frustumCulled = false;
  grp.add(SK.group, motes);

  // the prompt line, typed fast, and PROMPT growing out of it
  const promptAt = [G0[0], 0, G0[2] + 9.5];
  const card = textCard(0.34, { w: 4096, h: 192 });
  const pline = new THREE.Group();
  card.mesh.position.set(0, 0, 0);
  pline.add(card.mesh);
  const lineLen = (() => { card.c.font = `400 96px ${UI}`; return (card.c.measureText(PROMPT_TEXT).width / card.w) * card.worldW; })();
  pline.position.set(promptAt[0] - (P ? 2.0 : lineLen / 2), 0.32, promptAt[2] + 1.4);
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.red).multiplyScalar(1.6) }));
  pline.add(cursor);
  const PR = lines3D(['PROMPT'], { size: P ? 1.8 : 2.0, depth: 0.55 });
  PR.group.position.set(...promptAt);
  grp.add(pline, PR.group);
  const wPrompt = word('prompt', 26.7);
  const tType0 = wSkill.t1 + 0.12, tType1 = wPrompt.t0 - 0.06;

  // finale: CLAUDE CODE and the film's words in the haze
  const finAt = [G0[0], 0, G0[2] - 6];
  const FIN = lines3D(P ? ['CLAUDE', 'CODE'] : ['CLAUDE CODE'], { size: P ? 1.9 : 2.5, depth: 0.7, lead: 0.3 });
  FIN.group.position.set(...finAt);
  const wCl = word('Claude', 28.4), wCo = word('Code', 29.6);
  const finClaude = FIN.glyphs.slice(0, 6), finCode = FIN.glyphs.slice(6);
  const cons = new THREE.Group();
  const names = ['MOTION', 'GRAPHICS', 'DESIGN', 'DESKTOP', 'WORKSTATION', 'AFTER EFFECTS', 'KEYFRAMES', 'INCREDIBLE', 'PROMPT', 'NOT', 'INSIDE', 'NO'];
  const spots = P
    ? [[-7, 9.5, -12], [8, 12.5, -16], [-9, 4.5, -22], [9, 3.2, -10], [-3, 16, -26], [4, 7.5, -24],
      [-10, 14, -8], [10, 17, -28], [-2, 20.5, -32], [6, 1.8, -5], [-8, 19, -34], [9, 9, -20]]
    : [[-15, 6.5, -10], [14, 7.5, -14], [-22, 2.5, -20], [20, 2.2, -8], [-9, 9.8, -24], [5, 11, -22],
      [-26, 7, -6], [25, 9, -26], [-4, 13.5, -30], [11, 4.5, -4], [-17, 12, -32], [28, 5, -18]];
  const consItems = names.map((nm, i) => {
    const w = S.word3D(nm, { size: 0.9 + hash(i, 51) * 0.8, depth: 0.3, mat: nm === 'NO' || nm === 'NOT' ? S.MAT.red : S.MAT.paperDim });
    const s = spots[i];
    w.group.position.set(finAt[0] + s[0], s[1], finAt[2] + s[2]);
    w.group.rotation.y = -Math.atan2(s[0], 24 - s[2]) * 0.8;
    cons.add(w.group);
    return { w, base: w.group.position.clone(), r0: w.group.rotation.y, s: hash(i, 53) };
  });
  grp.add(FIN.group, cons);
  const beam = S.makeBeam({ apex: [finAt[0] + 5, 16, finAt[2] + 8], target: [finAt[0], 0, finAt[2] + 2], r0: 0.3, r1: 7, intensity: 0.11 });
  // two stage lights that strike on with the words "this" and "done", setting the stage for SKILL
  const tC1 = word('this', 23.0).t0, tC2 = word('done', 24.2).t0;
  const cue = (t, tc) => (t < tc - 0.02 ? 0 : ramp(t, tc - 0.02, tc + 0.05) + 0.6 * Math.exp(-(t - tc) / 0.1));
  const cue1 = S.makeBeam({ apex: [G0[0] - 5, 13, G0[2] + 13], target: [G0[0] - 1.2, 0, G0[2] + 7.6], r0: 0.12, r1: 2.0, intensity: 0.24 });
  const cue2 = S.makeBeam({ apex: [G0[0] + 5.5, 13, G0[2] + 12], target: [G0[0] + 1.4, 0, G0[2] + 7.2], r0: 0.12, r1: 2.0, intensity: 0.22 });
  cue1.userData.gate = (t) => cue(t, tC1);
  cue2.userData.gate = (t) => cue(t, tC2);
  const beam2 = S.makeBeam({ apex: [G0[0] - 3, 12, G0[2] + 12], target: [G0[0], 0, G0[2] + 8.5], r0: 0.2, r1: 3.6, intensity: 0.14 });
  const dust = dustFor([finAt[0], 4, finAt[2] + 8], [40, 10, 36], 2600, 18);
  grp.add(beam, beam2, cue1, cue2, dust);
  S.scene.add(grp);
  ring(wCl.t0 + 0.06, new THREE.Vector3(finAt[0] - 2, 0, finAt[2]), 7, 0.35);
  ring(wCo.t0 + 0.05, new THREE.Vector3(finAt[0], 0, finAt[2]), 10, 0.7);
  shake(wCo.t0 + 0.03, 0.05, 0.25);
  ring(wPrompt.t0 + 0.08, new THREE.Vector3(promptAt[0], 0, promptAt[2]), 5, 0.4);
  return {
    grp, beams: [cue1, cue2, beam2, beam], dust: [dust], SK, PR, FIN, skillAt, promptAt, finAt, motes, pline, lineLen,
    pool: { x: G0[0], z: G0[2] + 7, r: 4.5, k: 0.11 },
    win: [22.4, 34],
    update(t) {
      // SKILL: revealed left to right by a glowing front, then carried off as dust by a second one
      const w0 = SK.width / 2 + 0.3, x0 = skillAt[0] - w0, x1 = skillAt[0] + w0;
      const revealX = lerp(x0, x1, ramp(t, tForm, tForm + 0.22, E.outCubic));
      const goneX = lerp(x0, x1, ramp(t, tGone, tGone + 0.5, E.inOutSine));
      SK.group.visible = t > tForm && t < tGone + 0.6;
      SK.group.updateMatrixWorld(true);
      for (const m of skillMats) m.clippingPlanes[0].set(new THREE.Vector3(-1, 0, 0), revealX);
      if (t > tGone) for (const m of skillMats) m.clippingPlanes[0].set(new THREE.Vector3(1, 0, 0), -goneX);
      SK.glyphs.forEach((g) => { g.mesh.position.copy(g.home); });
      pmat.uniforms.uFront.value = t > tGone ? goneX : -1e3;
      motes.visible = t > tGone && t < tGone + 2.6;
      pmat.uniforms.uScale.value = H / (2 * Math.tan((S.camera.fov * Math.PI) / 360));
      // the prompt types on at speed; the cursor rides its end
      const kT = clamp((t - tType0) / (tType1 - tType0));
      const shown = PROMPT_TEXT.slice(0, Math.round(kT * PROMPT_TEXT.length));
      card.paint(shown, (c) => { c.font = `400 96px ${UI}`; c.fillStyle = C.paper; c.textBaseline = 'middle'; c.fillText(shown, 8, card.h / 2 + 4); });
      card.c.font = `400 96px ${UI}`;
      const px = cursorAt(card.c, PROMPT_TEXT, kT) + 22;
      cursor.position.set((px / card.w) * card.worldW, 0, 0.02);
      const pOut = ramp(t, wPrompt.t0 + 0.6, wPrompt.t0 + 1.2);
      pline.visible = t > tType0 - 0.3 && pOut < 1;
      card.mesh.material.opacity = 1 - pOut;
      cursor.visible = t > tType0 - 0.3 && pOut < 0.5 && ((t > tType0 && t < tType1 + 0.1) || (t * 1.8) % 1 < 0.6);
      // PROMPT grows up out of the line: each glyph extrudes from flat, then the word sinks away for the finale
      const sinkP = ramp(t, wCl.t0 - 0.85, wCl.t0 - 0.1, E.inCubic);
      PR.glyphs.forEach((g, i) => {
        const k = spr(t, wPrompt.t0 - 0.07 + i * 0.03, SPR.rise);
        g.mesh.visible = k > 0.001 && sinkP < 1;
        g.mesh.scale.set(1, Math.max(k, 0.001), Math.max(Math.min(k * 1.4, 1), 0.001));
        g.mesh.position.set(g.home.x, g.home.y - sinkP * 3.4 * PR.size, g.home.z);
      });
      // finale
      riseGlyphs(finClaude, t, wCl.t0 - 0.08, { size: FIN.size, stagger: 0.035 });
      riseGlyphs(finCode, t, wCo.t0 - 0.08, { size: FIN.size, stagger: 0.04, cfg: SPR.snap });
      if (t > 30.4) FIN.glyphs.forEach((g, i) => { g.mesh.position.y -= ramp(t, 30.4 + i * 0.02, 31.05 + i * 0.02, E.inCubic) * (FIN.height + FIN.capH * 0.3); });
      cons.visible = t > 26.8;
      consItems.forEach((c, i) => {
        const a = ramp(t, 27.2 + i * 0.05, 28.6 + i * 0.05, E.outCubic);
        c.w.group.position.set(c.base.x, c.base.y - (1 - a) * 1.5 + Math.sin(t * 0.5 + c.s * 6) * 0.25, c.base.z);
        c.w.group.rotation.y = c.r0 + Math.sin(t * 0.21 + c.s * 5) * 0.12;
        c.w.group.visible = a > 0.01;
      });
    },
  };
}

// ---------------------------------------------------------------- camera
// Three continuous takes with two cuts: on "I'm" (5.2 s) and on "How" (19.0 s).
let CAM = null;
const fit = (w, h, fill = 0.82, fov = FOV0) => S.fitDistance(w, h, fov, fill);
function buildCamera() {
  const A = ST.A, B = ST.B, Cc = ST.C, D = ST.D, Ee = ST.E, F = ST.F, G = ST.G, K = ST.K;
  const tIm = word("I'm", 5.2).t0, tHow = word('How', 19.0).t0;
  const takes = [];

  // take 1: A -> whip -> B
  {
    const aW = A.T.width + 0.6, aH = A.T.height + 0.6, dA = fit(aW, aH, 0.86);
    const aC = [0, A.T.height / 2, -0.8];
    const bW = B.T.width + 0.8, bH = B.T.height + 1.5, dB = fit(bW, bH, 0.82), bC = B.center;
    const tTo = word('to', 2.4).t0, tClaude = word('Claude', 1.4).t0, tMo = word('motion', 3.1).t0;
    takes.push({ t0: 0, cam: path([
      { t: 0.0, pos: [A.lx + 0.32, A.ly + 0.1, A.lz + 2.5], look: [A.lx + 0.22, A.ly + 0.01, A.lz], carry: 0.6 },
      { t: 0.5, pos: [A.lx + 0.45, A.ly + 0.11, A.lz + 2.55], look: [A.lx + 0.35, A.ly + 0.01, A.lz] },
      { t: tClaude - 0.1, pos: [A.lx + A.lineEnd - 0.15, A.ly + 0.16, A.lz + 3.0], look: [A.lx + A.lineEnd - 0.35, A.ly + 0.03, A.lz] },
      { t: tClaude + 0.42, pos: [0.4, 0.5, aC[2] + dA + 1.9], look: [-0.35, 0.9, 0.6] },
      { t: 2.2, pos: [0.15, 0.75 + aC[1] * 0.25, aC[2] + dA + 0.45], look: [0, aC[1] * 0.92, aC[2]] },
      { t: tTo + 0.01, pos: [0.1, 0.8 + aC[1] * 0.25, aC[2] + dA + 0.15], look: [0.05, aC[1], aC[2]], stop: true },
      { t: tMo - 0.05, pos: [bC[0] - 3.4, bC[1] * 0.75, bC[2] + dB], look: [bC[0], bC[1] - 0.1, bC[2]] },
      { t: tIm - 0.02, pos: [bC[0] - 2.2, bC[1] + 2.3, bC[2] + dB * 0.88], look: [bC[0], bC[1] + 0.9, bC[2]], carry: 0.8 },
    ]) });
  }
  // take 2: top-down C -> swoop to D -> push through to INSIDE and the wall -> through the O -> the gallery
  {
    const cC = Cc.at, dC = fit(Cc.bw + 1.2, Cc.bh + 1.2, 0.8);
    const dW = D.T.width + 1.2, dH = D.T.height + 1.5, dD = fit(dW, dH, 0.84), dCt = [D.at[0], D.T.height / 2 + 0.1, D.at[2]];
    const tFrom = word('from', 7.7).t0, tThis = word('This', 8.8).t0, tIn = word('inside', 10.5).t0;
    const tCl = word('Claude', 11.4).t0, tCo = word('Code', 11.8).t0, tSo = word('So', 11.9);
    const o = Ee.oPos, cl = Ee.claudePos, wall = Ee.wall, dIn = fit(Ee.inside.width + 3.2, Ee.inside.height + 2.2, 0.86);
    const it = F.items, fd = fit(F.slabW + (P ? 0.5 : 1.4), F.slabH + 1.2, P ? 0.94 : 0.86), fy = 0.3 + F.slabH / 2;
    const fz = F.z + fd;
    const slabX = it.map((x) => x.center.x);
    const up = [0, 0, -1];
    const keys = [
      { t: tIm - 0.02, pos: [cC[0] + 0.5, dC + 0.6, cC[2] + 1.3], look: [cC[0], 0, cC[2] - 0.2], up, roll: -0.1, carry: 1 },
      { t: 7.22, pos: [cC[0] + 0.3, dC - 0.1, cC[2] + 0.85], look: [cC[0], 0, cC[2] - 0.15], up, roll: 0.07 },
      { t: tFrom - 0.08, pos: [dCt[0], 1.55, dCt[2] + dD + 2.0], look: [dCt[0], dCt[1] + 0.15, dCt[2]] },
      { t: tThis, pos: [dCt[0], 1.5, dCt[2] + dD], look: [dCt[0], dCt[1], dCt[2]] },
      { t: tThis + 0.85, pos: [dCt[0] + 0.2, 1.95, dCt[2] + dD * 0.68], look: [dCt[0], 0.05, dCt[2] + 0.9] },
      { t: tIn - 0.12, pos: [16, 1.3, Ee.insideZ + dIn + 0.6], look: [16, Ee.inside.height * 0.55, Ee.insideZ] },
      { t: tIn + 0.42, pos: [16, 1.45, Ee.insideZ + dIn - 0.9], look: [16, Ee.inside.height * 0.62, Ee.insideZ] },
      { t: tCl - 0.08, pos: [cl.x + 0.6, 1.9, Ee.insideZ + 1.6], look: [cl.x, cl.y, Ee.wallZ] },
      { t: tCo - 0.17, pos: [lerp(cl.x, o.x, 0.45), 1.85, Ee.insideZ - 0.6], look: [lerp(cl.x, o.x, 0.55), lerp(cl.y, o.y, 0.5), Ee.wallZ] },
      { t: tCo + 0.05, pos: [o.x, o.y + 0.25, Ee.insideZ - 3.6], look: [o.x, o.y, Ee.wallZ] },
      { t: tSo.t1 + 0.04, pos: [o.x, o.y, Ee.wallZ - 1.4], look: [o.x, o.y, Ee.wallZ - 20] },
      { t: it[0].t0 - 0.05, pos: [slabX[0], fy + 0.1, fz + 0.4], look: [slabX[0], fy, F.z], stop: true },
    ];
    for (let k = 1; k < 4; k++) {
      keys.push({ t: it[k].t0 - 0.36, pos: [slabX[k - 1] + 0.45, fy + 0.08, fz - 0.15], look: [slabX[k - 1] + 0.3, fy, F.z] });
      keys.push({ t: it[k].t0 - 0.04, pos: [slabX[k], fy + 0.1, fz + 0.2], look: [slabX[k], fy, F.z], stop: true });
    }
    keys.push({ t: tHow - 0.02, pos: [slabX[3] + 0.4, fy + 0.25, fz - 1.4], look: [slabX[3] + 0.2, fy - 0.1, F.z] });
    takes.push({ t0: tIm - 0.02, cam: path(keys) });
  }
  // take 3: INCREDIBLE -> dark -> SKILL -> the prompt -> PROMPT -> finale -> end card
  {
    const g = G0, gw = G.T.width, gh = G.T.height, dG = fit(gw + 2.2, gh + 2.4, 0.86);
    const wI = word('incredible', 19.5).t0;
    const sk = K.skillAt, dS = fit(K.SK.width + (P ? 0.5 : 3), K.SK.height + 2.5, P ? 0.92 : 0.8);
    const pr = K.promptAt, dP = fit(K.PR.width + (P ? 0.4 : 2.5), K.PR.height + 2.2, P ? 0.92 : 0.8);
    const fin = K.finAt, dF = fit(K.FIN.width + (P ? 1.2 : 6), K.FIN.height + (P ? 2.5 : 5), P ? 0.9 : 0.84);
    const tSkill = word('skill', 25.3), tPrompt = word('prompt', 26.7).t0, tCl = word('Claude', 28.4).t0, tCo = word('Code', 29.6).t0;
    const tOh = word('Oh', 21.2).t0;
    const leftX = g[0] - gw / 2;
    const tType0 = tSkill.t1 + 0.12, lx0 = K.pline.position.x, lineSpan = P ? 3.4 : K.lineLen;
    takes.push({ t0: tHow - 0.02, cam: path([
      { t: tHow - 0.02, pos: [leftX + (P ? 1.25 : 2.9), gh * 0.62, g[2] + (P ? 7.8 : 6.4)], look: [leftX + (P ? 0.85 : 1.5), gh + 0.55, g[2]], carry: 1 },
      { t: wI - 0.02, pos: [leftX + (P ? 1.6 : 3.4), gh * 0.55, g[2] + (P ? 8.8 : 7.4)], look: [leftX + (P ? 1.2 : 2.0), gh * 0.75, g[2]] },
      { t: wI + 0.62, pos: [g[0] - 0.4, gh * 0.5 + 0.2, g[2] + dG * 0.92], look: [g[0], gh * 0.5, g[2]] },
      { t: tOh - 0.1, pos: [g[0] + 0.5, gh * 0.55 + 0.4, g[2] + dG * 1.05], look: [g[0], gh * 0.5, g[2]] },
      { t: 22.9, pos: [g[0] + 1.6, 1.8, sk[2] + dS * 1.25], look: [sk[0], 1.0, sk[2]] },
      { t: tSkill.t0 + 0.1, pos: [sk[0] - 0.8, 1.15, sk[2] + dS], look: [sk[0] - 0.1, K.SK.height * 0.5, sk[2]] },
      { t: tSkill.t1 + 0.35, pos: [sk[0] - 2.2, 0.9, sk[2] + dS * 0.95], look: [sk[0] - 0.8, 0.8, sk[2] + 1.2] },
      // follow the cursor along the prompt as it types
      { t: tType0 + 0.05, pos: [lx0 + 0.6, 0.8, pr[2] + 5.0], look: [lx0 + 1.3, 0.42, pr[2] + 1.4] },
      { t: tPrompt - 0.05, pos: [lx0 + lineSpan * 0.72, 0.85, pr[2] + 5.3], look: [lx0 + lineSpan * 0.82, 0.5, pr[2] + 1.4] },
      { t: tPrompt + 0.55, pos: [pr[0], 1.4, pr[2] + dP], look: [pr[0], K.PR.height * 0.55, pr[2]] },
      { t: tCl - 0.15, pos: [fin[0] + 1.0, 3.2, fin[2] + dF * 1.05], look: [fin[0], 2.0, fin[2]] },
      { t: tCo + 0.1, pos: [fin[0] + 0.3, 2.4, fin[2] + dF * 0.9], look: [fin[0], K.FIN.height * 0.62, fin[2]] },
      { t: 33.6, pos: [fin[0] + 0.05, 2.3, fin[2] + dF * 0.8], look: [fin[0], K.FIN.height * 0.62, fin[2]], carry: 0.4 },
    ]) });
  }
  CAM = (t) => {
    let tk = takes[0];
    for (const k of takes) if (t >= k.t0) tk = k;
    const c = tk.cam(t);
    // shakes: decaying, seeded
    let sx = 0, sy = 0;
    for (const s of SHAKES) {
      if (t < s.t) continue;
      const a = s.amp * Math.exp(-(t - s.t) / s.decay);
      if (a < 1e-4) continue;
      sx += a * M.noise1((t - s.t) * 38, 5 + s.t * 10);
      sy += a * M.noise1((t - s.t) * 38, 9 + s.t * 10);
    }
    c.look = [c.look[0] + sx, c.look[1] + sy, c.look[2]];
    return c;
  };
}

// ---------------------------------------------------------------- light over time
// The world dims for "Oh, and don't forget" and again under the end card.
const tOhL = () => word('Oh', 21.2).t0;
function lightAt(t) {
  const down = ramp(t, tOhL() - 0.35, tOhL() + 0.2);
  const tThis2 = word('this', 23.0).t0, tDone2 = word('done', 24.2).t0;
  const s1 = ramp(t, tThis2 - 0.03, tThis2 + 0.1), s2 = ramp(t, tDone2 - 0.03, tDone2 + 0.1);
  const strike = t > tThis2 ? 0.22 * Math.exp(-(t - tThis2) / 0.09) : 0, strike2 = t > tDone2 ? 0.2 * Math.exp(-(t - tDone2) / 0.09) : 0;
  const end = ramp(t, 30.35, 31.2);
  return (lerp(lerp(lerp(1, 0.12, down), 0.42, s1), 0.85, s2) + strike + strike2) * lerp(1, 0.22, end);
}

// ---------------------------------------------------------------- per-frame world state
function updateWorld(t) {
  for (const st of LIST) {
    st.grp.visible = t >= st.win[0] && t < st.win[1];
    if (st.grp.visible) st.update(t);
  }
  const light = lightAt(t);
  S.setLight(light);
  const U = S.floorU();
  const vis = LIST.filter((s) => s.grp.visible);
  const pools = vis.filter((s) => s.pool).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const p = pools[i];
    U.uPool.value[i].set(p ? p.pool.x : 0, 0, p ? p.pool.z : 0, p ? p.pool.k * light : 0);
    U.uPoolR.value[i] = p ? p.pool.r : 1;
  }
  const active = RINGS.filter((r) => t >= r.t && t < r.t + 1.2).slice(-4);
  for (let i = 0; i < 4; i++) {
    const r = active[i];
    if (!r) { U.uRing.value[i].set(0, 0, 0, 0); continue; }
    const a = (t - r.t) / 1.2;
    U.uRing.value[i].set(r.x, r.z, r.r * E.outCubic(a), r.k * (1 - a) ** 2);
  }
  const beams = vis.flatMap((s) => s.beams || []);
  for (const b of beams) b.material.uniforms.uI.value = (b.userData.i0 ??= b.material.uniforms.uI.value) * (0.25 + 0.75 * light) * (b.userData.gate ? b.userData.gate(t) : 1);
  const bs = beams.slice(0, 3);
  const scale = H / (2 * Math.tan((S.camera.fov * Math.PI) / 360));
  for (const s of vis) for (const d of s.dust || []) {
    const u = d.material.uniforms;
    u.uTime.value = t;
    u.uScale.value = scale;
    u.uOpacity.value = 0.35 + 0.65 * light;
    for (let i = 0; i < 3; i++) {
      const b = bs[i]?.userData.beam;
      u.uBeamA.value[i].set(b ? b.apex.x : 0, b ? b.apex.y : 0, b ? b.apex.z : 0, b ? 1.0 : 0);
      u.uBeamD.value[i].set(b ? b.dir.x : 0, b ? b.dir.y : -1, b ? b.dir.z : 0, b ? b.tan : 0.1);
    }
  }
  // the light sweep across INCREDIBLE: the studio turns once around the word
  const wI = word('incredible', 19.5).t0;
  const sweep = ramp(t, wI + 0.25, wI + 1.25, E.inOutSine);
  S.MAT.paper[0].envMapRotation.set(0, sweep * Math.PI * 0.9, 0);
  S.MAT.paper[1].envMapRotation.set(0, sweep * Math.PI * 0.9, 0);
}

// ---------------------------------------------------------------- 2-D type: captions, the end card
// Regan's caption style: the phrase fades up with a slight rise; spoken words full white, upcoming dim.
function caption(ctx, words, t, { y = FORMAT.pick({ '16x9': H * 0.84, '9x16': 1330 }), size = FORMAT.pick({ '16x9': 60, '9x16': 64 }), out = null } = {}) {
  const first = words[0].t0, a0 = ramp(t, first - 0.3, first - 0.02, E.outCubic);
  const a = a0 * (out ? 1 - ramp(t, out[0], out[1]) : 1);
  if (a <= 0.001) return;
  ctx.save();
  ctx.font = `400 ${size}px ${UI}`;
  ctx.textBaseline = 'alphabetic';
  const sp = ctx.measureText(' ').width;
  const ws = words.map((w) => ({ w, wd: ctx.measureText(w.w).width }));
  const total = ws.reduce((s, x) => s + x.wd, 0) + sp * (ws.length - 1);
  let x = (W - total) / 2;
  const rise = (1 - a0) * 16;
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
  for (const { w, wd } of ws) {
    const on = ramp(t, w.t0 - 0.06, w.t0 + 0.04);
    ctx.globalAlpha = a * (0.3 + 0.7 * on);
    ctx.fillStyle = C.paper;
    ctx.fillText(w.w, x, y + rise);
    x += wd + sp;
  }
  ctx.restore();
}
function overlays(ctx, t) {
  const so = word('So', 11.9);
  caption(ctx, [so], t, { out: [so.t1 + 0.05, so.t1 + 0.3] });
  caption(ctx, run('This', 8.8, 'done'), t, { y: FORMAT.pick({ '16x9': H * 0.62, '9x16': H * 0.62 }), size: FORMAT.pick({ '16x9': 86, '9x16': 74 }), out: [word('inside', 10.5).t0 - 0.22, word('inside', 10.5).t0 + 0.04] });
  const oh = run('Oh', 21.2, 'forget');
  caption(ctx, oh, t, { y: H * 0.5 + 24, size: FORMAT.pick({ '16x9': 80, '9x16': 76 }), out: [22.45, 22.8] });
  const done = run('this', 23.0, 'done'), notBy = run('not', 24.8, 'a'), butBy = run('but', 26.2, 'a');
  caption(ctx, [...done, ...notBy], t, { y: H * 0.5 + 24, size: FORMAT.pick({ '16x9': 80, '9x16': 70 }), out: [word('skill', 25.3).t0 - 0.3, word('skill', 25.3).t0 - 0.05] });
  caption(ctx, butBy, t, { out: [26.75, 27.0] });
  const andIn = run('and', 27.5, 'of');
  caption(ctx, andIn, t, { out: [28.5, 28.85] });
  endCard(ctx, t);
}
function endCard(ctx, t) {
  const t0 = 30.8;
  if (t < t0) return;
  const s = FORMAT.pick({ '16x9': 1, '9x16': 1.05 });
  const cx = W / 2, cy = FORMAT.pick({ '16x9': H * 0.47, '9x16': H * 0.45 });
  const big = 168 * s;
  ctx.save();
  // REGAN / STRAND: masked slide-ups
  const lines = [['REGAN', t0], ['STRAND', t0 + 0.12]];
  ctx.font = `400 ${big}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${0.02 * big}px`;
  lines.forEach(([txt, ta], i) => {
    const k = ramp(t, ta, ta + 0.7, E.outQuint);
    const base = cy - big * 0.08 + i * big * 0.98;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, base - big * 0.95, W, big * 0.98); ctx.clip();
    ctx.fillStyle = C.paper;
    ctx.fillText(txt, cx, base + (1 - k) * big);
    ctx.restore();
  });
  ctx.letterSpacing = '0px';
  // a short rule with a red tick
  const rk = ramp(t, t0 + 0.45, t0 + 1.05, E.outQuint);
  const ry = cy + big * 1.18, rw = 220 * s;
  ctx.fillStyle = 'rgba(240,236,228,0.55)';
  ctx.fillRect(cx - (rw / 2) * rk, ry, rw * rk, 2);
  ctx.fillStyle = C.red;
  if (rk > 0.6) ctx.fillRect(cx + (rw / 2) * rk - 2, ry - 7, 4, 16);
  // PRODUCER / CREATIVE DIRECTOR, tracked caps, with a faded echo beneath
  const lk = ramp(t, t0 + 0.7, t0 + 1.3, E.outCubic);
  ctx.font = `500 ${40 * s}px ${UI}`;
  ctx.letterSpacing = `${0.28 * 40 * s}px`;
  ctx.fillStyle = C.paper;
  ctx.globalAlpha = lk;
  ctx.fillText('PRODUCER / CREATIVE DIRECTOR', cx + 0.14 * 40 * s, ry + 76 * s + (1 - lk) * 10);
  ctx.globalAlpha = lk * 0.2;
  ctx.fillText('PRODUCER / CREATIVE DIRECTOR', cx + 0.14 * 40 * s, ry + 76 * s + 56 * s + (1 - lk) * 14);
  ctx.restore();
}

// ---------------------------------------------------------------- post: bloom, vignette, grain
const POST = {};
function initPost() {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  POST.a = mk(W / 4, H / 4); POST.b = mk(W / 4, H / 4); POST.c = mk(W / 8, H / 8);
  POST.vig = mk(W, H);
  const v = POST.vig.getContext('2d');
  const gr = v.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#a9a9a9');
  v.fillStyle = gr; v.fillRect(0, 0, W, H);
  POST.grain = [0, 1, 2, 3].map((k) => {
    const c = mk(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256), r = M.mulberry32(91 + k);
    for (let i = 0; i < 256 * 256; i++) { const g = 128 + (r() + r() + r() - 1.5) * 90; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    return c;
  });
}
function bloomAmount(t) {
  const wI = word('incredible', 19.5).t0, wCo = word('Code', 29.6).t0;
  return (1 + 0.9 * Math.exp(-Math.max(0, t - wI) / 0.35) * (t >= wI - 0.05 ? 1 : 0) + 0.6 * Math.exp(-Math.max(0, t - wCo) / 0.4) * (t >= wCo ? 1 : 0)) * (1 - 0.55 * ramp(t, 30.4, 31.1));
}
function post(ctx, u, t) {
  // bloom: highlights weighted x^8 (the quarter-res frame multiplied by itself three times), two blur radii, added
  const a = POST.a.getContext('2d'), b = POST.b.getContext('2d'), c = POST.c.getContext('2d');
  a.globalCompositeOperation = 'copy'; a.drawImage(ctx.canvas, 0, 0, W / 4, H / 4);
  a.globalCompositeOperation = 'multiply'; a.drawImage(POST.a, 0, 0); a.drawImage(POST.a, 0, 0); a.drawImage(POST.a, 0, 0);
  b.globalCompositeOperation = 'copy'; b.filter = 'blur(5px)'; b.drawImage(POST.a, 0, 0); b.filter = 'none';
  c.globalCompositeOperation = 'copy'; c.filter = 'blur(9px)'; c.drawImage(POST.a, 0, 0, W / 8, H / 8); c.filter = 'none';
  const k = bloomAmount(t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, 0.5 * k); ctx.drawImage(POST.b, 0, 0, W, H);
  ctx.globalAlpha = Math.min(1, 0.8 * k); ctx.drawImage(POST.c, 0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.drawImage(POST.vig, 0, 0);
  const f = M.SAMPLE.frame, tile = POST.grain[f % 4];
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.16;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.translate(-((f * 97) % 256), -((f * 57) % 256));
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

// ---------------------------------------------------------------- hits: every accent gets its sound (sfx.mjs)
const HITS = [];
function hit(t, label, sfx, opts) { HITS.push([+M.U(t).toFixed(4), label, sfx, opts]); }
function buildHits() {
  const w = (x, n) => word(x, n).t0;
  hit(w('this', 0.5), 'type: this is me using', 'type', { n: 14, len: 0.55, gain: 0.13 });
  hit(w('Claude', 1.4), 'CLAUDE rises', 'whoosh+sub', { from: 180, to: 900, len: 0.45, gain: 0.32 });
  hit(w('Code', 2.1), 'CODE rises', 'thud', { pitch: 130, to: 48, gain: 0.4 });
  hit(w('to', 2.4) + 0.2, 'whip to tower', 'whoosh', { from: 500, to: 2600, len: 0.42, pan: 0.4 });
  hit(w('motion', 3.1), 'MOTION', 'click', { pan: -0.3 });
  hit(w('graphics', 3.5), 'GRAPHICS', 'click', { pan: 0.3 });
  hit(w('design', 4.0), 'DESIGN', 'click+tok', { pitch: 'D4', gain: 0.25 });
  hit(w("I'm", 5.2), 'cut: top-down, I\'M', 'thud', { pitch: 110, gain: 0.3 });
  hit(w('not', 5.4), 'NOT (red)', 'sub+thud', { gain: 0.4, pitch: 150, to: 48, len: 0.7 });
  hit(w('creating', 5.6), 'CREATING', 'thud', { pitch: 120, gain: 0.3 });
  hit(w('anything', 6.3), 'ANYTHING', 'thud', { pitch: 100, gain: 0.32 });
  hit(7.05, 'swoop down', 'whoosh', { from: 300, to: 1400, len: 0.6, gain: 0.25 });
  hit(w('After', 7.9), 'AFTER', 'whoosh', { from: 900, to: 300, len: 0.3, gain: 0.2 });
  hit(w('Effects', 8.3), 'EFFECTS', 'whoosh', { from: 900, to: 300, len: 0.3, gain: 0.2 });
  const tSlice = word('Effects', 8.3).t1 - 0.12;
  hit(tSlice, 'slice', 'whoosh+blip', { from: 7000, to: 2500, len: 0.25, pitch: 'A6', gain: 0.2 });
  hit(tSlice + 0.35, 'halves fall', 'thud', { pitch: 90, to: 40, gain: 0.3, len: 0.5 });
  hit(w('inside', 10.5), 'INSIDE rises', 'thud', { pitch: 140, gain: 0.25 });
  hit(w('inside', 10.5) + 0.75, 'doors open', 'whoosh', { from: 200, to: 700, len: 0.6, gain: 0.14 });
  hit(w('Claude', 11.4), 'the wall: CLAUDE', 'sub+thud', { gain: 0.42, pitch: 140, to: 45, len: 0.7 });
  hit(w('Code', 11.8), 'the wall: CODE', 'thud', { pitch: 120, to: 40, gain: 0.4 });
  const so = word('So', 11.9);
  hit(so.t1, 'through the O', 'riser+whoosh', { len: 0.5, from: 400, to: 4000, gain: 0.3 });
  ['No@12.9', 'No@14.6', 'No@15.9', 'No@17.5'].forEach((s, i) => {
    const t = w('No', Number(s.split('@')[1]));
    hit(t, `NO ${i + 1}`, 'sub+thud+click', { gain: 0.4 + i * 0.05, pitch: 160 - i * 10, to: 46, len: 0.55 + i * 0.08 });
  });
  for (const [x, n] of [['desktop', 13.2], ['workstation', 14.7], ['Effects', 16.9], ['keyframes', 17.6]]) {
    hit(word(x, n).t1 - 0.12, `strike ${x}`, 'click', { gain: 0.22 });
  }
  hit(w('keyframes', 17.6), 'diamonds pop', 'coins', { n: 7, spread: 0.24, gain: 0.18 });
  hit(word('keyframes', 17.6).t1 - 0.15, 'diamonds crack', 'crash', { len: 0.5, gain: 0.12 });
  hit(w('How', 19.0), 'cut: HOW', 'tick');
  hit(w('incredible', 19.5), 'INCREDIBLE', 'sub+thud+swell', { gain: 0.55, pitch: 170, to: 42, len: 0.8 });
  hit(word('incredible', 19.5).t1 + 0.02, 'INCREDIBLE: the wash', 'crash', { len: 1.8, gain: 0.2 });
  hit(w('this', 20.3), 'IS THIS?', 'tick');
  hit(w('this', 23.0), 'light cue 1', 'thud', { pitch: 70, to: 38, gain: 0.22, len: 0.5 });
  hit(w('done', 24.2), 'light cue 2', 'thud', { pitch: 76, to: 40, gain: 0.24, len: 0.5 });
  hit(w('skill', 25.3), 'SKILL forms', 'swell', { len: 0.5, gain: 0.18 });
  hit(word('skill', 25.3).t1 + 0.04, 'SKILL to dust', 'whoosh', { from: 2500, to: 6000, len: 0.7, gain: 0.18, pan: -0.3 });
  hit(word('skill', 25.3).t1 + 0.12, 'the prompt types', 'type', { n: 26, len: 0.75, gain: 0.12 });
  hit(w('prompt', 26.7), 'PROMPT rises', 'sub+whoosh', { from: 200, to: 1500, len: 0.5, gain: 0.4 });
  hit(w('Claude', 28.4), 'finale: CLAUDE', 'thud', { pitch: 120, gain: 0.32 });
  hit(w('Code', 29.6), 'finale: CODE', 'sub+thud', { gain: 0.58, pitch: 150, to: 40, len: 1.1 });
  hit(word('Code', 29.6).t1 + 0.03, 'finale: the wash', 'crash', { len: 2.4, gain: 0.24 });
  hit(30.8, 'end card', 'sub', { gain: 0.35, len: 1.4 });
}

// ---------------------------------------------------------------- motion blur budget
// Six sub-frames are smooth for camera drifts and type settling; the fastest moves (whips, the dive,
// letters flying past the lens) need fourteen or they print as stepped copies.
const FAST = (() => {
  const w = (x, n) => word(x, n).t0;
  const nos = [12.9, 14.6, 15.9, 17.5].map((n) => w('No', n));
  return [
    [w('Claude', 1.4) - 0.15, w('Claude', 1.4) + 0.5], [w('to', 2.4), w('motion', 3.1) + 0.35], [7.15, 7.85],
    [word('Effects', 8.3).t1 - 0.2, word('Effects', 8.3).t1 + 0.5], [w('inside', 10.5) + 0.4, word('So', 11.9).t1 + 0.25],
    ...nos.map((t) => [t - 0.42, t + 0.12]), [w('incredible', 19.5) - 0.2, w('incredible', 19.5) + 0.65],
    [w('prompt', 26.7) - 0.1, w('prompt', 26.7) + 0.45], [w('Code', 29.6) - 0.1, w('Code', 29.6) + 0.3], [30.35, 31.1],
  ];
})();

// ---------------------------------------------------------------- frame
function draw(ctx, u, t) {
  updateWorld(t);
  S.setCamera(CAM(t));
  S.renderTo(ctx);
  overlays(ctx, t);
}

M.film({
  fonts: [`400 100px ${DISPLAY}`, `400 40px ${UI}`, `500 40px ${UI}`, `600 40px ${UI}`],
  samples: (t) => (FAST.some(([a, b]) => t >= a && t < b) ? 14 : 6),
  hits: HITS,
  async init() {
    await S.init({ font: 'fonts/display.ttf' });
    station('A', buildA);
    station('B', buildB);
    station('C', buildC);
    station('D', buildD);
    station('E', buildE);
    station('F', buildF);
    station('G', buildG);
    station('K', buildK);
    buildCamera();
    buildHits();
    initPost();
  },
  draw,
  post,
});

/*
 * About as a ride: inside the head there is a small planet that is also a brain, and a
 * line follower drives along an orange line around it. You drive it (wheel, arrow keys,
 * a swipe); the camera follows from behind, like in a racing game.
 *
 *  - The robot and camera stay put; the planet turns under them, so the horizon curves
 *    away and the next stop rises over it.
 *  - Along the way: the four stops of the story (particle shapes that assemble as you come
 *    near) and skill tokens on the line. Drive over a token and it flies into the inventory
 *    at the bottom. The machine-learning stretch is still being built: dashed line, locked tokens.
 *  - It starts with F1 lights: five lamps, out, go. The first input after they go out
 *    is your reaction time.
 *  - The pit stop at the end is for the off-hours things.
 *
 * Everything on the planet is in planet space (world units, centre at the origin).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as F from './formations.js';

const RP = 5;                 // planet radius
const K = RP / 6;             // positions below are written for a radius-6 planet and scaled by this
const LIFT = 0.012;           // the line sits just above the surface
const VMAX = 3.8, FRICTION = 1.5, ACCEL = 5.5, BOOST = 2.4;

// Where things are along the line (world units from the start, before scaling by K).
// Stops stand to the right of the line, in the same order as the .station items in index.html.
// 03 is two stops: the job by day (right), IKE Tracker in the evenings (left), side by side
// because both count.
const STOPS = [
  { s: 7, side: 2.3, make: F.robotArm },
  { s: 13.6, side: 2.5, make: F.thesisNetwork },
  { s: 19.8, side: 2.6, make: F.railWagon },
  { s: 26.0, side: -2.1, make: F.ikeChart },
  { s: 31.6, side: 2.4, make: F.neuralLoading },
];
// The universities stand across the line from the first two stops.
const CAMPUS = [
  { s: 7.7, side: -2.6, make: F.campusTech },
  { s: 16.2, side: -2.3, make: F.campusEcon },
];
const PIT = { s: 36.4, side: 2.2, make: F.rubiksCube };   // off hours: the cube by the line
const ML_FROM = 27.6, ML_TO = 34.0;   // the dashed stretch: still being built (scaled where used)
const GATE_AT = 1.6 * K;      // a gantry with the stop's name stands this far before it; you drive under it
const START_GATE = 0.9 * K;   // the line is a closed lap: start and finish are the same gantry
// Skills on the line, grouped by the stop they belong to. `info` is what the inventory shows on hover.
const W1 = '01 · robotics', W2 = '02 · thesis', W3 = '03 · by day · rail data', WP = '03 · evenings · IKE Tracker';
const TOKENS = [
  ['C++', 'C++', 2.6, W1, 'My B.Eng. game: Qt bent into a game engine, played with a gyroscope.'],
  ['C#', 'C#', 3.6, W1, 'Learned from zero in Unity for my remake of Age of War.'],
  ['Arduino & STM32', 'STM', 4.6, W1, 'Microcontrollers for sensors and motors, like the line follower that started all this.'],
  ['ABB & FANUC robots', 'ABB', 5.6, W1, 'Programming industrial robot arms in the Automation & Robotics labs.'],
  ['Statistics', 'STAT', 9.2, W2, 'Spearman rank correlations with Benjamini–Hochberg correction, in my master’s thesis.'],
  ['Survey research', 'SURV', 10.1, W2, 'A survey of 50 viewers of G2 content, tied to seven composite indices.'],
  ['Python', 'PY', 11.0, W2, 'My main language for data: analysis, scripts and the IKE Tracker backend.'],
  ['Pandas', 'PD', 11.9, W2, 'Cleaning and joining data, from survey answers to broker exports.'],
  ['SQL', 'SQL', 15.4, W3, 'Getting production and work-order data out of the systems it lives in.'],
  ['Power BI (DAX)', 'DAX', 16.3, W3, 'Dashboards and DAX measures that turn that data into something people read.'],
  ['Power Platform', 'PP', 17.2, W3, 'Apps and flows that automate business processes at work.'],
  ['ERP & MES', 'ERP', 18.1, W3, 'Integrating, maintaining and improving the tools around production.'],
  ['Django', 'DJ', 21.2, WP, 'The full-stack framework behind IKE Tracker, my investment app.'],
  ['NumPy', 'NP', 21.9, WP, 'The number crunching under returns and allocations.'],
  ['JavaScript', 'JS', 22.6, WP, 'Front ends: the IKE Tracker dashboard and this site in Three.js.'],
  ['Chart.js', 'CHT', 23.3, WP, 'TWR/MWR performance and asset-allocation charts.'],
  ['Git & GitHub', 'GIT', 24.0, WP, 'Version control for every project; this site deploys from GitHub.'],
  ['Docker', 'DKR', 24.7, WP, 'Containers to run and ship the apps.'],
  ['next level', '?', 29.0, '', '', true], ['next level', '?', 29.8, '', '', true], ['next level', '?', 32.6, '', '', true],
].map(([name, short, s, where, info, locked = false]) => ({ name, short, s: s * K, where, info, locked }));
// Memories on the left: the projects, as particle shapes next to the skills they were built with.
const MEMORIES = [
  { s: 1.9, side: -1.55, make: F.lineFollower, label: 'Line Follower · the cardboard original' },
  { s: 3.4, side: -1.6, make: F.ticTacToe, label: 'Tic-Tac-Toe · my first algorithm' },
  { s: 4.9, side: -1.6, make: F.gyroscope, label: 'Dance Game · C++ & Qt' },
  { s: 6.3, side: -1.6, make: F.sigmaTowers, label: 'Age of Sigma · C# & Unity' },
  { s: 38.4, side: -1.55, make: F.browserWindow, label: 'This website · Three.js · you are here' },
].map((m) => ({ ...m, s: m.s * K }));
// Synapses: arches of light over the line that fire as you pass under them.
// The one at 20.9 is dusk: from the job to the evenings.
const ARCHES = [8.3, 10.55, 20.9, 27.0, 28.4, 33.3, 37.5, 39.0].map((s) => ({ s: s * K, cool: s > ML_FROM && s < ML_TO + 1 }));
// The rail-data stretch runs on sleepers and rails.
const RAILS_FROM = 14.4 * K, RAILS_TO = 20.6 * K;
// Boost pads: drive over one and it throws you forward.
const PADS = [7.8, 14.2, 20.4].map((s) => s * K);
STOPS.forEach((st) => { st.s *= K; });
CAMPUS.forEach((c) => { c.s *= K; });
PIT.s *= K;

const R = Math.random;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/* --------------------------------------------------------------- noise -- */

function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
           l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
/** 1 on the ridge of a fold (gyrus), 0 in the grooves. */
function folds(x, y, z) {
  // Domain-warped noise: its mid-level contour is a wavy, folded line, like the crest of a gyrus.
  const k = 4.4, wx = vnoise(x * 2.5 + 7, y * 2.5, z * 2.5) - 0.5, wy = vnoise(x * 2.5, y * 2.5 + 3, z * 2.5) - 0.5, wz = vnoise(x * 2.5, y * 2.5, z * 2.5 + 5) - 0.5;
  const n1 = vnoise((x + wx * 0.7) * k, (y + wy * 0.7) * k, (z + wz * 0.7) * k);
  const n2 = vnoise(x * k * 2.1 + 11, y * k * 2.1, z * k * 2.1);
  return 1 - Math.abs((n1 * 0.7 + n2 * 0.3) * 2 - 1);
}

/* ---------------------------------------------------------------- brain -- */

const BRAIN_VS = /* glsl */`
  uniform float uSize, uFogNear, uFogFar, uAlpha, uTime;
  uniform vec3 uPulseDir;
  attribute vec3 aCol;
  attribute float aSize;
  varying vec3 vC;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float D = -mv.z;
    gl_PointSize = clamp(uSize * aSize / D, 1.0, 7.0);
    // Thoughts: a soft band of light sweeps across the folds now and then.
    float pulse = pow(max(0.0, sin(dot(normalize(position), uPulseDir) * 2.2 - uTime * 0.9)), 18.0);
    vC = aCol * (1.0 + pulse * 1.6) + vec3(0.25, 0.18, 0.1) * pulse;
    vA = uAlpha * (1.0 - smoothstep(uFogNear, uFogFar, D)) * smoothstep(0.12, 0.5, D);
  }
`;
const DOT_FS = /* glsl */`
  varying vec3 vC;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, r));
  }
`;

// Each stretch of the lap lies over its own lobe, tinted a little differently (unscaled s, colour).
const LOBES = [[0, [1.0, 0.74, 0.48]], [8.6, [0.8, 0.62, 1.0]], [14.4, [0.45, 0.95, 0.92]], [20.8, [0.58, 1.0, 0.66]], [27.6, [0.86, 0.93, 1.0]], [34.6, [1.0, 0.62, 0.38]], [39.4, [1.0, 0.74, 0.48]]];
function lobeTint(su) {
  for (let i = 0; i < LOBES.length - 1; i++) {
    const [a, ca] = LOBES[i], [b, cb] = LOBES[i + 1];
    if (su < b || i === LOBES.length - 2) {
      const m = smoothstep(b - 1.2, b + 1.2, su);   // blend across the border
      return ca.map((c, j) => c + (cb[j] - c) * m);
    }
  }
  return LOBES[0][1];
}

function buildBrain(n, path) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  let i = 0;
  while (i < n) {
    let x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1;
    const l = Math.hypot(x, y, z);
    if (l > 1 || l < 0.1) continue;
    x /= l; y /= l; z /= l;
    const ridge = folds(x, y, z);
    const fissure = Math.abs(x);                        // the gap between the two hemispheres
    if (fissure < 0.03) continue;
    const crest = Math.max(smoothstep(0.8, 0.93, ridge), smoothstep(0.06, 0.03, fissure) * 0.8);
    if (R() > 0.07 + 0.93 * crest) continue;            // dots gather on the crests, the grooves stay dark
    const r = RP * (0.999 + crest * 0.007);
    pos.set([x * r, y * r, z * r], i * 3);
    const lum = 0.3 + 0.6 * crest;
    const c = F.blue(lum), tint = lobeTint(path.along(x, y, z) / path.total * 39.4);
    col.set(c.map((v, j) => v * 0.7 + tint[j] * lum * 0.3), i * 3);
    size[i] = 0.6 + R() * 0.8;
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const uniforms = { uSize: { value: 30 }, uFogNear: { value: 5 }, uFogFar: { value: 11 }, uAlpha: { value: 0.85 }, uTime: { value: 0 }, uPulseDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: BRAIN_VS, fragmentShader: DOT_FS, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  return { pts, uniforms };
}

function buildStars(n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize().multiplyScalar(18 + R() * 16);
    pos.set([v.x, v.y, v.z], i * 3);
    col.set(R() < 0.08 ? [1, 0.6, 0.3] : [0.6, 0.75, 1], i * 3);
    size[i] = 2 + R() * 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const uniforms = { uSize: { value: 30 }, uFogNear: { value: 80 }, uFogFar: { value: 90 }, uAlpha: { value: 0.5 }, uTime: { value: 0 }, uPulseDir: { value: new THREE.Vector3(0, 1, 0) } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: BRAIN_VS, fragmentShader: DOT_FS, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  return { pts, uniforms };
}

/* ----------------------------------------------------------------- path -- */

// The route: one closed lap around the brain, wavering left and right. s wraps around,
// so driving past the end comes back over the start (the finish line).
function buildPath() {
  const E3 = new THREE.Vector3(0.18, 0.25, 0.95).normalize();
  const E1 = new THREE.Vector3(1, 0, 0).sub(E3.clone().multiplyScalar(E3.x)).normalize();
  const E2 = new THREE.Vector3().crossVectors(E3, E1);
  const M = 5000, U = Math.PI * 2;
  const pts = [], len = [0];
  for (let k = 0; k <= M; k++) {
    const u = (k / M) * U;
    const w = 0.16 * Math.sin(2 * u) + 0.07 * Math.sin(5 * u + 1);
    pts.push(E1.clone().multiplyScalar(Math.cos(u)).addScaledVector(E2, Math.sin(u)).addScaledVector(E3, w).normalize().multiplyScalar(RP));
    if (k) len.push(len[k - 1] + pts[k].distanceTo(pts[k - 1]));
  }
  const total = len[M];
  const idx = (s) => {
    s = ((s % total) + total) % total;
    let lo = 0, hi = M;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] < s) lo = m; else hi = m; }
    return [lo, (s - len[lo]) / (len[hi] - len[lo] || 1)];
  };
  const point = (s, out = new THREE.Vector3()) => { const [i, f] = idx(s); return out.lerpVectors(pts[i], pts[Math.min(M, i + 1)], f); };
  /** Frame at s: up (out of the planet), fwd (along the line), right. */
  const frame = (s, f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() }) => {
    point(s, f.p);
    f.up.copy(f.p).normalize();
    const a = point(s - 0.05, new THREE.Vector3()), b = point(s + 0.05, new THREE.Vector3());
    f.fwd.subVectors(b, a);
    f.fwd.addScaledVector(f.up, -f.fwd.dot(f.up)).normalize();
    f.right.crossVectors(f.fwd, f.up);
    return f;
  };
  /** Roughly how far along the lap a point on the sphere lies (for tinting the brain by region). */
  const along = (x, y, z) => {
    let u = Math.atan2(x * E2.x + y * E2.y + z * E2.z, x * E1.x + y * E1.y + z * E1.z);
    if (u < 0) u += Math.PI * 2;
    return (u / (Math.PI * 2)) * total;
  };
  return { total, point, frame, along };
}

const LINE_VS = /* glsl */`
  attribute float aS;
  attribute float aSide;
  varying float vS;
  varying float vSide;
  void main() {
    vS = aS; vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const LINE_FS = /* glsl */`
  uniform float uS, uDash, uDashTo, uTime;
  varying float vS;
  varying float vSide;
  void main() {
    float d = abs(vSide);
    float core = 1.0 - smoothstep(0.18, 0.32, d);
    float glow = exp(-d * d * 6.0) * 0.45;
    vec3 c = vec3(1.0, 0.55, 0.24);
    float a = core + glow;
    if (vS > uDash && vS < uDashTo) {   // still being built: dashes, cooler and dimmer
      a *= step(0.5, fract(vS * 2.2 - uTime * 0.15)) * 0.7;
      c = mix(c, vec3(0.55, 0.65, 0.85), 0.45);
    }
    a *= vS < uS ? 1.0 : 0.75;   // where you have been is a little brighter
    gl_FragColor = vec4(c * (1.0 + core * 0.3), a);
  }
`;

function buildLine(path) {
  const step = 0.04, W = 0.11;
  const n = Math.ceil(path.total / step) + 1;   // the whole lap, the last point closes it
  const pos = new Float32Array(n * 2 * 3), aS = new Float32Array(n * 2), aSide = new Float32Array(n * 2);
  const index = [];
  const f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  for (let i = 0; i < n; i++) {
    const s = Math.min(i * step, path.total);
    path.frame(s, f);
    const c = f.p.clone().multiplyScalar((RP + LIFT) / RP);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;
      const v = c.clone().addScaledVector(f.right, side * W);
      pos.set([v.x, v.y, v.z], (i * 2 + k) * 3);
      aS[i * 2 + k] = s;
      aSide[i * 2 + k] = side;
    }
    if (i) { const a = (i - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  geo.setIndex(index);
  const uniforms = { uS: { value: 0 }, uDash: { value: ML_FROM * K }, uDashTo: { value: ML_TO * K }, uTime: { value: 0 } };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------- stations -- */

const STATION_VS = /* glsl */`
  uniform float uK, uSize;
  attribute vec3 aCol;
  attribute float aA;
  attribute vec3 aRnd;
  varying vec3 vC;
  varying float vA;
  void main() {
    float t = clamp(uK * 1.7 - (aRnd.y * 0.5 + 0.5) * 0.7, 0.0, 1.0);
    float e = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    vec3 p = mix(position + aRnd * 1.6 + vec3(0.0, 1.0, 0.0), position, e);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float D = -mv.z;
    gl_PointSize = clamp(uSize / D, 1.0, 6.0);
    vC = aCol;
    vA = aA * mix(0.1, 1.0, e) * (1.0 - smoothstep(9.0, 13.0, D));
  }
`;

function buildStation(form, scale) {
  const n = form.N;
  const pos = new Float32Array(n * 3), a = new Float32Array(n), rnd = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = form.pos[i * 4]; pos[i * 3 + 1] = form.pos[i * 4 + 1] + 0.5; pos[i * 3 + 2] = form.pos[i * 4 + 2];
    a[i] = form.pos[i * 4 + 3];
    rnd.set([R() * 2 - 1, R() * 2 - 1, R() * 2 - 1], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(form.col, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(a, 1));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
  const uniforms = { uK: { value: 0 }, uSize: { value: 30 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: STATION_VS, fragmentShader: DOT_FS, uniforms, transparent: true, depthWrite: false }));
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  pts.scale.setScalar(scale);
  return { pts, uniforms };
}

/** A group standing on the planet at s, `side` units to the right (−left), facing the oncoming robot. */
function placeOnPath(path, obj, s, side, height = 0) {
  const f = path.frame(s);
  const base = f.p.clone().addScaledVector(f.right, side);
  const up = base.clone().normalize();
  obj.position.copy(base.setLength(RP + height));
  const face = side ? f.fwd.clone().multiplyScalar(-0.6).addScaledVector(f.right, -Math.sign(side) * 0.8) : f.fwd.clone().negate();
  face.addScaledVector(up, -face.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, face);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, face));
}

/* -------------------------------------------------------------- gantries -- */

// A sign over the line, like a gantry on a race track: the stop's name, readable from far
// away, and you drive under it. Drawn on a canvas (redrawn when its text changes).
const GH = 0.4, GY = 0.86;   // panel height, clearance (the camera rides under it)

/** GW: width (narrower on phones, where the view is tall and narrow). */
function buildGantry(GW = 1.7) {
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = Math.round(1024 * GH / GW);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const back = new THREE.MeshBasicMaterial({ color: 0x0a1228, transparent: true, depthWrite: false });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1d2c55, metalness: 0.6, roughness: 0.4, transparent: true });
  const hot = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: 1.4, transparent: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), face);
  panel.position.y = GY + GH / 2;
  panel.renderOrder = 3;
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), back);
  rear.position.set(0, GY + GH / 2, -0.005);
  rear.rotation.y = Math.PI;
  g.add(panel, rear);
  const postGeo = new THREE.BoxGeometry(0.045, GY + GH + 0.04, 0.045), capGeo = new THREE.BoxGeometry(0.07, 0.025, 0.07);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frame);
    post.position.set(sx * (GW / 2 + 0.03), (GY + GH + 0.04) / 2, 0);
    const cap = new THREE.Mesh(capGeo, hot);
    cap.position.set(sx * (GW / 2 + 0.03), GY + GH + 0.05, 0);
    g.add(post, cap);
  }
  const mats = [face, back, frame, hot];
  let drawn = '';
  return {
    g,
    setOpacity(a) { mats.forEach((m) => { m.opacity = a; }); g.visible = a > 0.01; },
    /** spec: { kicker, title, tone: 'hot' | 'cool' | 'check', progress } */
    draw(spec) {
      const key = JSON.stringify(spec);
      if (key === drawn) return;
      drawn = key;
      drawGantry(canvas, spec);
      tex.needsUpdate = true;
    },
  };
}

function drawGantry(canvas, { kicker = '', title = '', tone = 'hot', progress = null }) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height, u = H / 241;   // laid out for 1024 × 241
  const css = getComputedStyle(document.documentElement);
  const sans = css.getPropertyValue('--sans').trim() || 'system-ui, sans-serif';
  const mono = css.getPropertyValue('--mono').trim() || 'monospace';
  const accent = tone === 'cool' ? '#8ea6d8' : '#ff8a3d';
  c.clearRect(0, 0, W, H);
  const r = 26, b = 6;
  c.beginPath();
  c.roundRect(b, b, W - 2 * b, H - 2 * b, r);
  c.fillStyle = 'rgba(6, 12, 30, 0.92)';
  c.fill();
  c.lineWidth = b;
  c.strokeStyle = accent;
  if (tone === 'cool') c.setLineDash([26, 16]);
  c.stroke();
  c.setLineDash([]);
  let x0 = 48;
  if (tone === 'check') {   // a chequered flag strip on both ends
    const q = 20;
    c.save();
    c.clip();
    for (const sx of [0, W - 4 * q]) {
      for (let i = 0; i < 4; i++) for (let j = 0; j * q < H; j++) {
        c.fillStyle = (i + j) % 2 ? '#e8f0ff' : '#0a1228';
        c.fillRect(sx + i * q, j * q, q, q);
      }
    }
    c.restore();
    x0 = 4 * q + 40;
  }
  const maxW = W - x0 - (tone === 'check' ? 4 * 20 + 40 : 48);
  c.textBaseline = 'alphabetic';
  c.fillStyle = accent;
  c.font = `500 ${34 * u}px ${mono}`;
  c.fillText(kicker.toUpperCase(), x0, H / 2 - 48 * u);
  let size = 82 * u;
  c.font = `600 ${size}px ${sans}`;
  while (c.measureText(title).width > maxW && size > 40) { size -= 2; c.font = `600 ${size}px ${sans}`; }
  c.fillStyle = '#eef3ff';
  c.fillText(title, x0, H / 2 + (progress === null ? 48 : 32) * u);
  if (progress !== null) {   // a loading bar: still being built
    const y = H / 2 + 64 * u, bw = maxW, bh = 14 * u;
    c.fillStyle = 'rgba(142, 166, 216, 0.22)';
    c.beginPath(); c.roundRect(x0, y, bw, bh, 7); c.fill();
    c.fillStyle = accent;
    c.beginPath(); c.roundRect(x0, y, bw * progress, bh, 7); c.fill();
    c.font = `500 ${34 * u}px ${mono}`;
    c.fillStyle = '#b8c6e4';
    c.textAlign = 'right';
    c.fillText(`LOADING ${Math.round(progress * 100)}%`, x0 + bw, H / 2 - 48 * u);
    c.textAlign = 'left';
  }
}

/* ------------------------------------------------------------- scenery -- */

// A synapse: two strands of light arching over the line. A pulse runs along it now and
// then, and the whole arch fires when the robot passes under it.
const ARCH_VS = /* glsl */`
  uniform float uSize, uTime, uPhase, uFire;
  uniform vec3 uCol, uHot;
  attribute float aT;
  attribute float aR;
  varying vec3 vC;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float D = -mv.z;
    gl_PointSize = clamp(uSize * (0.6 + aR * 0.8) / D, 1.0, 7.0);
    float head = fract(uTime * 0.38 + uPhase) * 1.6 - 0.3;
    float p = exp(-pow((aT - head) * 8.0, 2.0));
    float lit = max(p, uFire);
    vC = mix(uCol, uHot, lit) * (1.0 + lit * 1.3);
    vA = (0.32 + 0.68 * lit) * (1.0 - smoothstep(5.5, 8.5, D)) * smoothstep(0.15, 0.7, D);
  }
`;

function buildArch(cool) {
  const N = 900, hw = 1.15, hh = 1.32;
  const pos = new Float32Array(N * 3), aT = new Float32Array(N), aR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = R(), th = t * Math.PI, strand = i % 2;
    const twist = Math.sin(th * 7 + strand * Math.PI) * 0.055;
    const j = () => (R() - 0.5) * 0.03;
    pos.set([-hw * Math.cos(th) + j(), hh * Math.sin(th) + j() + twist * 0.4, twist + j()], i * 3);
    aT[i] = t;
    aR[i] = R();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  const uniforms = {
    uSize: { value: 30 }, uTime: { value: 0 }, uPhase: { value: R() }, uFire: { value: 0 },
    uCol: { value: new THREE.Color(cool ? 0x6f86b8 : 0x5b8cff) }, uHot: { value: new THREE.Color(cool ? 0xd8e4ff : 0xffa36b) },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: ARCH_VS, fragmentShader: DOT_FS, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  pts.rotation.y = (R() - 0.5) * 0.6;   // each one leans its own way
  const g = new THREE.Group();
  g.add(pts);
  return { g, uniforms };
}

/** Sleepers and two steel rails along the line, from s0 to s1. */
function buildRails(path, s0, s1) {
  const g = new THREE.Group();
  const f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  const step = 0.17, n = Math.floor((s1 - s0) / step);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.01, 0.045), new THREE.MeshStandardMaterial({ color: 0x252c44, roughness: 0.85, metalness: 0.1 }), n);
  const m = new THREE.Matrix4(), back = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    path.frame(s0 + i * step, f);
    m.makeBasis(f.right, f.up, back.copy(f.fwd).negate());
    m.setPosition(f.p.clone().multiplyScalar((RP + 0.004) / RP));
    sleepers.setMatrixAt(i, m);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0xa9bcdf, metalness: 0.9, roughness: 0.25, emissive: 0x1a2440, side: THREE.DoubleSide });
  for (const off of [-0.165, 0.165]) {
    const k = Math.floor((s1 - s0) / 0.05) + 1;
    const pos = new Float32Array(k * 2 * 3), index = [];
    for (let i = 0; i < k; i++) {
      path.frame(s0 + i * 0.05, f);
      const c = f.p.clone().multiplyScalar((RP + 0.02) / RP).addScaledVector(f.right, off);
      for (let e = 0; e < 2; e++) pos.set(c.clone().addScaledVector(f.right, (e ? 1 : -1) * 0.012).toArray(), (i * 2 + e) * 3);
      if (i) { const a = (i - 1) * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, railMat));
  }
  g.add(sleepers);
  return g;
}

/** A boost pad: chevrons on the line that stream forward. */
function buildPad() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.lineWidth = 16; x.lineCap = 'round'; x.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 60 + i * 80;
    x.strokeStyle = i === 0 ? '#fff1e6' : '#ff8a3d';
    x.shadowColor = '#ff6a1a'; x.shadowBlur = 14;
    x.beginPath(); x.moveTo(22, y + 34); x.lineTo(64, y - 6); x.lineTo(106, y + 34); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.36), mat);
  mesh.rotation.x = -Math.PI / 2;   // flat on the ground, the chevrons pointing along the line
  mesh.renderOrder = 3;
  const g = new THREE.Group();
  g.add(mesh);
  return { g, tex, mat };
}

/* ---------------------------------------------------------------- robot -- */

function buildRobot() {
  const g = new THREE.Group();
  const m = (geo, mat) => new THREE.Mesh(geo, mat);
  const body = new THREE.MeshStandardMaterial({ color: 0x223a72, metalness: 0.45, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b1430, metalness: 0.4, roughness: 0.6 });
  const hot = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: 1.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8fa6cc, metalness: 0.8, roughness: 0.3 });
  const chassis = m(new RoundedBoxGeometry(0.2, 0.035, 0.27, 3, 0.012), body);
  chassis.position.y = 0.055;
  const deck = m(new RoundedBoxGeometry(0.15, 0.03, 0.12, 2, 0.008), dark);
  deck.position.set(0, 0.085, 0.04);
  const sensor = m(new RoundedBoxGeometry(0.17, 0.012, 0.025, 2, 0.005), hot);
  sensor.position.set(0, 0.03, -0.14);
  const led = m(new THREE.SphereGeometry(0.012, 12, 8), hot);
  led.position.set(0.05, 0.105, 0.07);
  const caster = m(new THREE.SphereGeometry(0.022, 16, 10), steel);
  caster.position.set(0, 0.022, -0.09);
  const wheels = [-1, 1].map((sx) => {
    const w = m(new THREE.CylinderGeometry(0.045, 0.045, 0.028, 24), dark);
    w.rotation.z = Math.PI / 2;
    const hub = m(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), steel);
    hub.rotation.z = Math.PI / 2;
    const wg = new THREE.Group();
    wg.position.set(sx * 0.118, 0.045, 0.06);
    wg.add(w, hub);
    const spoke = m(new THREE.BoxGeometry(0.03, 0.07, 0.008), steel);   // shows the wheel turning
    spoke.position.x = sx * 0.008;
    wg.add(spoke);
    return wg;
  });
  g.add(chassis, deck, sensor, led, caster, ...wheels);
  const glow = new THREE.PointLight(0xff8a3d, 0.8, 0.9, 2);
  glow.position.set(0, 0.05, -0.2);
  g.add(glow);
  return { g, wheels };
}

/** Does the planet (sphere at (0, -RP, 0)) stand between a and b? */
const _d = new THREE.Vector3(), _m = new THREE.Vector3();
function blockedByPlanet(a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  _d.divideScalar(len);
  _m.set(a.x, a.y + RP, a.z);
  const bq = _m.dot(_d), c = _m.lengthSq() - (RP * 0.99) ** 2;
  const disc = bq * bq - c;
  if (disc < 0) return false;
  const t = -bq - Math.sqrt(disc);
  return t > 0 && t < len - 0.05;
}

/* ----------------------------------------------------------------- main -- */

export function createJourney({ small = false, audio = null, root, onFinish = null }) {
  const group = new THREE.Group();
  group.visible = false;
  const planet = new THREE.Group();
  planet.position.y = -RP;
  group.add(planet);

  group.add(new THREE.HemisphereLight(0x9cbcff, 0x0a1430, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-2, 4, 3);
  group.add(key);

  const path = buildPath();
  const brain = buildBrain(small ? 32000 : 68000, path);
  const stars = buildStars(small ? 600 : 1200);
  // A solid dark core: hides the far side of the planet (and of the line) and gives the folds depth.
  const core = new THREE.Mesh(new THREE.SphereGeometry(RP * 0.993, 96, 64), new THREE.MeshBasicMaterial({ color: 0x040a1c }));
  planet.add(core, brain.pts, stars.pts);
  const line = buildLine(path);
  planet.add(line.mesh);

  // Stops, the pit, and the university buildings behind the first two stops.
  const stations = [...STOPS, PIT, ...CAMPUS].map((st) => {
    const campus = CAMPUS.includes(st);
    const { pts, uniforms } = buildStation(st.make(small ? (campus ? 6000 : 5000) : (campus ? 11000 : 9000)), st === PIT ? 1.3 : campus ? 2.3 : 1.8);
    const holder = new THREE.Group();
    holder.add(pts);
    placeOnPath(path, holder, st.s, st.side * (small ? 0.62 : 1));   // phones see less to the sides
    planet.add(holder);
    return { ...st, uniforms };
  });

  // The lap: the start gantry is also the finish; crossing it again ends the ride.
  const L = path.total;
  const S_FIN = L + START_GATE;
  const S_END = S_FIN + 2.5;
  const stEls = [...root.querySelectorAll('.station')];
  const stopSpec = (i) => {
    const el = stEls[i], n = el.querySelector('.station-n');
    const num = n.querySelector('b')?.textContent.trim() ?? String(i + 1).padStart(2, '0');
    const when = n.textContent.replace(num, '').replace(/\s+/g, ' ').trim();
    const ml = el.classList.contains('next');
    return { kicker: `${num} · ${when}`, title: el.querySelector('h3').textContent.trim(), tone: ml ? 'cool' : 'hot', progress: ml ? 0.37 : null };
  };
  const START_SPEC = { kicker: 'about me · lap 1', title: 'Start', tone: 'check' };
  const FINISH_SPEC = { kicker: 'finish · next up', title: 'Projects →', tone: 'check' };
  const gates = [
    { s: START_GATE, start: true },
    ...STOPS.map((stop, i) => ({ s: stop.s - GATE_AT, spec: () => stopSpec(i) })),
    { s: PIT.s - GATE_AT, spec: () => ({ kicker: 'pit stop', title: 'Off hours', tone: 'hot' }) },
  ].map((gt) => {
    const gantry = buildGantry(small ? 1.12 : 1.7);
    placeOnPath(path, gantry.g, gt.s, 0);
    planet.add(gantry.g);
    return { ...gt, gantry };
  });
  const drawGates = () => gates.forEach((gt) => gt.gantry.draw(gt.start ? (s > L / 2 ? FINISH_SPEC : START_SPEC) : gt.spec()));

  // Scenery: project memories on the left, synapse arches, rails, boost pads.
  const MEM_SCALE = 0.95;
  const memories = MEMORIES.map((mem) => {
    const { pts, uniforms } = buildStation(mem.make(small ? 3000 : 5500), MEM_SCALE);
    const holder = new THREE.Group();
    holder.add(pts);
    placeOnPath(path, holder, mem.s, mem.side * (small ? 0.62 : 1));
    planet.add(holder);
    return { ...mem, holder, uniforms };
  });
  const arches = ARCHES.map((a) => {
    const arch = buildArch(a.cool);
    placeOnPath(path, arch.g, a.s, 0);
    planet.add(arch.g);
    return { ...a, ...arch, firedAt: -1e9 };
  });
  planet.add(buildRails(path, RAILS_FROM, RAILS_TO));
  const pads = PADS.map((ps) => {
    const pad = buildPad();
    placeOnPath(path, pad.g, ps, 0, LIFT + 0.003);
    planet.add(pad.g);
    return { s: ps, ...pad, hitAt: -1e9 };
  });
  let boostAt = -1e9;

  // Tokens: hexagonal coins on the line.
  const coinGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.022, 6);
  const tokens = TOKENS.map((tk) => {
    const mat = tk.locked
      ? new THREE.MeshStandardMaterial({ color: 0x5b6680, metalness: 0.4, roughness: 0.6, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0x9cbcff, emissive: 0x2a5cff, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.35, transparent: true });
    const coin = new THREE.Mesh(coinGeo, mat);
    coin.rotation.x = Math.PI / 2;
    const spin = new THREE.Group();
    spin.add(coin);
    const holder = new THREE.Group();
    holder.add(spin);
    placeOnPath(path, holder, tk.s, 0, 0.13);
    planet.add(holder);
    return { ...tk, holder, spin, mat, got: false, gotAt: 0 };
  });

  const robot = buildRobot();
  group.add(robot.g);

  /* ---- HUD ---- */
  const hud = root.querySelector('.journey');
  const $h = (s) => hud.querySelector(s);
  const lightsEl = $h('.j-lights'), lamps = [...lightsEl.querySelectorAll('i')], lightsMsg = $h('.j-lights-msg');
  const card = $h('.j-card'), cardKicker = $h('.j-kicker'), cardTitle = $h('.j-card h3'), cardText = $h('.j-text');
  const labels = $h('.j-labels'), slots = $h('.j-slots'), count = $h('.j-count'), hint = $h('.j-hint'), toast = $h('.j-toast');
  const total = tokens.filter((t) => !t.locked).length;
  // Hover (or tap, or focus) a slot in the inventory: what the skill is and where it comes from.
  const inv = $h('.j-inv');
  const pop = document.createElement('div');
  pop.className = 'j-pop';
  pop.id = 'j-pop';
  pop.setAttribute('role', 'tooltip');
  pop.setAttribute('aria-hidden', 'true');
  inv.appendChild(pop);
  let popFor = null, popTimer = 0;
  const showPop = (t) => {
    clearTimeout(popTimer);
    const already = pop.classList.contains('is-on');
    pop.classList.toggle('is-instant', already);   // sliding along the slots: no fade between them
    popFor = t;
    const [title, where, text] = t.locked
      ? ['Locked', 'next level', 'Machine learning: models that learn from the kind of data I already work with. Still being built.']
      : t.got ? [t.name, t.where, t.info] : ['???', t.where, 'Still out on the line. Drive over it to collect it.'];
    pop.replaceChildren();
    const b = document.createElement('b'); b.textContent = title;
    const w = document.createElement('span'); w.className = 'mono'; w.textContent = where;
    const p = document.createElement('p'); p.textContent = text;
    pop.append(b, w, p);
    pop.classList.toggle('is-locked', t.locked || !t.got);
    pop.classList.add('is-on');
    pop.setAttribute('aria-hidden', 'false');
    const r = t.slot.getBoundingClientRect(), ir = inv.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const cx = Math.max(12 + pw / 2, Math.min(innerWidth - 12 - pw / 2, r.left + r.width / 2));
    pop.style.left = `${cx - ir.left}px`;
  };
  const hidePop = () => {
    clearTimeout(popTimer);
    pop.classList.remove('is-on', 'is-instant');
    pop.setAttribute('aria-hidden', 'true');
    popFor = null;
  };
  tokens.forEach((t) => {
    const li = document.createElement('li');
    li.className = t.locked ? 'locked' : '';
    li.textContent = t.locked ? '?' : '';
    li.tabIndex = 0;
    li.setAttribute('aria-label', t.locked ? 'Locked skill' : t.name);
    li.setAttribute('aria-describedby', 'j-pop');
    li.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(popTimer);
      if (pop.classList.contains('is-on')) showPop(t);
      else popTimer = setTimeout(() => showPop(t), 120);   // passing over the bar on the way somewhere does not pop it
    });
    li.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(popTimer);
      popTimer = setTimeout(hidePop, 80);   // a short grace period, so the next slot can take over
    });
    li.addEventListener('focus', () => showPop(t));
    li.addEventListener('blur', hidePop);
    li.addEventListener('click', () => (popFor === t && !matchMedia('(hover: hover)').matches ? hidePop() : showPop(t)));
    slots.appendChild(li);
    t.slot = li;
    const lab = document.createElement('span');
    lab.className = t.locked ? 'locked' : '';
    lab.appendChild(document.createElement('b')).textContent = t.locked ? 'locked' : t.name;
    labels.appendChild(lab);
    t.label = lab;
  });
  memories.forEach((m) => {
    const lab = document.createElement('span');
    lab.className = 'mem';
    lab.appendChild(document.createElement('b')).textContent = m.label;
    labels.appendChild(lab);
    m.tag = lab;
    m.tagW = 0;
  });
  // Card texts come from the static About (the version without WebGL), so there is one source.
  const st = stEls;
  const cards = [
    { from: -1, to: 1.2 * K, kicker: 'about me', title: root.querySelector('#about-title').textContent, text: root.querySelector('.about-hello .lead').textContent },
    ...STOPS.map((stop, i) => ({ stop: true, from: stop.s - 4.2 * K, to: stop.s + 2.2 * K, kicker: st[i].querySelector('.station-n').textContent.replace(/\s+/g, ' ').trim(), title: st[i].querySelector('h3').textContent, text: st[i].querySelector('p:not(.station-n):not(.loading)').textContent })),
    { from: PIT.s - 2.5 * K, to: L - 0.6, pit: true, kicker: 'pit stop · off hours', title: 'Cubes, strings, engines', text: '' },
    { from: L - 0.6, to: 999, finish: true, kicker: 'finish', title: 'Lap complete', text: 'Drive under the finish line: the camera comes up out of my head and over to the projects.' },
  ];
  let cardShown = -2;

  /* ---- state ---- */
  let s = 0, v = 0, phase = 'off', lightsAt = 0, outAt = 0, holdFor = 0, reaction = null, jumped = false;
  let leaving = false, finishedAt = 0, finishSent = false;
  let best = Number(localStorage.getItem('wk-f1-best')) || 0;
  let toastUntil = 0, lean = 0;
  const keys = new Set();
  const f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  const f2 = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  const basis = new THREE.Matrix4(), tmp = new THREE.Vector3();
  let w = 1, h = 1, pxPerUnit = 1000;

  function showToast(text, ms = 2200) {
    toast.textContent = text;
    toast.classList.add('is-on');
    toastUntil = performance.now() + ms;
  }

  /** Any "go" input: the first one after the lights go out is the reaction. */
  function react(timeStamp = performance.now()) {
    if (phase === 'lights') {
      if (!jumped) { jumped = true; lightsMsg.textContent = 'Jump start! Wait for the lights to go out.'; }
      return false;
    }
    if (phase === 'go') {
      phase = 'drive';
      reaction = Math.max(1, Math.round(timeStamp - outAt));
      const verdict = reaction < 200 ? 'faster than most F1 drivers' : reaction < 260 ? 'race-ready' : reaction < 400 ? 'solid start' : 'a relaxed start';
      if (!best || reaction < best) { best = reaction; localStorage.setItem('wk-f1-best', String(best)); }
      lightsMsg.innerHTML = `<b>${reaction} ms</b> ${verdict}`;
      setTimeout(() => { if (phase === 'drive') lightsEl.classList.remove('is-on'); }, 1800);
      return true;
    }
    return phase === 'drive';
  }

  function setCard(i) {
    if (i === cardShown) return;
    cardShown = i;
    card.classList.remove('is-in');
    if (i < 0) return;
    const c = cards[i];
    setTimeout(() => {
      if (cardShown !== i) return;
      cardKicker.textContent = c.kicker;
      cardTitle.textContent = c.title;
      card.classList.toggle('is-stop', !!c.stop);
      const got = tokens.filter((t) => t.got).length;
      if (c.pit) {
        cardText.innerHTML = `Speedcubing (11.84 s single), guitar, Formula 1 and games. ${reaction ? `Your start today: <b>${reaction} ms</b>${best ? ` · best <b>${best} ms</b>` : ''}.` : ''} Skills collected: <b>${got}/${total}</b>. Next here: a cube you can turn and a guitar you can play.`;
      } else if (c.finish) {
        cardText.innerHTML = `${c.text} Skills on board: <b>${got}/${total}</b>.`;
      } else cardText.textContent = c.text;
      card.classList.add('is-in');
    }, 170);   // the old card is out (160ms), then the new one comes in
  }

  return {
    group,
    get speed01() { return Math.min(1, Math.abs(v) / VMAX); },
    get progress() { return s / S_FIN; },
    /** Length of the lap (the finish line is just past it). */
    get lap() { return L; },
    /** Debug: jump along the line. */
    goto(x) { s = Math.max(0, Math.min(S_END, x)); },
    get phase() { return phase; },
    /** Viewport and pixel scale (px per world unit at distance 1). */
    setView(width, height, pxu) {
      w = width; h = height; pxPerUnit = pxu;
      brain.uniforms.uSize.value = pxu * 0.028;
      stars.uniforms.uSize.value = pxu * 0.05;
      stations.forEach((x) => { x.uniforms.uSize.value = pxu * 0.03; });
      memories.forEach((x) => { x.uniforms.uSize.value = pxu * 0.026; });
      arches.forEach((x) => { x.uniforms.uSize.value = pxu * 0.03; });
    },
    /** Called when the About opens. The ride resumes where it was; the lights run on every entry. */
    enter() {
      if (phase === 'finished' || s >= S_FIN) s = 0;   // a finished lap: back to the start (the skills stay collected)
      phase = 'arriving';
      leaving = false;
      finishSent = false;
      drawGates();   // here, not at load: the web fonts are in by now
      v = 0;
      jumped = false;
      reaction = null;
      lightsEl.classList.remove('is-on');
      lamps.forEach((l) => l.classList.remove('on'));
      hud.hidden = false;
      hud.classList.remove('is-in');
      cardShown = -2;
    },
    exit() {
      leaving = true;
      if (phase !== 'finished') { phase = 'off'; v = 0; }   // over the finish line the robot rolls on while the camera rises
      keys.clear();
      hidePop();
      lightsEl.classList.remove('is-on');
      toast.classList.remove('is-on');
      hud.classList.remove('is-in');
      card.classList.remove('is-in');
      labels.querySelectorAll(':scope > span').forEach((l) => { l.style.opacity = '0'; });
    },
    /** Wheel / swipe: +down = forward. */
    push(delta, timeStamp) {
      if (!react(timeStamp)) return;
      v = Math.max(-VMAX, Math.min(Math.max(VMAX, v), v + delta * 0.005));   // a boost may still be above VMAX
    },
    key(e, down) {
      const fwd = ['ArrowUp', 'KeyW', 'PageDown', 'Space', 'ArrowRight', 'KeyD'].includes(e.code);
      const back = ['ArrowDown', 'KeyS', 'PageUp', 'ArrowLeft', 'KeyA'].includes(e.code);
      if (!fwd && !back) return false;
      if (down && !e.repeat && !react(e.timeStamp)) return true;
      if (down) keys.add(fwd ? 'f' : 'b'); else keys.delete(fwd ? 'f' : 'b');
      return true;
    },
    tap(timeStamp) { react(timeStamp); },

    /**
     * Every frame while the About is open. arrive: 0..1 how far the camera has come down
     * to the robot (1 = behind it). Returns nothing; the camera is set by camera().
     */
    update(dt, t, arrive) {
      const now = performance.now();
      brain.uniforms.uTime.value = t;
      line.uniforms.uTime.value = t;

      if (phase === 'arriving' && arrive >= 1) {
        phase = 'lights';
        lightsAt = now;
        holdFor = 400 + R() * 1100;
        lightsEl.classList.add('is-on');
        lightsMsg.textContent = 'Lights out and away we go: scroll to drive.';
        hud.classList.add('is-in');
      }
      if (phase === 'lights') {
        const k = Math.floor((now - lightsAt - 300) / 550) + 1;
        const n = Math.max(0, Math.min(5, k));
        lamps.forEach((l, i) => {
          const on = i < n;
          if (on && !l.classList.contains('on')) audio?.blip(i === 4 ? 880 : 660);
          l.classList.toggle('on', on);
        });
        if (now - lightsAt > 300 + 5 * 550 + holdFor) {
          lamps.forEach((l) => l.classList.remove('on'));
          phase = 'go';
          outAt = now;
          if (!jumped) lightsMsg.textContent = 'GO!';
        }
      }

      // Driving: impulses from the wheel, steady push from held keys, friction.
      if (phase === 'drive') {
        if (keys.has('f') && v < VMAX) v = Math.min(VMAX, v + ACCEL * dt);
        if (keys.has('b')) v = Math.max(-VMAX, v - ACCEL * dt);
        v *= Math.exp(-FRICTION * dt);
        if (Math.abs(v) < 0.01) v = 0;
        const s0 = s;
        s += v * dt;
        if (s < 0) { s = 0; v = 0; }
        pads.forEach((pd) => {   // rolling forward over a boost pad
          if (v > 0 && s0 < pd.s && s >= pd.s && now - pd.hitAt > 1200) {
            pd.hitAt = now;
            boostAt = now;
            v = Math.min(VMAX + BOOST, v + BOOST);
            audio?.whoosh(true);
          }
        });
        if (s >= S_FIN + 0.25) {   // under the finish gantry: the lap is done
          phase = 'finished';
          finishedAt = now;
          audio?.finish();
          showToast('lap complete', 1600);
        }
      }
      if (phase === 'finished') {   // roll on through the finish, then up and out to the projects
        v = Math.max(v, 1.4);
        s = Math.min(S_END + 4, s + v * dt);
        if (!finishSent && now - finishedAt > 700) { finishSent = true; onFinish?.(); }
      }
      line.uniforms.uS.value = s;
      hint.classList.toggle('is-in', phase === 'go' || (phase === 'drive' && s < 1.5));

      // The planet turns so that the point at s is under the robot, the line ahead pointing away.
      path.frame(s, f);
      const back = tmp.copy(f.fwd).negate();
      basis.makeBasis(f.right, f.up, back).transpose();
      planet.quaternion.setFromRotationMatrix(basis);

      // Lean into turns: how fast the heading turns around "up".
      path.frame(s + 0.4, f2);
      const turn = f.fwd.clone().cross(f2.fwd).dot(f.up) / 0.4;
      lean += (-turn * v * 0.12 - lean) * Math.min(1, dt * 6);
      robot.g.rotation.z = Math.max(-0.3, Math.min(0.3, lean));
      robot.g.position.y = LIFT + Math.abs(v) * 0.0012 * Math.sin(t * 40);
      robot.wheels.forEach((wh) => { wh.rotation.x -= (v * dt) / 0.045; });

      // Stations assemble as you come near.
      stations.forEach((x) => { x.uniforms.uK.value = smoothstep(x.s - 7.5 * K, x.s - 3 * K, s); });

      // Memories assemble like the stops; synapses pulse and fire overhead; pads stream.
      memories.forEach((m) => { m.uniforms.uK.value = smoothstep(m.s - 6 * K, m.s - 2.5 * K, s); });
      arches.forEach((a) => {
        a.uniforms.uTime.value = t;
        if (Math.abs(a.s - s) < 0.12 && now - a.firedAt > 1500) a.firedAt = now;
        a.uniforms.uFire.value = Math.exp(-(now - a.firedAt) / 420);
      });
      pads.forEach((pd) => {
        pd.tex.offset.y = -t * 1.6;
        pd.mat.opacity = (0.65 + 0.35 * Math.exp(-(now - pd.hitAt) / 400)) * smoothstep(-0.3, 0.05, pd.s - s);
      });

      // Gantries rise over the horizon ahead and fade once the camera has passed under them.
      gates.forEach((gt) => {
        const ahead = (gt.start && s > L / 2 ? S_FIN : gt.s) - s;
        gt.gantry.setOpacity(smoothstep(6.5, 4.5, ahead) * smoothstep(-2.6, -1.5, ahead));
      });
      gates[0].gantry.draw(s > L / 2 ? FINISH_SPEC : START_SPEC);   // the start gantry turns into the finish

      // Tokens: spin, and get collected when the robot rolls over them.
      tokens.forEach((tk) => {
        tk.spin.rotation.y = t * 2 + tk.s;
        if (!tk.got && s >= tk.s - 0.22 && s <= tk.s + 0.5) {
          if (tk.locked) {
            if (!tk.seen) { tk.seen = true; tk.seenAt = now; showToast('locked · machine learning is the next level'); }
          } else {
            tk.got = true;
            tk.gotAt = now;
            tk.fly = true;
            audio?.collect();
          }
        }
        if (tk.got) {
          const k = clamp01((now - tk.gotAt) / 500);
          tk.spin.position.y = k * 0.35;
          tk.spin.scale.setScalar(1 + k * 0.6);
          tk.mat.opacity = 1 - k;
          tk.holder.visible = k < 1;
        } else if (tk.seen) {   // a locked token stays shut: it sinks back into the brain, out of the camera's way
          const k = clamp01((now - tk.seenAt) / 450);
          tk.spin.scale.setScalar(1 - k * k);
          tk.holder.visible = k < 1;
        }
      });
      count.textContent = String(tokens.filter((x) => x.got).length);

      // The card for wherever you are.
      let ci = -1;
      cards.forEach((c, i) => { if (s >= c.from && s < c.to) ci = i; });
      if (phase === 'arriving' || phase === 'off' || leaving) ci = -1;
      setCard(ci);

      if (now > toastUntil && toast.classList.contains('is-on')) toast.classList.remove('is-on');
    },

    /** Camera: k = 0 high above the planet, 1 = behind the robot. Then token labels follow it. */
    camera(cam, k, t) {
      const e = easeInOut(clamp01(k));
      const chaseFov = w / h < 1 ? 64 : 50;
      const turnSway = Math.max(-0.25, Math.min(0.25, lean * 0.8));
      const from = new THREE.Vector3(0, -RP + 9.5 * K, 16.5 * K), fromLook = new THREE.Vector3(0, -RP, 0);
      const to = new THREE.Vector3(turnSway, 0.5, 1.25), toLook = new THREE.Vector3(turnSway * 0.3, 0.02, -1.8);
      cam.position.lerpVectors(from, to, e);
      cam.up.set(0, 1, 0);
      cam.lookAt(tmp.lerpVectors(fromLook, toLook, e));
      const kick = Math.exp(-(performance.now() - boostAt) / 550);   // a boost widens the view for a moment
      cam.fov = 40 + (chaseFov - 40) * e + 9 * kick * e;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      brain.uniforms.uFogNear.value = 5 + (1 - e) * 30;
      brain.uniforms.uFogFar.value = 11 + (1 - e) * 40;

      // Labels over the tokens ahead, and chips flying into the inventory.
      // Memories: a quiet caption over each project shape while it is ahead of you.
      const memOn = phase !== 'off' && !leaving && k >= 1;
      memories.forEach((m) => {
        const ahead = m.s - s;
        let op = memOn ? smoothstep(4, 2.8, ahead) * smoothstep(0.5, 1.3, ahead) : 0;   // gone before it passes the camera
        if (op > 0) {
          m.holder.localToWorld(tmp.set(0, (0.5 + 0.62) * MEM_SCALE, 0));
          if (blockedByPlanet(cam.position, tmp)) op = 0;
          else {
            tmp.project(cam);
            if (tmp.z < 1) {
              m.tagW ||= m.tag.offsetWidth;   // the text never changes: measure once
              const half = m.tagW / 2 + 10;
              const x = Math.max(half, Math.min(w - half, ((tmp.x + 1) / 2) * w));
              m.tag.style.transform = `translate(${x}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
            }
            else op = 0;
          }
        }
        m.tag.style.opacity = String(op);
      });

      // The next token's name stays sharp until you pick it up; the ones after it wait, blurred.
      const vis = phase !== 'off' && !leaving && k >= 1;
      const near = vis ? tokens.filter((tk) => !tk.got && !tk.seen && tk.s - s > -0.25 && tk.s - s < 4.4).slice(0, 3) : [];
      tokens.forEach((tk) => {
        const ahead = tk.s - s;
        const rank = near.indexOf(tk);
        let show = rank >= 0;
        if (show) {   // hidden behind the curve of the planet?
          tk.holder.getWorldPosition(tmp);
          show = !blockedByPlanet(cam.position, tmp);
        }
        if (show) {
          tk.holder.getWorldPosition(tmp);
          tmp.y += 0.14;
          tmp.project(cam);
          if (tmp.z < 1) {
            tk.label.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
            tk.label.classList.toggle('is-next', rank === 0);
            tk.label.style.opacity = String(rank === 0 ? smoothstep(4.4, 3.1, ahead) : 0.6 * smoothstep(4.4, 2.8, ahead));
          } else tk.label.style.opacity = '0';
        } else tk.label.style.opacity = '0';
        if (tk.fly) {
          tk.fly = false;
          tk.holder.getWorldPosition(tmp);
          tmp.project(cam);
          const chip = document.createElement('span');
          chip.className = 'j-chip mono';
          chip.textContent = tk.name;
          chip.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -50%)`;
          labels.appendChild(chip);
          const r = tk.slot.getBoundingClientRect();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            chip.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) translate(-50%, -50%) scale(.6)`;
            chip.style.opacity = '0.2';
          }));
          setTimeout(() => {
            chip.remove();
            tk.slot.textContent = tk.short;
            tk.slot.classList.add('got', 'landed');   // a small pop as it lands
            tk.slot.addEventListener('animationend', () => tk.slot.classList.remove('landed'), { once: true });
            if (popFor === tk) showPop(tk);
          }, 470);
        }
      });
    },
  };
}

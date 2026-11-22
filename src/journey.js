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

const RP = 6;                 // planet radius
const LIFT = 0.012;           // the line sits just above the surface
const VMAX = 3.4, FRICTION = 1.5, ACCEL = 5;

// Where things are along the line (world units from the start).
// Stops stand to the right of the line (the description card is on the left).
const STOPS = [
  { s: 7, side: 2.3, make: F.robotArm },
  { s: 14, side: 2.5, make: F.thesisNetwork },
  { s: 21, side: 2.6, make: F.railWagon },
  { s: 30.5, side: 2.4, make: F.neuralLoading },
];
const S_END = 35.4;           // the robot parks here
const PIT = { s: S_END + 1.7, side: 0, make: F.rubiksCube };   // the cube waits at the end of the line
const ML_FROM = 26.5, ML_TO = 33.2;   // the dashed stretch: still being built
const TOKENS = [
  ['C++', 'C++', 2.6], ['C#', 'C#', 3.6], ['Arduino & STM32', 'STM', 4.6], ['ABB & FANUC robots', 'ABB', 5.6],
  ['Statistics', 'STAT', 9.6], ['Survey research', 'SURV', 10.6], ['Python', 'PY', 11.6], ['Pandas', 'PD', 12.6],
  ['SQL', 'SQL', 16.6], ['Power BI (DAX)', 'DAX', 17.6], ['Power Platform', 'PP', 18.6], ['ERP & MES', 'ERP', 19.6],
  ['Django', 'DJ', 22.6], ['NumPy', 'NP', 23.3], ['JavaScript', 'JS', 24], ['Chart.js', 'CHT', 24.7], ['Git & GitHub', 'GIT', 25.4], ['Docker', 'DKR', 26.1],
  ['next level', '?', 28.4, true], ['next level', '?', 29.2, true], ['next level', '?', 31.4, true],
].map(([name, short, s, locked = false]) => ({ name, short, s, locked }));

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

function buildBrain(n) {
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
    const c = F.blue(0.3 + 0.6 * crest);
    col.set(c, i * 3);
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

// The route: once around the brain, wavering left and right.
function buildPath() {
  const E3 = new THREE.Vector3(0.18, 0.25, 0.95).normalize();
  const E1 = new THREE.Vector3(1, 0, 0).sub(E3.clone().multiplyScalar(E3.x)).normalize();
  const E2 = new THREE.Vector3().crossVectors(E3, E1);
  const M = 5000, U = Math.PI * 2 * 0.985;
  const pts = [], len = [0];
  for (let k = 0; k <= M; k++) {
    const u = (k / M) * U;
    const w = 0.16 * Math.sin(2.3 * u) + 0.07 * Math.sin(5.1 * u + 1);
    pts.push(E1.clone().multiplyScalar(Math.cos(u)).addScaledVector(E2, Math.sin(u)).addScaledVector(E3, w).normalize().multiplyScalar(RP));
    if (k) len.push(len[k - 1] + pts[k].distanceTo(pts[k - 1]));
  }
  const total = len[M];
  const idx = (s) => {
    s = Math.min(Math.max(s, 0), total);
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
  return { total, point, frame };
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
  const n = Math.floor(Math.min(path.total, PIT.s + 0.3) / step) + 1;
  const pos = new Float32Array(n * 2 * 3), aS = new Float32Array(n * 2), aSide = new Float32Array(n * 2);
  const index = [];
  const f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  for (let i = 0; i < n; i++) {
    const s = i * step;
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
  const uniforms = { uS: { value: 0 }, uDash: { value: ML_FROM }, uDashTo: { value: ML_TO }, uTime: { value: 0 } };
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

export function createJourney({ small = false, audio = null, root }) {
  const group = new THREE.Group();
  group.visible = false;
  const planet = new THREE.Group();
  planet.position.y = -RP;
  group.add(planet);

  group.add(new THREE.HemisphereLight(0x9cbcff, 0x0a1430, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-2, 4, 3);
  group.add(key);

  const brain = buildBrain(small ? 45000 : 95000);
  const stars = buildStars(small ? 600 : 1200);
  // A solid dark core: hides the far side of the planet (and of the line) and gives the folds depth.
  const core = new THREE.Mesh(new THREE.SphereGeometry(RP * 0.993, 96, 64), new THREE.MeshBasicMaterial({ color: 0x040a1c }));
  planet.add(core, brain.pts, stars.pts);
  const path = buildPath();
  const line = buildLine(path);
  planet.add(line.mesh);

  const stations = [...STOPS, PIT].map((st) => {
    const { pts, uniforms } = buildStation(st.make(small ? 5000 : 9000), st === PIT ? 1.3 : 1.8);
    const holder = new THREE.Group();
    holder.add(pts);
    placeOnPath(path, holder, st.s, st.side * (small ? 0.62 : 1));   // phones see less to the sides
    planet.add(holder);
    return { ...st, uniforms };
  });

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
  tokens.forEach((t) => {
    const li = document.createElement('li');
    li.className = t.locked ? 'locked' : '';
    li.textContent = t.locked ? '?' : '';
    li.title = t.locked ? 'next level: machine learning' : t.name;
    slots.appendChild(li);
    t.slot = li;
    const lab = document.createElement('span');
    lab.textContent = t.locked ? 'locked' : t.name;
    lab.className = t.locked ? 'locked' : '';
    labels.appendChild(lab);
    t.label = lab;
  });
  // Card texts come from the static About (the version without WebGL), so there is one source.
  const st = [...root.querySelectorAll('.station')];
  const cards = [
    { from: -1, to: 1.4, kicker: 'about me', title: root.querySelector('#about-title').textContent, text: root.querySelector('.about-hello .lead').textContent },
    ...STOPS.map((stop, i) => ({ from: stop.s - 4.2, to: stop.s + 2.2, kicker: st[i].querySelector('.station-n').textContent.replace(/\s+/g, ' ').trim(), title: st[i].querySelector('h3').textContent, text: st[i].querySelector('p:not(.station-n):not(.loading)').textContent })),
    { from: S_END - 3, to: 99, kicker: 'pit stop · off hours', title: 'Cubes, strings, engines', text: '' },
  ];
  let cardShown = -2;

  /* ---- state ---- */
  let s = 0, v = 0, phase = 'off', lightsAt = 0, outAt = 0, holdFor = 0, reaction = null, jumped = false;
  let best = Number(localStorage.getItem('wk-f1-best')) || 0;
  let toastUntil = 0, lean = 0;
  const keys = new Set();
  const f = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  const f2 = { p: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };
  const basis = new THREE.Matrix4(), tmp = new THREE.Vector3();
  let w = 1, h = 1, pxPerUnit = 1000;

  function showToast(text, ms = 2200) {
    toast.textContent = text;
    toast.hidden = false;
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
      if (i === cards.length - 1) {
        const got = tokens.filter((t) => t.got).length;
        cardText.innerHTML = `Speedcubing (11.84 s single), guitar, Formula 1 and games. ${reaction ? `Your start today: <b>${reaction} ms</b>${best ? ` · best <b>${best} ms</b>` : ''}.` : ''} Skills collected: <b>${got}/${total}</b>. Next here: a cube you can turn and a guitar you can play.`;
      } else cardText.textContent = c.text;
      card.classList.add('is-in');
    }, 220);
  }

  return {
    group,
    get speed01() { return Math.abs(v) / VMAX; },
    get progress() { return s / S_END; },
    /** Debug: jump along the line. */
    goto(x) { s = Math.max(0, Math.min(S_END, x)); },
    get phase() { return phase; },
    /** Viewport and pixel scale (px per world unit at distance 1). */
    setView(width, height, pxu) {
      w = width; h = height; pxPerUnit = pxu;
      brain.uniforms.uSize.value = pxu * 0.028;
      stars.uniforms.uSize.value = pxu * 0.05;
      stations.forEach((x) => { x.uniforms.uSize.value = pxu * 0.03; });
    },
    /** Called when the About opens. The ride resumes where it was; the lights run on every entry. */
    enter() {
      phase = 'arriving';
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
      phase = 'off';
      v = 0;
      keys.clear();
      hud.classList.remove('is-in');
      card.classList.remove('is-in');
      labels.querySelectorAll('span').forEach((l) => { l.style.opacity = '0'; });
    },
    /** Wheel / swipe: +down = forward. */
    push(delta, timeStamp) {
      if (!react(timeStamp)) return;
      v = Math.max(-VMAX, Math.min(VMAX, v + delta * 0.0045));
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
        if (keys.has('f')) v = Math.min(VMAX, v + ACCEL * dt);
        if (keys.has('b')) v = Math.max(-VMAX, v - ACCEL * dt);
        v *= Math.exp(-FRICTION * dt);
        if (Math.abs(v) < 0.01) v = 0;
        s += v * dt;
        if (s < 0) { s = 0; v = 0; }
        if (s > S_END) { s = S_END; v = 0; }
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
      stations.forEach((x) => { x.uniforms.uK.value = smoothstep(x.s - 9, x.s - 3.5, s); });

      // Tokens: spin, and get collected when the robot rolls over them.
      tokens.forEach((tk) => {
        tk.spin.rotation.y = t * 2 + tk.s;
        if (!tk.got && s >= tk.s - 0.22 && s <= tk.s + 0.5) {
          if (tk.locked) {
            if (!tk.seen) { tk.seen = true; showToast('locked · machine learning is the next level'); }
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
        }
      });
      count.textContent = String(tokens.filter((x) => x.got).length);

      // The card for wherever you are.
      let ci = -1;
      cards.forEach((c, i) => { if (s >= c.from && s < c.to) ci = i; });
      if (phase === 'arriving' || phase === 'off') ci = -1;
      setCard(ci);

      if (!toast.hidden && now > toastUntil) toast.hidden = true;
    },

    /** Camera: k = 0 high above the planet, 1 = behind the robot. Then token labels follow it. */
    camera(cam, k, t) {
      const e = easeInOut(clamp01(k));
      const chaseFov = w / h < 1 ? 64 : 50;
      const turnSway = Math.max(-0.25, Math.min(0.25, lean * 0.8));
      const from = new THREE.Vector3(0, -RP + 9.5, 16.5), fromLook = new THREE.Vector3(0, -RP, 0);
      const to = new THREE.Vector3(turnSway, 0.5, 1.25), toLook = new THREE.Vector3(turnSway * 0.3, 0.02, -1.8);
      cam.position.lerpVectors(from, to, e);
      cam.up.set(0, 1, 0);
      cam.lookAt(tmp.lerpVectors(fromLook, toLook, e));
      cam.fov = 40 + (chaseFov - 40) * e;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      brain.uniforms.uFogNear.value = 5 + (1 - e) * 30;
      brain.uniforms.uFogFar.value = 11 + (1 - e) * 40;

      // Labels over the tokens ahead, and chips flying into the inventory.
      const vis = phase !== 'off' && k >= 1;
      const near = tokens.filter((tk) => !tk.got && tk.s - s > 0.45 && tk.s - s < 4.5).slice(0, 2);
      tokens.forEach((tk) => {
        const ahead = tk.s - s;
        let show = vis && near.includes(tk);
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
            tk.label.style.opacity = String(smoothstep(4.5, 3, ahead));
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
          setTimeout(() => { chip.remove(); tk.slot.textContent = tk.short; tk.slot.classList.add('got'); }, 650);
        }
      });
    },
  };
}

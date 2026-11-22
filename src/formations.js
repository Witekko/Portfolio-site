/*
 * Formations: every shape the particle system can take.
 *
 * Each formation is exactly N points:
 *   pos   Float32Array(N*4)  xyz + alpha
 *   col   Float32Array(N*3)  rgb
 *   rank  Float32Array(N)    writing order (signature only, else 0)
 * Points are sorted left → right, so index i sits in roughly the same place in
 * every formation: morphs read as one sweep instead of a scramble.
 * Unit space: about 1 unit tall, centred on the origin.
 */
import { SIGNATURE_STROKES } from './signature-data.js';

const R = Math.random;
const TAU = Math.PI * 2;

export const HOT = [1.0, 0.55, 0.24];
const BLUE_RAMP = [
  [0.0, [0.02, 0.05, 0.14]],
  [0.35, [0.10, 0.28, 0.72]],
  [0.7, [0.42, 0.66, 1.0]],
  [1.0, [0.90, 0.95, 1.0]],
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function blue(l) {
  for (let k = 1; k < BLUE_RAMP.length; k++) {
    const [p1, c1] = BLUE_RAMP[k];
    if (l <= p1) {
      const [p0, c0] = BLUE_RAMP[k - 1];
      const t = (l - p0) / (p1 - p0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return BLUE_RAMP[BLUE_RAMP.length - 1][1];
}
const hot = (v = 1) => [HOT[0] * v, HOT[1] * v, HOT[2] * v];

/* ------------------------------------------------------------ builders -- */

/**
 * parts: [{ w: weight, fn: () => [x, y, z, [r,g,b], alpha] }]
 * opts.tilt rotates the whole shape around X (radians) so floors face the camera.
 */
function build(N, parts, opts = {}) {
  const pos = new Float32Array(N * 4);
  const col = new Float32Array(N * 3);
  const rank = new Float32Array(N);
  const total = parts.reduce((s, p) => s + p.w, 0);
  const ct = Math.cos(opts.tilt || 0), st = Math.sin(opts.tilt || 0);
  const sc = opts.scale || 1;
  let i = 0;
  parts.forEach((p, pi) => {
    const count = pi === parts.length - 1 ? N - i : Math.round((N * p.w) / total);
    for (let k = 0; k < count && i < N; k++, i++) {
      const [x, y, z, c, a = 1, r = 0] = p.fn(k, count);
      pos[i * 4] = x * sc;
      pos[i * 4 + 1] = (y * ct - z * st) * sc;
      pos[i * 4 + 2] = (y * st + z * ct) * sc;
      pos[i * 4 + 3] = a;
      col.set(c, i * 3);
      rank[i] = r;
    }
  });
  return sortLeftToRight({ pos, col, rank, N });
}

function sortLeftToRight(f) {
  const { N } = f;
  const idx = Array.from({ length: N }, (_, i) => i);
  idx.sort((a, b) => (f.pos[a * 4] + f.pos[a * 4 + 1] * 0.08) - (f.pos[b * 4] + f.pos[b * 4 + 1] * 0.08));
  const pos = new Float32Array(N * 4), col = new Float32Array(N * 3), rank = new Float32Array(N);
  idx.forEach((src, dst) => {
    pos.set(f.pos.subarray(src * 4, src * 4 + 4), dst * 4);
    col.set(f.col.subarray(src * 3, src * 3 + 3), dst * 3);
    rank[dst] = f.rank[src];
  });
  return { pos, col, rank, N };
}

/* ------------------------------------------------------------ samplers -- */

const jit = (s) => (R() - 0.5) * s;

function onBox(x0, x1, y0, y1, z0, z1) {
  const p = [lerp(x0, x1, R()), lerp(y0, y1, R()), lerp(z0, z1, R())];
  const axis = (R() * 3) | 0;
  p[axis] = R() < 0.5 ? [x0, y0, z0][axis] : [x1, y1, z1][axis];
  return p;
}
function onSegment(a, b, thick = 0.006) {
  const t = R();
  return [lerp(a[0], b[0], t) + jit(thick), lerp(a[1], b[1], t) + jit(thick), lerp(a[2], b[2], t) + jit(thick)];
}
function onPolyline(pts, thick = 0.006) {
  const s = (R() * (pts.length - 1)) | 0;
  return onSegment(pts[s], pts[s + 1], thick);
}
function onSphere(cx, cy, cz, r) {
  let x = R() * 2 - 1, y = R() * 2 - 1, z = R() * 2 - 1;
  const l = Math.hypot(x, y, z) || 1;
  return [cx + (x / l) * r, cy + (y / l) * r, cz + (z / l) * r];
}
function onTorus(R0, r0, rot = (p) => p) {
  const u = R() * TAU, v = R() * TAU;
  return rot([(R0 + r0 * Math.cos(v)) * Math.cos(u), (R0 + r0 * Math.cos(v)) * Math.sin(u), r0 * Math.sin(v)]);
}
function onCylinder(cx, cz, r, y0, y1) {
  const a = R() * TAU;
  return [cx + Math.cos(a) * r, lerp(y0, y1, R()), cz + Math.sin(a) * r];
}
const rotX = (a) => ([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotY = (a) => ([x, y, z]) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];

/* -------------------------------------------------------------- portrait -- */

/**
 * Photo + depth map (Depth Anything V2) → a 2.5D relief of the face.
 * Background sparks of the photo fall behind the head, the nose comes forward.
 */
export function portrait(N, img, depthImg) {
  const cols = 300;
  const rows = Math.round((cols * img.naturalHeight) / img.naturalWidth);
  const width = cols / rows;

  const read = (src) => {
    const cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, cols, rows);
    return ctx.getImageData(0, 0, cols, rows).data;
  };
  const px = read(img);
  const dp = read(depthImg);

  const cand = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      if (l < 0.03) continue;
      if (l < 0.14 && R() > l / 0.14) continue;
      const u = x / cols, v = y / rows;
      const edge = smoothstep(0, 0.1, u) * smoothstep(1, 0.9, u) * smoothstep(0, 0.05, v) * smoothstep(1, 0.92, v);
      const alpha = edge * smoothstep(0.02, 0.22, l);
      if (alpha < 0.02) continue;
      const d = dp[i] / 255;                      // near = bright
      cand.push([u, v, l, alpha, d, px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]);
    }
  }

  const cell = 1 / rows;
  return build(N, [{
    w: 1,
    fn: (k) => {
      // Spread N particles over the candidates; reuse with a small offset if needed.
      const [u, v, l, alpha, d, r, g, b] = cand[Math.floor((k / N) * cand.length + R()) % cand.length];
      // Head and shoulders get real relief; the spark-filled background stays just behind the head.
      // (With its true depth it sat far back and swung across the face when the head turned.)
      const z = (Math.max(d, 0.58) - 0.74) * 0.6;
      const S = 1.12;   // the head gets a little more room than the other shapes
      return [((u - 0.5) * width + jit(cell)) * S, (0.5 - v + jit(cell)) * S, z + jit(0.004), grade(r, g, b, l), alpha];
    },
  }]);
}

/** The photo's own colours, nudged a little toward the site's blue so it sits in the palette. */
function grade(r, g, b, l) {
  const t = blue(smoothstep(0.04, 0.82, l));
  const c = (x) => clamp01((x - 0.5) * 1.08 + 0.5);   // a touch more contrast
  return [lerp(c(r), t[0], 0.14), lerp(c(g), t[1], 0.14), lerp(c(b), t[2], 0.14)];
}

export const FACE_HIT = { cx: 0, cy: 0.11, rx: 0.34, ry: 0.45 };   // head ellipse, in unit space

/* ------------------------------------------------------------- signature -- */

/**
 * The signature as smooth strokes, shared by the particle ink and the robot's pen
 * so the two always line up:
 *  - normalised (0.95 units wide, centred, y up),
 *  - strokes that touch are joined, so the pen keeps going like real cursive,
 *  - corners rounded with a Catmull-Rom pass.
 */
let strokesCache = null;
function signatureStrokes() {
  if (strokesCache) return strokesCache;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of SIGNATURE_STROKES) for (let k = 0; k < s.length; k += 2) {
    minX = Math.min(minX, s[k]); maxX = Math.max(maxX, s[k]);
    minY = Math.min(minY, s[k + 1]); maxY = Math.max(maxY, s[k + 1]);
  }
  const scale = 0.95 / (maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const raw = SIGNATURE_STROKES.map((s) => {
    const pts = [];
    for (let k = 0; k < s.length; k += 2) pts.push([(s[k] - cx) * scale, -(s[k + 1] - cy) * scale]);
    return pts;
  });

  // Join strokes that (almost) touch.
  const JOIN = 0.025;
  const joined = [];
  for (const pts of raw) {
    const prev = joined.at(-1);
    if (prev && Math.hypot(pts[0][0] - prev.at(-1)[0], pts[0][1] - prev.at(-1)[1]) < JOIN) prev.push(...pts.slice(1));
    else joined.push(pts.slice());
  }

  // Round the corners: Catmull-Rom through the points.
  const SUB = 5;
  const smooth = (p) => {
    if (p.length < 3) {
      const out = [];
      for (let i = 0; i < p.length - 1; i++) for (let s = 0; s < SUB; s++) out.push([lerp(p[i][0], p[i + 1][0], s / SUB), lerp(p[i][1], p[i + 1][1], s / SUB)]);
      out.push(p.at(-1));
      return out;
    }
    const out = [];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      for (let s = 0; s < SUB; s++) {
        const t = s / SUB, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(p.at(-1));
    return out;
  };

  const strokes = joined.map((p) => {
    const pts = smooth(p);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    return { pts, cum, len: cum.at(-1) };
  });
  strokesCache = { strokes, total: strokes.reduce((s, st) => s + st.len, 0) };
  return strokesCache;
}

/** Point and unit tangent at arc length s along a stroke. */
function alongStroke(st, s) {
  s = Math.min(Math.max(s, 0), st.len);
  let k = 1;
  while (k < st.cum.length - 1 && st.cum[k] < s) k++;
  const a = st.pts[k - 1], b = st.pts[k];
  const seg = st.cum[k] - st.cum[k - 1] || 1e-6;
  const g = (s - st.cum[k - 1]) / seg;
  const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
  return { x: lerp(a[0], b[0], g), y: lerp(a[1], b[1], g), tx: dx / dl, ty: dy / dl };
}

/** Points along the pen strokes; rank = how far along the writing they are. */
export function signature(N) {
  const { strokes, total } = signatureStrokes();
  const starts = [];
  let acc = 0;
  for (const st of strokes) { starts.push(acc); acc += st.len; }
  let si = 0;
  return build(N, [{
    w: 1,
    fn: (k) => {
      const at = ((k + R()) / N) * total;
      while (si < strokes.length - 1 && starts[si] + strokes[si].len < at) si++;
      while (si > 0 && starts[si] > at) si--;
      const p = alongStroke(strokes[si], at - starts[si]);
      const w = (R() - 0.5) * 0.012;                       // ink thickness, across the stroke
      const shade = 0.8 + R() * 0.25;
      return [p.x - p.ty * w, p.y + p.tx * w, jit(0.01), hot(shade), 0.55, at / total];
    },
  }]);
}

/* -------------------------------------------------------------- projects -- */

/** IKE Tracker: a 3D bar chart with an orange profit line. */
export function ikeChart(N) {
  const bars = 11, x0 = -0.6, x1 = 0.6, base = -0.42;
  const heights = Array.from({ length: bars }, (_, k) => 0.12 + 0.62 * (k / (bars - 1)) ** 1.3 + (k % 3 === 1 ? -0.07 : 0.03));
  const xs = heights.map((_, k) => lerp(x0, x1, k / (bars - 1)));
  const line = xs.map((x, k) => [x, base + heights[k] + 0.08, 0]);
  return build(N, [
    { w: 0.55, fn: () => {
      const k = (R() * bars) | 0, h = heights[k];
      const p = onBox(xs[k] - 0.035, xs[k] + 0.035, base, base + h, -0.035, 0.035);
      return [...p, blue(0.45 + 0.45 * ((p[1] - base) / 0.8)), 0.8];
    } },
    { w: 0.2, fn: () => [...onPolyline(line, 0.008), hot(), 0.9] },
    { w: 0.05, fn: () => { const k = (R() * bars) | 0; return [...onSphere(line[k][0], line[k][1], 0, 0.016), hot(1.1), 1]; } },
    { w: 0.2, fn: () => {
      const g = R() < 0.5;
      const x = g ? Math.round(lerp(-7, 7, R())) / 10 : lerp(-0.7, 0.7, R());
      const z = g ? lerp(-0.35, 0.35, R()) : Math.round(lerp(-3, 3, R())) / 10;
      return [x, base - 0.01, z, blue(0.35), 0.35];
    } },
  ], { tilt: 0.32, scale: 0.78 });
}

/** Age of Sigma: two towers on rolling ground, an orange shot arcing between them. */
export function sigmaTowers(N) {
  const ground = (x, z) => -0.42 + 0.05 * Math.sin(x * 5) * Math.cos(z * 4);
  const tower = (cx) => () => {
    const r = R();
    if (r < 0.7) return [...onCylinder(cx, 0, 0.09, ground(cx, 0), 0.12), blue(0.6), 0.85];
    // crenellations
    const a = (Math.floor(R() * 8) / 8) * TAU;
    return [...onBox(cx + Math.cos(a) * 0.09 - 0.02, cx + Math.cos(a) * 0.09 + 0.02, 0.12, 0.18, Math.sin(a) * 0.09 - 0.02, Math.sin(a) * 0.09 + 0.02), blue(0.75), 0.9];
  };
  const arc = (t) => [lerp(-0.42, 0.42, t), 0.18 + Math.sin(t * Math.PI) * 0.36, 0];
  return build(N, [
    { w: 0.35, fn: () => { const x = lerp(-0.7, 0.7, R()), z = lerp(-0.35, 0.35, R()); return [x, ground(x, z), z, blue(0.3 + R() * 0.15), 0.45]; } },
    { w: 0.22, fn: tower(-0.42) },
    { w: 0.22, fn: tower(0.42) },
    { w: 0.13, fn: () => { const t = R() ** 0.8 * 0.62; const p = arc(t); return [p[0] + jit(0.01), p[1] + jit(0.01), jit(0.01), hot(0.6 + t), 0.4 + t]; } },
    { w: 0.08, fn: () => { const p = arc(0.62); return [...onSphere(p[0], p[1], 0, 0.035), hot(1.15), 1]; } },
  ], { tilt: 0.28, scale: 0.76 });
}

/** Dance Game: the gyroscope that drives it, three gimbal rings around a core. */
export function gyroscope(N) {
  return build(N, [
    { w: 0.26, fn: () => [...onTorus(0.44, 0.008, rotY(0.5)), blue(0.55), 0.85] },
    { w: 0.22, fn: () => [...onTorus(0.36, 0.008, (p) => rotY(0.5)(rotX(Math.PI / 2)(p))), blue(0.8), 0.85] },
    { w: 0.2, fn: () => [...onTorus(0.28, 0.009, (p) => rotX(0.9)(rotY(Math.PI / 2)(p))), hot(), 0.9] },
    { w: 0.2, fn: () => [...onSphere(0, 0, 0, 0.11), blue(0.7 + R() * 0.25), 0.9] },
    { w: 0.12, fn: () => [...onSegment([0, -0.52, 0], [0, 0.52, 0], 0.006), blue(0.5), 0.6] },
  ]);
}

/** This website: a browser window with a little particle head inside. */
export function browserWindow(N) {
  const W = 0.58, H = 0.38;
  const frame = [[-W, -H, 0], [W, -H, 0], [W, H, 0], [-W, H, 0], [-W, -H, 0]];
  return build(N, [
    { w: 0.28, fn: () => [...onPolyline(frame, 0.006), blue(0.7), 0.9] },
    { w: 0.06, fn: () => [...onSegment([-W, H - 0.08, 0], [W, H - 0.08, 0], 0.005), blue(0.55), 0.8] },
    { w: 0.04, fn: () => { const k = (R() * 3) | 0; const p = onSphere(-W + 0.06 + k * 0.05, H - 0.04, 0, 0.014); return [...p, k === 0 ? hot() : blue(0.7), 1]; } },
    { w: 0.2, fn: () => {   // text lines
      const line = (R() * 5) | 0;
      const len = [0.5, 0.42, 0.46, 0.3, 0.2][line];
      return [-W + 0.08 + R() * len, H - 0.2 - line * 0.075 + jit(0.014), 0.02, line === 4 ? hot(0.9) : blue(0.45), 0.7];
    } },
    { w: 0.42, fn: () => {  // particle head in the window
      const p = onSphere(0, 0, 0, 1);
      return [0.28 + p[0] * 0.15, -0.04 + p[1] * 0.19, 0.08 + p[2] * 0.12, blue(0.5 + (p[2] + 1) * 0.22), 0.75];
    } },
  ], { scale: 0.88 });
}

/** Tic-Tac-Toe: the grid, a winning diagonal of orange X's, blue O's. */
export function ticTacToe(N) {
  const c = 0.3;
  const X = [[-1, 1], [0, 0], [1, -1]], O = [[1, 1], [-1, 0], [0, -1]];
  return build(N, [
    { w: 0.34, fn: () => {
      const k = (R() * 4) | 0, off = (k % 2 ? 1 : -1) * c / 2, along = lerp(-0.45, 0.45, R());
      const p = k < 2 ? onBox(off - 0.01, off + 0.01, along, along, -0.02, 0.02) : onBox(along, along, off - 0.01, off + 0.01, -0.02, 0.02);
      return [...p, blue(0.6), 0.85];
    } },
    { w: 0.3, fn: () => {
      const [i, j] = X[(R() * 3) | 0], s = 0.09, d = R() < 0.5 ? 1 : -1;
      return [...onSegment([i * c - s, j * c - s * d, 0], [i * c + s, j * c + s * d, 0], 0.016), hot(), 0.95];
    } },
    { w: 0.3, fn: () => { const [i, j] = O[(R() * 3) | 0]; const p = onTorus(0.085, 0.012); return [p[0] + i * c, p[1] + j * c, p[2], blue(0.85), 0.9]; } },
    { w: 0.06, fn: () => [...onSegment([-0.42, 0.42, 0.04], [0.42, -0.42, 0.04], 0.006), hot(0.8), 0.5] },
  ]);
}

/** Line Follower: a closed track with an orange line and the robot on it. */
export function lineFollower(N) {
  const track = (t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const e = 0.6;   // superellipse: rounded rectangle
    return [0.6 * Math.sign(c) * Math.abs(c) ** e, 0, 0.36 * Math.sign(s) * Math.abs(s) ** e];
  };
  const t0 = 0.35;
  const p0 = track(t0), p1 = track(t0 + 0.01);
  const ang = Math.atan2(p1[2] - p0[2], p1[0] - p0[0]);
  const robot = (p) => { const r = rotY(-ang)(p); return [r[0] + p0[0], r[1] + 0.035, r[2] + p0[2]]; };
  return build(N, [
    { w: 0.4, fn: () => { const p = track(R() * TAU); return [p[0] * (1 + jit(0.18)), -0.002, p[2] * (1 + jit(0.3)), blue(0.32), 0.45]; } },
    { w: 0.22, fn: () => { const p = track(R() * TAU); return [p[0] + jit(0.008), 0.004, p[2] + jit(0.008), hot(), 0.95]; } },
    { w: 0.26, fn: () => [...robot(onBox(-0.07, 0.07, -0.02, 0.03, -0.05, 0.05)), blue(0.85), 0.95] },
    { w: 0.08, fn: () => { const side = R() < 0.5 ? -1 : 1; const a = R() * TAU; return [...robot([-0.03 + Math.cos(a) * 0.025, Math.sin(a) * 0.025 - 0.01, side * 0.06]), blue(0.6), 0.9]; } },
    { w: 0.04, fn: () => [...robot(onBox(0.07, 0.085, -0.01, 0.0, -0.045, 0.045)), hot(1.1), 1] },
  ], { tilt: 0.85, scale: 0.8 });
}

/** Master's thesis: G2 at the centre, four platforms around it, a ring of 50 survey respondents. */
export function thesisNetwork(N) {
  const platforms = [0.25, 0.75, 1.25, 1.75].map((k, i) => {
    const a = k * Math.PI;
    return [Math.cos(a) * 0.3, Math.sin(a) * 0.3, (i % 2 ? 1 : -1) * 0.08];
  });
  const ring = (i) => { const a = (i / 50) * TAU; return rotX(1.1)([Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0]); };
  return build(N, [
    { w: 0.12, fn: () => [...onSphere(0, 0, 0, 0.085), hot(1.05), 0.95] },
    { w: 0.2, fn: () => { const p = platforms[(R() * 4) | 0]; return [...onSphere(p[0], p[1], p[2], 0.055), blue(0.9), 0.95]; } },
    { w: 0.1, fn: () => [...onSegment([0, 0, 0], platforms[(R() * 4) | 0], 0.006), blue(0.6), 0.7] },
    { w: 0.26, fn: () => { const c = ring((R() * 50) | 0); return [...onSphere(c[0], c[1], c[2], 0.014), blue(0.75), 0.9]; } },
    { w: 0.32, fn: () => {
      const i = (R() * 50) | 0;
      return [...onSegment(ring(i), platforms[(i * 7) % 4], 0.003), blue(0.45), 0.3];
    } },
  ]);
}

/* ------------------------------------------------------------------ about -- */

/** About: a double helix (the path so far), with milestones as nodes. */
export function careerHelix(N) {
  const turns = 2.4, r = 0.24;
  const at = (t, phase) => [Math.cos(t * turns * TAU + phase) * r, lerp(-0.5, 0.5, t), Math.sin(t * turns * TAU + phase) * r];
  const nodes = [0.08, 0.36, 0.64, 0.93];
  return build(N, [
    { w: 0.66, fn: () => { const t = R(); return [...at(t, R() < 0.5 ? 0 : Math.PI).map((v) => v + jit(0.01)), blue(0.45 + t * 0.4), 0.8]; } },
    { w: 0.18, fn: () => { const t = Math.round(R() * 30) / 30; return [...onSegment(at(t, 0), at(t, Math.PI), 0.004), blue(0.35), 0.45]; } },
    { w: 0.1, fn: () => { const k = (R() * 3) | 0; const c = at(nodes[k], 0); return [...onSphere(c[0], c[1], c[2], 0.03), blue(0.95), 0.5]; } },
    { w: 0.06, fn: () => { const c = at(nodes[3], 0); return [...onSphere(c[0], c[1], c[2], 0.03 + R() * 0.03), hot(1.0), 0.6]; } },
  ]);
}

/** Point on the surface of a tube of radius r around segment a → b. */
function onTube(a, b, r) {
  const t = R(), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d) || 1;
  const u = d.map((v) => v / len);
  // two directions across the tube
  const h = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let p = [u[1] * h[2] - u[2] * h[1], u[2] * h[0] - u[0] * h[2], u[0] * h[1] - u[1] * h[0]];
  const pl = Math.hypot(...p); p = p.map((v) => v / pl);
  const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
  const ang = R() * TAU, c = Math.cos(ang) * r, s = Math.sin(ang) * r;
  return [0, 1, 2].map((k) => a[k] + d[k] * t + p[k] * c + q[k] * s);
}

/** About, stop 1 (robotics): an industrial arm on its base, joints glowing orange. */
export function robotArm(N) {
  const base = [-0.3, -0.46, 0], shoulder = [-0.3, -0.3, 0], elbow = [0.02, 0.2, 0], wrist = [0.36, 0.04, 0];
  const tool = [0.36, -0.12, 0];
  return build(N, [
    { w: 0.1, fn: () => [...onCylinder(base[0], base[2], 0.13, -0.5, -0.42), blue(0.5), 0.85] },
    { w: 0.06, fn: () => [...onCylinder(base[0], base[2], 0.09, -0.42, -0.3), blue(0.6), 0.85] },
    { w: 0.26, fn: () => [...onTube(shoulder, elbow, 0.05), blue(0.55 + R() * 0.3), 0.9] },
    { w: 0.2, fn: () => [...onTube(elbow, wrist, 0.038), blue(0.6 + R() * 0.3), 0.9] },
    { w: 0.06, fn: () => [...onTube(wrist, tool, 0.014), blue(0.85), 0.9] },
    { w: 0.06, fn: () => { const s = R() < 0.5 ? -1 : 1; return [...onBox(tool[0] - 0.012 + s * 0.04, tool[0] + 0.012 + s * 0.04, tool[1] - 0.09, tool[1], -0.03, 0.03), blue(0.9), 0.95]; } },
    { w: 0.12, fn: () => { const j = [shoulder, elbow, wrist][(R() * 3) | 0]; return [...onSphere(j[0], j[1], j[2], j === wrist ? 0.035 : 0.055), hot(1.05), 1]; } },
    { w: 0.14, fn: () => {   // the floor it stands on
      const x = Math.round(lerp(-6, 6, R())) / 10, z = lerp(-0.35, 0.35, R());
      return R() < 0.5 ? [x, -0.5, z, blue(0.3), 0.35] : [lerp(-0.6, 0.6, R()), -0.5, Math.round(z * 10) / 10, blue(0.3), 0.35];
    } },
  ], { tilt: 0.12, scale: 0.95 });
}

/** About, stop 3 (industrial data, rail): a passenger car on its bogies, data rising off it. */
export function railWagon(N) {
  const L = 0.62, B = -0.1, T = 0.14, W = 0.13;
  const windows = Array.from({ length: 7 }, (_, k) => lerp(-0.47, 0.47, k / 6));
  const wheels = [-0.47, -0.33, 0.33, 0.47];
  return build(N, [
    { w: 0.3, fn: () => [...onBox(-L, L, B, T, -W, W), blue(0.45 + R() * 0.2), 0.75] },
    { w: 0.06, fn: () => { const a = lerp(0.15, Math.PI - 0.15, R()); return [lerp(-L, L, R()), T + Math.sin(a) * 0.035, Math.cos(a) * W, blue(0.55), 0.8]; } },   // roof
    { w: 0.16, fn: () => {   // windows, lit
      const x = windows[(R() * windows.length) | 0];
      return [x + jit(0.075), 0.06 + jit(0.07), W + 0.002, blue(0.95), 0.95];
    } },
    { w: 0.05, fn: () => [lerp(-L, L, R()), -0.04 + jit(0.008), W + 0.004, hot(), 0.95] },   // stripe
    { w: 0.08, fn: () => { const x = wheels[(R() * 4) | 0], s = R() < 0.5 ? -1 : 1, a = R() * TAU; return [x + Math.cos(a) * 0.05, -0.2 + Math.sin(a) * 0.05, s * (W - 0.01), blue(0.7), 0.9]; } },
    { w: 0.04, fn: () => { const c = R() < 0.5 ? -0.4 : 0.4; return [...onBox(c - 0.12, c + 0.12, -0.16, -0.11, -W + 0.02, W - 0.02), blue(0.35), 0.8]; } },   // bogies
    { w: 0.11, fn: () => {   // rails and sleepers
      if (R() < 0.6) return [lerp(-0.82, 0.82, R()), -0.255, (R() < 0.5 ? -1 : 1) * (W - 0.01), blue(0.6), 0.75];
      return [Math.round(lerp(-8, 8, R())) / 10 + jit(0.02), -0.265, lerp(-W - 0.05, W + 0.05, R()), blue(0.3), 0.5];
    } },
    { w: 0.12, fn: () => {   // data rising off the car: loose bits, thinning upward
      const col = Math.round(lerp(-5, 5, R())), row = Math.floor(R() ** 1.5 * 7);
      if ((col * 3 + row * 5) % 4 === 0) return [col / 10, T + 0.1, 0, blue(0.6), 0];   // gaps between bits
      const bit = (col * 7 + row) % 5 === 0;
      return [col / 10 + jit(0.022), T + 0.1 + row * 0.05 + jit(0.022), jit(0.022), bit ? hot(0.95) : blue(0.75), 0.9 * (1 - row / 7)];
    } },
  ], { tilt: 0.18, scale: 0.78 });
}

/**
 * About, stop 4 (machine learning, next): a neural network only partly built.
 * Left of the build front everything is in place; right of it, only faint nodes
 * and loose particles waiting to join. built: 0..1.
 */
export function neuralLoading(N, built = 0.37) {
  const layers = [5, 7, 7, 4, 2];
  const xs = layers.map((_, k) => lerp(-0.5, 0.5, k / (layers.length - 1)));
  const nodes = layers.flatMap((n, k) => Array.from({ length: n }, (_, j) => [xs[k], (j - (n - 1) / 2) * 0.13, 0]));
  const front = lerp(-0.5, 0.5, built) + 0.04;
  const edges = [];
  let o = 0;
  layers.forEach((n, k) => {
    if (k < layers.length - 1) for (let a = 0; a < n; a++) for (let b = 0; b < layers[k + 1]; b++) edges.push([nodes[o + a], nodes[o + n + b]]);
    o += n;
  });
  const builtEdges = edges.filter(([a, b]) => b[0] <= front);
  const builtNodes = nodes.filter((p) => p[0] <= front), ghostNodes = nodes.filter((p) => p[0] > front);
  return build(N, [
    { w: 0.22, fn: () => { const p = builtNodes[(R() * builtNodes.length) | 0]; return [...onSphere(p[0], p[1], p[2], 0.03), blue(0.9), 0.95]; } },
    { w: 0.3, fn: () => { const [a, b] = builtEdges[(R() * builtEdges.length) | 0]; return [...onSegment(a, b, 0.004), blue(0.5), 0.45]; } },
    { w: 0.06, fn: () => { const p = ghostNodes[(R() * ghostNodes.length) | 0]; return [...onSphere(p[0], p[1], p[2], 0.03), blue(0.45), 0.25]; } },
    { w: 0.08, fn: () => [front + jit(0.012), lerp(-0.48, 0.48, R()), jit(0.08), hot(1.0), 0.8] },   // the build front
    { w: 0.28, fn: () => {   // particles still waiting to join
      const x = lerp(front + 0.05, 0.62, R() ** 0.8);
      return [x, jit(0.9), jit(0.4), blue(0.4 + R() * 0.3), 0.2];
    } },
  ]);
}

/** About, off hours: a Rubik's cube, the top layer caught mid-turn. */
export function rubiksCube(N) {
  const s = 0.16, half = 1.5 * s;
  // Face colours in the site's palette: blues, white, orange.
  const faces = [
    { n: [0, 0, 1], c: hot(1.0) }, { n: [0, 0, -1], c: blue(0.35) },
    { n: [1, 0, 0], c: blue(0.95) }, { n: [-1, 0, 0], c: blue(0.6) },
    { n: [0, 1, 0], c: [0.95, 0.97, 1.0] }, { n: [0, -1, 0], c: blue(0.45) },
  ];
  const turn = 0.32;   // radians, top layer
  return build(N, [
    { w: 1, fn: () => {
      const f = faces[(R() * 6) | 0];
      const axis = f.n.findIndex((v) => v !== 0);
      const i = (R() * 3) | 0, j = (R() * 3) | 0;
      // a sticker: inset square on the cubie face
      const u = (i - 1) * s + (R() - 0.5) * s * 0.82, v = (j - 1) * s + (R() - 0.5) * s * 0.82;
      const p = [0, 0, 0];
      p[axis] = f.n[axis] * half;
      const others = [0, 1, 2].filter((k) => k !== axis);
      p[others[0]] = u; p[others[1]] = v;
      let q = p;
      if (p[1] > s * 0.5 + 1e-6 || (axis === 1 && f.n[1] > 0)) q = rotY(turn)(p);   // top layer turned
      return [...rotY(0.6)(rotX(0.45)(q)), f.c, 0.9];
    } },
  ], { scale: 1.25 });
}

/* ------------------------------------------------------- signature: pen -- */

/**
 * The pen's path through the same strokes as the particle ink, timed like a hand:
 * a steady speed along the strokes, smooth lifted arcs between them (leaving along
 * one stroke's direction, arriving along the next one's), a gentle start and finish.
 * at(seconds) → { x, y, lift (0 on the surface … 1 lifted), ink (0..1 written) }.
 * `ink` matches the particles' writing rank, so ink appears right under the pen.
 */
export function signaturePenPlan({ duration = 5 } = {}) {
  const { strokes, total } = signatureStrokes();
  const hops = strokes.slice(1).map((st, i) => {
    const A = alongStroke(strokes[i], strokes[i].len), B = alongStroke(st, 0);
    return { A, B, dist: Math.hypot(B.x - A.x, B.y - A.y) };
  });
  // Pen speed v so the whole signature takes about `duration`; hops are a bit faster, never instant.
  const HOP_MIN = 0.16, HOP_K = 1.7;
  const hopTime = (h, v) => Math.max(HOP_MIN, h.dist / (HOP_K * v));
  let v = (total + hops.reduce((s, h) => s + h.dist / HOP_K, 0)) / duration;
  for (let it = 0; it < 5; it++) v = total / Math.max(0.5, duration - hops.reduce((s, h) => s + hopTime(h, v), 0));

  // Like a hand, the pen slows down in tight turns: each segment's time is its length
  // divided by a speed factor that drops with the turn angle (smoothed over neighbours).
  const timing = strokes.map((st) => {
    const n = st.pts.length, turn = new Float32Array(n);
    for (let k = 1; k < n - 1; k++) {
      const a = st.pts[k - 1], b = st.pts[k], c = st.pts[k + 1];
      const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      turn[k] = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    }
    const slow = Array.from(turn, (_, k) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) { s += turn[j]; c++; }
      return 1 / (1 + 2.5 * (s / c));
    });
    const cumT = [0];   // "length-equivalent" time along the stroke
    for (let k = 1; k < n; k++) cumT.push(cumT[k - 1] + (st.cum[k] - st.cum[k - 1]) / ((slow[k - 1] + slow[k]) / 2));
    return { cumT, s0: slow[0], s1: slow[n - 1] };
  });
  const totalT = timing.reduce((s, c) => s + c.cumT.at(-1), 0);
  v *= totalT / total;   // keep the overall duration with the slower turns

  const moves = [];
  let t = 0, ink = 0;
  strokes.forEach((st, i) => {
    if (i > 0) {
      const h = hops[i - 1], dur = hopTime(h, v * total / totalT);
      // leave and arrive at the real pen speed at those stroke ends
      moves.push({ hop: true, ...h, t0: t, dur, ink, L0: v * timing[i - 1].s1 * dur, L1: v * timing[i].s0 * dur });
      t += dur;
    }
    const cumT = timing[i].cumT, dur = cumT.at(-1) / v;
    moves.push({ hop: false, st, cumT, t0: t, dur, ink });
    t += dur; ink += st.len;
  });

  // Get up to speed at the start and slow down at the end (continuous velocity throughout).
  const T = t, RAMP = 0.3, Tw = T + RAMP;
  const warp = (x) => x <= 0 ? 0 : x >= Tw ? T : x < RAMP ? (x * x) / (2 * RAMP)
    : x > Tw - RAMP ? T - (Tw - x) ** 2 / (2 * RAMP) : x - RAMP / 2;
  const DOWN = 0.18;   // touching down / lifting off

  function at(time) {
    const tt = warp(time);
    let m = moves[0];
    for (const mv of moves) { if (tt >= mv.t0) m = mv; else break; }
    const u = clamp01((tt - m.t0) / m.dur);
    let out;
    if (m.hop) {
      // Cubic Hermite arc; tangents scaled so the speed carries over from the strokes.
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out = {
        x: h00 * m.A.x + h10 * m.A.tx * m.L0 + h01 * m.B.x + h11 * m.B.tx * m.L1,
        y: h00 * m.A.y + h10 * m.A.ty * m.L0 + h01 * m.B.y + h11 * m.B.ty * m.L1,
        lift: Math.sin(Math.PI * u) ** 2,
        ink: m.ink / total,
      };
    } else {
      // time → arc length, through the slow-in-turns timing
      const tau = u * m.cumT.at(-1);
      let k = 1;
      while (k < m.cumT.length - 1 && m.cumT[k] < tau) k++;
      const g = (tau - m.cumT[k - 1]) / (m.cumT[k] - m.cumT[k - 1] || 1e-6);
      const s = m.st.cum[k - 1] + g * (m.st.cum[k] - m.st.cum[k - 1]), p = alongStroke(m.st, s);
      out = { x: p.x, y: p.y, lift: 0, ink: (m.ink + s) / total };
    }
    out.lift = Math.max(out.lift, 1 - smoothstep(0, DOWN, time), smoothstep(Tw, Tw + DOWN, time));
    return out;
  }
  const first = strokes[0].pts[0];
  return { at, duration: Tw + DOWN, start: { x: first[0], y: first[1] } };
}

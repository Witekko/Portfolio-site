/*
 * Hero prototype: signature → portrait ("img2img").
 *
 * 1. The signature is "written" in orange particles, left to right.
 * 2. Particles flow from the signature strokes into the portrait, coarse
 *    structure first and fine detail last, turning from orange into blue.
 * 3. Scrolling sends the portrait back into the signature and fades it out.
 *
 * Signature source: drop your own file at assets/signature.png (dark ink on a
 * light background, or any colour on transparent). Until then a script font
 * stands in.
 */
import * as THREE from 'three';

const IMG_SRC = '../../assets/JA.png';
const SIGNATURE_SRC = '../../assets/signature.png';
const SIGNATURE_FALLBACK_TEXT = 'Witold K.';
const STEPS = 50;

// Timeline (seconds)
const T_DELAY = 0.3;
const T_WRITE = 1.5;   // signature being written
const T_HOLD = 0.5;    // signature rests
const T_MORPH = 2.8;   // signature → portrait

const SIG_COLOR = [1.0, 0.54, 0.24];          // --hot
// Blue duotone ramp for the portrait: luminance → colour
const RAMP = [
  [0.0, [0.02, 0.05, 0.14]],
  [0.35, [0.10, 0.28, 0.72]],
  [0.7, [0.42, 0.66, 1.0]],
  [1.0, [0.90, 0.95, 1.0]],
];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth <= 860;

const $ = (id) => document.getElementById(id);
const hud = {
  root: document.querySelector('.hud'),
  proc: $('hud-proc'), step: $('hud-step'), strength: $('hud-strength'),
  cond: $('hud-cond'), bar: $('hud-bar'),
};

/* ---------------------------------------------------------------- utils -- */

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function gaussian() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

function ramp(l) {
  for (let k = 1; k < RAMP.length; k++) {
    const [p1, c1] = RAMP[k];
    if (l <= p1) {
      const [p0, c0] = RAMP[k - 1];
      const t = (l - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/* ------------------------------------------------------------- portrait -- */

/** Photo → particle targets. Unit space: image height = 1, centred on the origin. */
function samplePortrait(img, cols) {
  const aspect = img.naturalHeight / img.naturalWidth;
  const rows = Math.round(cols * aspect);
  const width = cols / rows;

  const cv = document.createElement('canvas');
  cv.width = cols; cv.height = rows;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cols, rows);
  const px = ctx.getImageData(0, 0, cols, rows).data;

  const lum = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  }
  const L = (x, y) => lum[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];

  const pos = [], col = [], data = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const l = lum[y * cols + x];
      if (l < 0.03) continue;                                  // black background
      if (l < 0.14 && Math.random() > l / 0.14) continue;      // thin the darkest areas

      const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      const detail = clamp01(Math.hypot(gx, gy) * 1.6);

      const u = x / cols, v = y / rows;
      const edgeFade = smoothstep(0, 0.1, u) * smoothstep(1, 0.9, u) * smoothstep(0, 0.05, v) * smoothstep(1, 0.92, v);
      const alpha = edgeFade * smoothstep(0.02, 0.22, l);
      if (alpha < 0.02) continue;

      pos.push((u - 0.5) * width + (Math.random() - 0.5) / rows, (0.5 - v) + (Math.random() - 0.5) / rows);
      col.push(...ramp(smoothstep(0.04, 0.82, l)));   // S-curve for contrast
      data.push(Math.random(), detail, alpha, 0.85 + l * 0.5);
    }
  }
  return { count: pos.length / 2, rows, width, pos, col: new Float32Array(col), data: new Float32Array(data) };
}

/* ------------------------------------------------------------ signature -- */

/** Returns ink points as [x0, y0, x1, y1, ...] in pixel space plus the canvas size. */
function inkPoints(source, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (typeof source === 'function') source(ctx, w, h);
  else ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Transparent background → ink = opaque pixels; otherwise ink = contrast against the corner colour.
  const cornerA = d[3];
  const bgL = (d[0] + d[1] + d[2]) / 765;
  const pts = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ink = cornerA < 128
        ? d[i + 3] > 110
        : d[i + 3] > 110 && Math.abs((d[i] + d[i + 1] + d[i + 2]) / 765 - bgL) > 0.35;
      if (ink) pts.push(x, y);
    }
  }
  return pts;
}

async function loadSignature() {
  try {
    const img = await loadImage(SIGNATURE_SRC);
    const w = 900, h = Math.round(900 * img.naturalHeight / img.naturalWidth);
    return { pts: inkPoints(img, w, h), label: 'signature.png' };
  } catch {
    await document.fonts.load('200px "Mrs Saint Delafield"').catch(() => {});
    const pts = inkPoints((ctx, w, h) => {
      ctx.fillStyle = '#000';
      ctx.font = '200px "Mrs Saint Delafield", "Segoe Script", cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(SIGNATURE_FALLBACK_TEXT, 40, h * 0.55);
    }, 900, 320);
    return { pts, label: 'signature (font)' };
  }
}

/**
 * Pairs every portrait particle with a point on the signature. Both sets are
 * ordered left → right, so the left of the signature flows into the left of
 * the face: the motion reads as one sweep instead of a scramble.
 * The rank doubles as the "writing" order.
 */
function buildSignatureAttr(portrait, sigPts) {
  const n = portrait.count;
  const m = sigPts.length / 2;

  // Normalise the signature: centred, about as wide as the portrait.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let k = 0; k < m; k++) {
    const x = sigPts[k * 2], y = sigPts[k * 2 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const s = (portrait.width * 0.92) / Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const sig = new Float32Array(m * 2);
  for (let k = 0; k < m; k++) {
    sig[k * 2] = (sigPts[k * 2] - cx) * s;
    sig[k * 2 + 1] = -(sigPts[k * 2 + 1] - cy) * s + 0.02;
  }

  const key = (x, y) => x + y * 0.12;
  const sigOrder = Array.from({ length: m }, (_, k) => k).sort((a, b) => key(sig[a * 2], sig[a * 2 + 1]) - key(sig[b * 2], sig[b * 2 + 1]));
  const faceOrder = Array.from({ length: n }, (_, k) => k).sort((a, b) => key(portrait.pos[a * 2], portrait.pos[a * 2 + 1]) - key(portrait.pos[b * 2], portrait.pos[b * 2 + 1]));

  const out = new Float32Array(n * 4);
  const jitter = 0.0035;
  for (let r = 0; r < n; r++) {
    const i = faceOrder[r];
    const k = sigOrder[Math.min(m - 1, Math.floor((r / n) * m))];
    out[i * 4] = sig[k * 2] + (Math.random() - 0.5) * jitter;
    out[i * 4 + 1] = sig[k * 2 + 1] + (Math.random() - 0.5) * jitter;
    out[i * 4 + 2] = r / n;   // rank: writing order + flow order
    out[i * 4 + 3] = 0;
  }
  return out;
}

/* -------------------------------------------------------------- shaders -- */

const vertexShader = /* glsl */`
  uniform float uP;        // 0 = signature, 1 = portrait
  uniform float uWrite;    // 0..1 how much of the signature is written
  uniform vec2  uMouse;
  uniform float uMouseS;
  uniform float uSize;
  uniform vec3  uSigCol;
  uniform vec3  uHot;

  attribute vec4 aSig;     // xy: point on the signature, z: rank 0..1
  attribute vec3 aDrift;   // small Gaussian offset for a soft arc in flight
  attribute vec3 aColor;   // portrait colour (blue duotone)
  attribute vec4 aData;    // x: random, y: detail, z: alpha, w: size

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    float rnd = aData.x, detail = aData.y, rank = aSig.z;

    // A wave that runs left → right; inside it, flat areas land before fine detail.
    float delay = rank * 0.32 + detail * 0.22 + rnd * 0.08;
    float lp = clamp((uP - delay) / 0.38, 0.0, 1.0);
    float e = lp * lp * lp * (lp * (lp * 6.0 - 15.0) + 10.0);   // smootherstep

    vec3 from = vec3(aSig.xy, 0.0);
    vec3 to   = vec3(position.xy, 0.0);
    vec3 pos  = mix(from, to, e) + aDrift * sin(e * 3.14159) * 0.11;

    // Cursor: a gentle push, tinted orange.
    vec2 d = to.xy - uMouse;
    float m = uMouseS * exp(-dot(d, d) / 0.008) * e;
    pos.xy += normalize(d + 1e-5) * m * 0.03;

    vec3 col = mix(uSigCol, aColor, smoothstep(0.15, 0.85, e));
    col = mix(col, uHot, m * 0.55);
    vColor = col;

    float written = smoothstep(rank - 0.015, rank, uWrite);
    vAlpha = mix(0.28, aData.z, e) * written;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * mix(0.55, aData.w, e) / -mv.z;
  }
`;

const fragmentShader = /* glsl */`
  uniform float uOpacity;
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.15, r) * vAlpha * uOpacity);
  }
`;

/* ----------------------------------------------------------------- init -- */

async function init() {
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const CAM_Z = 6;
  camera.position.z = CAM_Z;

  const [img, signature] = await Promise.all([loadImage(IMG_SRC), loadSignature()]);
  const portrait = samplePortrait(img, isSmall() ? 170 : 250);
  const n = portrait.count;
  hud.cond.textContent = signature.label;

  const position = new Float32Array(n * 3);
  const drift = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    position[i * 3] = portrait.pos[i * 2];
    position[i * 3 + 1] = portrait.pos[i * 2 + 1];
    drift[i * 3] = gaussian() * 0.5;
    drift[i * 3 + 1] = gaussian() * 0.35;
    drift[i * 3 + 2] = gaussian() * 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aSig', new THREE.BufferAttribute(buildSignatureAttr(portrait, signature.pts), 4));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(drift, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(portrait.col, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(portrait.data, 4));

  const uniforms = {
    uP: { value: reduceMotion ? 1 : 0 },
    uWrite: { value: reduceMotion ? 1 : 0 },
    uMouse: { value: new THREE.Vector2(99, 99) },
    uMouseS: { value: 0 },
    uSize: { value: 1 },
    uOpacity: { value: 1 },
    uSigCol: { value: new THREE.Vector3(...SIG_COLOR) },
    uHot: { value: new THREE.Vector3(...SIG_COLOR) },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, depthTest: false,
  });
  const points = new THREE.Points(geo, material);
  scene.add(points);

  /* ---- layout: portrait right on desktop, top on mobile ---- */
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visW = visH * camera.aspect;
    let scale, x, y;
    if (isSmall()) {
      scale = Math.min(visH * 0.5, (visW * 0.95) / portrait.width);
      x = 0;
      y = visH / 2 - scale / 2 - visH * 0.06;
    } else {
      scale = Math.min(visH * 0.9, (visW * 0.5) / portrait.width);
      x = visW / 2 - (scale * portrait.width) / 2 - visW * 0.04;
      y = -visH * 0.01;
    }
    points.scale.setScalar(scale);
    points.position.set(x, y, 0);

    const pxPerUnit = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    uniforms.uSize.value = (scale / portrait.rows) * pxPerUnit * 1.5;
  }
  layout();
  addEventListener('resize', layout);

  /* ---- pointer → particle space ---- */
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let lastMove = -1e9;
  if (!reduceMotion) {
    addEventListener('pointermove', (e) => {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) {
        points.worldToLocal(hit);
        uniforms.uMouse.value.set(hit.x, hit.y);
        lastMove = performance.now();
      }
    }, { passive: true });
  }

  /* ---- replay ---- */
  // Debug: ?t=3.2 freezes the timeline at 3.2 s (handy for screenshots).
  const freezeT = Number(new URLSearchParams(location.search).get("t")) || null;
  let start = performance.now() / 1000;
  $('resample').addEventListener('click', () => {
    start = performance.now() / 1000;
    if (scrollY > innerHeight * 0.2) scrollTo({ top: 0 });
  });

  /* ---- loop ---- */
  let lastKey = '';

  function frame() {
    const t = freezeT ?? performance.now() / 1000 - start;

    const still = reduceMotion && freezeT === null;
    const write = still ? 1 : easeOut(clamp01((t - T_DELAY) / T_WRITE));
    const intro = still ? 1 : easeInOut(clamp01((t - T_DELAY - T_WRITE - T_HOLD) / T_MORPH));

    // Scrolling out of the hero: back to the signature, then fade before the next section.
    const sp = clamp01(scrollY / innerHeight);
    const scrollP = reduceMotion ? 1 : 1 - smoothstep(0.05, 0.55, sp);
    const p = Math.min(intro, scrollP);
    uniforms.uP.value = p;
    uniforms.uWrite.value = write;
    uniforms.uOpacity.value = 1 - smoothstep(0.3, 0.65, sp);

    const target = performance.now() - lastMove < 900 ? 1 : 0;
    uniforms.uMouseS.value += (target - uniforms.uMouseS.value) * (target ? 0.1 : 0.04);

    // HUD
    const step = Math.round(p * STEPS);
    const mode = write < 1 ? 'writing' : scrollP < intro ? 'back' : p >= 1 ? 'done' : 'morph';
    const key = step + mode;
    if (key !== lastKey) {
      hud.step.textContent = step;
      hud.strength.textContent = p.toFixed(2);
      hud.bar.style.width = `${p * 100}%`;
      hud.proc.textContent = {
        writing: 'reading condition · signature',
        morph: 'img2img · signature → portrait',
        back: 'reverting to condition',
        done: 'sample complete',
      }[mode];
      hud.root.classList.toggle('is-done', mode === 'done');
      hud.root.classList.toggle('is-writing', mode === 'writing');
      lastKey = key;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}

if (webglAvailable()) {
  init().catch((err) => {
    console.error(err);
    document.documentElement.classList.add('no-gl');
  });
} else {
  document.documentElement.classList.add('no-gl');
}

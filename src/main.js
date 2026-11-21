/*
 * Immersive portfolio prototype.
 *
 * One particle system tells the whole story:
 *   0  signature "Witold K." written stroke by stroke (orange)
 *   1  3D head (photo + Depth Anything V2 depth map, blue) → hover rotates, click opens About
 *   2–7 one shape per project, pushed back as a dim backdrop while a robot arm
 *       (robot.js) hands over each project's video card, driven by scroll
 *   last  the signature again, for contact (the robot signs it)
 *   A  About: a career helix, entered with a camera fly-through
 */
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import * as F from './formations.js';
import { createRobotStage, SIGN_START } from './robot.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth <= 860;
const isTouch = matchMedia('(hover: none)').matches;
const N = isSmall() ? 28000 : 60000;

// Intro timeline (s)
const T_DELAY = 0.4, T_WRITE = 2.6, T_HOLD = 0.4, T_MORPH = 2.6;
const ABOUT_TIME = 1.6;
// Story: 0 signature, 1 head, 2..NP+1 projects, LAST = contact signature.
const NP = document.querySelectorAll('.project').length;
const LAST = NP + 2;
// Viewport without the scrollbar: the WebGL canvas and the CSS3D card layer must agree on it,
// or the HTML cards drift a few px out of their WebGL frames (innerWidth includes the scrollbar).
const viewW = () => document.documentElement.clientWidth;
const viewH = () => document.documentElement.clientHeight;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const gaussian = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const $ = (s) => document.querySelector(s);
const scenes = [...document.querySelectorAll('.scene')];
const railLinks = [...document.querySelectorAll('[data-rail]')];
const hintText = $('#hint-text');
const aboutEl = $('#about');

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}
async function loadImage(src) { const img = new Image(); img.src = src; await img.decode(); return img; }

/* -------------------------------------------------------------- shaders -- */

const vertexShader = /* glsl */`
  uniform float uMix;      // from → to
  uniform float uWrite;    // writing progress of the "from" shape (intro signature; 1 otherwise)
  uniform float uWriteTo;  // writing progress of the "to" shape (the robot signing at the end; 1 otherwise)
  uniform float uFlight;   // how far particles bow out while travelling
  uniform float uSize;
  uniform float uAlphaMul; // dims the shape when it becomes a backdrop

  attribute vec4 aFrom;    // xyz + alpha
  attribute vec4 aTo;
  attribute vec3 aColFrom;
  attribute vec3 aColTo;
  attribute vec4 aData;    // x: random, y: left→right order, z: size, w: writing rank
  attribute vec3 aDrift;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    float delay = aData.y * 0.35 + aData.x * 0.15;
    float lp = clamp((uMix - delay) / 0.5, 0.0, 1.0);
    float e = lp * lp * lp * (lp * (lp * 6.0 - 15.0) + 10.0);

    vec3 pos = mix(aFrom.xyz, aTo.xyz, e) + aDrift * sin(e * 3.14159) * uFlight;

    // Writing: ink appears behind a glowing pen tip.
    float written = smoothstep(aData.w - 0.002, aData.w, uWrite);
    float writtenTo = smoothstep(aData.w - 0.002, aData.w, uWriteTo);
    float pen = exp(-pow((uWrite - aData.w) * 70.0, 2.0)) * step(uWrite, 0.999) * (1.0 - e)
              + exp(-pow((uWriteTo - aData.w) * 70.0, 2.0)) * step(uWriteTo, 0.999) * step(0.001, uWriteTo) * e;

    vColor = mix(aColFrom, aColTo, smoothstep(0.1, 0.9, e)) + pen * vec3(0.5, 0.35, 0.2);
    vAlpha = (mix(aFrom.w * written, aTo.w * writtenTo, e) + pen * 0.5) * uAlphaMul;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aData.z * (1.0 + pen * 1.8) / -mv.z;
  }
`;

const fragmentShader = /* glsl */`
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.15, r) * vAlpha);
  }
`;

/* ----------------------------------------------------------------- init -- */

async function init() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  const CAM_Z = 6, FOV = 35;
  camera.position.z = CAM_Z;

  const [photo, depth] = await Promise.all([loadImage('./assets/JA.png'), loadImage('./assets/JA-depth.png')]);

  const sig = F.signature(N);
  const formations = [
    sig,
    F.portrait(N, photo, depth),
    // same order as the .project sections in index.html
    F.ikeChart(N), F.thesisNetwork(N), F.sigmaTowers(N), F.gyroscope(N), F.lineFollower(N), F.ticTacToe(N), F.browserWindow(N),
    sig,
  ];
  const about = F.careerHelix(N);
  const get = (k) => (k === 'A' ? about : formations[k]);

  /* ---- geometry ---- */
  const aFrom = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
  const aTo = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
  const aColFrom = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const aColTo = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const data = new Float32Array(N * 4), drift = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    data[i * 4] = Math.random();
    data[i * 4 + 1] = i / N;
    data[i * 4 + 2] = 0.8 + Math.random() * 0.4;
    data[i * 4 + 3] = sig.rank[i];
    drift[i * 3] = gaussian() * 0.5; drift[i * 3 + 1] = gaussian() * 0.35; drift[i * 3 + 2] = gaussian() * 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // unused, required by three
  geo.setAttribute('aFrom', aFrom);
  geo.setAttribute('aTo', aTo);
  geo.setAttribute('aColFrom', aColFrom);
  geo.setAttribute('aColTo', aColTo);
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(drift, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

  let pair = '';
  function setPair(a, b) {
    const key = a + '>' + b;
    if (key === pair) return;
    pair = key;
    const fa = get(a), fb = get(b);
    aFrom.array.set(fa.pos); aColFrom.array.set(fa.col);
    aTo.array.set(fb.pos); aColTo.array.set(fb.col);
    aFrom.needsUpdate = aTo.needsUpdate = aColFrom.needsUpdate = aColTo.needsUpdate = true;
  }

  const uniforms = {
    uMix: { value: 0 }, uWrite: { value: reduceMotion ? 1 : 0 }, uWriteTo: { value: 1 },
    uFlight: { value: 0.1 }, uSize: { value: 1 }, uAlphaMul: { value: 1 },
  };
  // depthTest on: the robot and the card faces (which write depth) hide the particles behind them.
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, depthTest: true });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  /* ---- robot cell: project cards as real HTML in 3D ---- */
  const projectEls = [...document.querySelectorAll('.project')];
  const cssScene = new THREE.Scene();
  const cssRenderer = new CSS3DRenderer();
  $('#css3d').appendChild(cssRenderer.domElement);
  const robot = createRobotStage(projectEls.map((el) => ({
    title: el.querySelector('h2').textContent,
    media: el.dataset.media, poster: el.dataset.poster,
    html: el.dataset.card ? document.getElementById(el.dataset.card).innerHTML : null,
  })), cssScene);
  scene.add(robot.stage);

  /* ---- layout ---- */
  let scale = 1;
  const base = { x: 0, y: 0, stageY: 0, stageDrop: 4, bgX: 0, bgY: 0, bgScale: 1 };
  const BG_DEPTH = 2.4;
  // Stage-space bounds of the robot cell: presented card (with its perspective growth) → arm → magazine.
  const CELL = { xMin: -1.25, xMax: 2.25, yMin: -2.05, yMax: 1.5 };
  function layout() {
    const w = viewW(), h = viewH();
    renderer.setSize(w, h, false);
    cssRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * camera.aspect;
    if (isSmall()) {
      scale = Math.min(visH * 0.42, (visW * 0.86) / 1.25);
      base.x = 0; base.y = visH / 2 - visH * 0.29;
      const rs = Math.min(1, visW / 2.9);
      robot.stage.scale.setScalar(rs);
      robot.stage.position.x = 0.15 * rs;
      base.stageY = visH / 2 - visH * 0.27 - 0.25 * rs;   // keep the wrist clear of the nav
      base.bgX = base.x; base.bgY = base.y; base.bgScale = scale * 1.1;
    } else {
      scale = Math.min(visH * 0.8, (visW * 0.46) / 1.15);
      base.x = visW * 0.2; base.y = -visH * 0.01;

      // Fit the whole robot cell inside the right part of the screen, clear of nav, rail and bottom edge.
      const L = -visW / 2 + visW * 0.47, R = visW / 2 - 0.5, T = visH / 2 - 0.5, B = -visH / 2 + 0.1;
      const rs = Math.min(1.05, (R - L) / (CELL.xMax - CELL.xMin), (T - B) / (CELL.yMax - CELL.yMin));
      robot.stage.scale.setScalar(rs);
      robot.stage.position.x = L - CELL.xMin * rs;
      base.stageY = B - CELL.yMin * rs;

      // Backdrop: the project's particle shape sits deeper, where neither the arm nor the copy covers it:
      // in the band between copy and card when that band is wide enough, otherwise in the free space
      // under the copy. Measured in px, then converted to world units at the backdrop's depth.
      const pad = parseFloat(getComputedStyle(scenes[1]).paddingLeft) || 56;
      const copyEls = [...document.querySelectorAll('.project .copy')];
      const copyRight = pad + Math.max(...copyEls.map((el) => el.offsetWidth));
      const copyBottom = h * 0.24 + Math.max(...copyEls.map((el) => el.offsetHeight)) + 24;
      const cardLeft = w * 0.47;                       // = L, where the robot cell starts
      const bandW = cardLeft - copyRight - 24;
      const below = h - 24 - copyBottom;
      let appW, cx, cy;
      if (bandW >= w * 0.12 || below < 150) {
        appW = Math.min(bandW * 1.35, w * 0.3, h * 0.5);
        cx = copyRight + 24 + appW / 2; cy = h * 0.45;
      } else {
        const appH = Math.min(below, w * 0.27);
        appW = appH / 0.9;
        cx = pad + appW / 2 + w * 0.06; cy = copyBottom + appH / 2;
      }
      const k = (CAM_Z + BG_DEPTH) / CAM_Z;
      base.bgX = ((cx / w) * 2 - 1) * (visW / 2) * k;
      base.bgY = -((cy / h) * 2 - 1) * (visH / 2) * k;
      base.bgScale = ((appW / w) * visW * k) / 1.1;
    }
    points.position.set(base.x, base.y, 0);
    points.scale.setScalar(scale);
    const pxPerUnit = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    uniforms.uSize.value = (scale / 270) * pxPerUnit * 1.6;
    measure();
  }

  /* ---- scroll → story position s (0 hero, 1..6 projects, 7 contact) ---- */
  // Scenes have different heights, so map scroll through each scene's centre.
  let centers = [];
  function measure() {
    centers = scenes.map((el, i) => (i === 0 ? 0 : el.getBoundingClientRect().top + scrollY + (el.offsetHeight - viewH()) / 2));
  }
  function storyPosition(y) {
    for (let i = 0; i < centers.length - 1; i++) {
      if (y < centers[i + 1]) return i + clamp01((y - centers[i]) / (centers[i + 1] - centers[i]));
    }
    return centers.length - 1;
  }
  layout();
  addEventListener('resize', layout);
  document.fonts?.ready.then(layout);   // copy sizes change once the web fonts arrive

  /* ---- pointer ---- */
  const ndc = new THREE.Vector2(0, 0);
  const local = new THREE.Vector2(99, 99);
  let pointerSeen = false;
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const track = (e) => {
    pointerSeen = true;
    ndc.set((e.clientX / viewW()) * 2 - 1, -(e.clientY / viewH()) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) local.set((hit.x - points.position.x) / scale, (hit.y - points.position.y) / scale);
  };
  addEventListener('pointermove', track, { passive: true });
  addEventListener('pointerdown', track, { passive: true });   // a tap has no hover before it

  let faceHover = false;
  const onFace = () => {
    const { cx, cy, rx, ry } = F.FACE_HIT;
    return ((local.x - cx) / rx) ** 2 + ((local.y - cy) / ry) ** 2 < 1;
  };

  /* ---- About ---- */
  let aboutTarget = 0, aboutT = 0, aboutFrom = 1, lastFocus = null;
  const closeBtn = $('#about-close');
  function openAbout() {
    if (aboutTarget === 1) return;
    lastFocus = document.activeElement;
    aboutFrom = Math.round(fDisp);
    aboutEl.hidden = false;
    requestAnimationFrame(() => aboutEl.classList.add('is-open'));
    document.body.classList.add('is-about');
    document.documentElement.classList.add('is-locked');   // no page scroll under the About panel
    aboutTarget = 1;
    setTimeout(() => closeBtn.focus({ preventScroll: true }), reduceMotion ? 0 : 500);
  }
  function closeAbout() {
    if (aboutTarget === 0) return;
    aboutTarget = 0;
    aboutEl.classList.remove('is-open');
    document.body.classList.remove('is-about');
    document.documentElement.classList.remove('is-locked');
    lastFocus?.focus?.({ preventScroll: true });
  }
  document.querySelectorAll('[data-open-about]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); openAbout(); }));
  closeBtn.addEventListener('click', closeAbout);
  addEventListener('keydown', (e) => {
    if (aboutTarget !== 1) return;
    if (e.key === 'Escape') closeAbout();
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }   // single control: keep focus in the dialog
  });
  /* ---- Inspect: click the presented card, the arm holds it out and the camera moves in ---- */
  const inspectEl = $('#inspect');
  const inspectClose = $('#inspect-close');
  const inspectPanel = inspectEl.querySelector('.inspect-panel');
  let inspectTarget = 0, inspectT = 0, inspectK = -1, cardHover = false, inspectFocus = null;
  let inspectSpeed = 1.1, inspectScrollY = 0;
  function openInspect(k) {
    if (inspectTarget === 1) return;
    inspectK = k;
    const el = projectEls[k];
    $('#inspect-index').textContent = `${String(k + 1).padStart(2, '0')} / ${String(projectEls.length).padStart(2, '0')}`;
    $('#inspect-title').textContent = el.querySelector('h2').textContent;
    // Context + the full story of the project, from the section's <template class="details">.
    $('#inspect-body').replaceChildren(el.querySelector('template.details').content.cloneNode(true));
    const links = $('#inspect-links');
    links.replaceChildren();
    const add = (href, label, primary) => {
      const a = document.createElement('a');
      a.className = `btn ${primary ? 'btn-primary' : 'btn-ghost'}`;
      a.href = href; a.rel = 'noopener'; a.target = '_blank'; a.textContent = label;
      links.appendChild(a);
    };
    if (el.dataset.demo) add(el.dataset.demo, 'Open live demo', true);
    if (el.dataset.pdf) add(el.dataset.pdf, 'Read the thesis (PDF)', true);
    if (el.dataset.repo) add(el.dataset.repo, 'Code on GitHub', !el.dataset.demo && !el.dataset.pdf);
    if (el.dataset.legacy) add(el.dataset.legacy, 'See the first version', false);
    inspectFocus = document.activeElement;
    inspectScrollY = scrollY;
    inspectPanel.scrollTop = 0;
    inspectEl.hidden = false;
    requestAnimationFrame(() => inspectEl.classList.add('is-open'));
    document.body.classList.add('is-inspect');
    inspectTarget = 1;
    inspectSpeed = 1.1;
    setTimeout(() => { if (inspectTarget === 1) inspectClose.focus({ preventScroll: true }); }, reduceMotion ? 0 : 600);
  }
  function closeInspect(fast = false) {
    if (inspectTarget === 0) return;
    inspectTarget = 0;
    inspectSpeed = fast ? 0.45 : 1.1;
    inspectEl.classList.remove('is-open');
    document.body.classList.remove('is-inspect');
    if (!fast) inspectFocus?.focus?.({ preventScroll: true });
  }
  inspectClose.addEventListener('click', () => closeInspect());
  addEventListener('keydown', (e) => { if (inspectTarget === 1 && e.key === 'Escape') closeInspect(); });

  // Scrolling while a card is up close lets the card go: the page keeps scrolling, the zoom fades out.
  // (Scrolling inside the panel, when it has more text than fits, is left alone.)
  const scrollsPanel = (e) => e.target.closest?.('.inspect-panel') && inspectPanel.scrollHeight > inspectPanel.clientHeight + 2;
  const letGo = (e) => { if (inspectTarget === 1 && !scrollsPanel(e)) closeInspect(true); };
  addEventListener('wheel', letGo, { passive: true });
  addEventListener('touchmove', letGo, { passive: true });
  addEventListener('keydown', (e) => {
    if (inspectTarget === 1 && ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'End', 'Home'].includes(e.key) && !scrollsPanel(e)) closeInspect(true);
  });
  addEventListener('scroll', () => { if (inspectTarget === 1 && Math.abs(scrollY - inspectScrollY) > 24) closeInspect(true); }, { passive: true });

  addEventListener('click', (e) => {
    if (e.target.closest('a, button, .about-panel, .inspect-panel')) return;
    if (aboutTarget === 1) { closeAbout(); return; }                 // click outside the panel closes
    if (inspectTarget === 1) { closeInspect(); return; }
    if (cardHover) { openInspect(robot.held()); return; }
    if (isTouch && robot.stage.visible && aboutT === 0) {
      const k = robot.pickHeld(ndc, camera);
      if (k >= 0) { openInspect(k); return; }
    }
    if (faceHover || (isTouch && aboutT === 0 && Math.abs(fDisp - 1) < 0.03 && onFace())) openAbout();
  });

  // A small hint under each project's copy (only where the 3D cards exist).
  projectEls.forEach((el) => {
    const hint = document.createElement('p');
    hint.className = 'peek mono';
    hint.textContent = isTouch ? 'tap the card to look closer' : 'click the card to look closer';
    el.querySelector('.copy').appendChild(hint);
  });

  /* ---- The robot signs at the end ---- */
  const penPlan = F.signaturePenPlan({ duration: 5.5 });
  // The whole ending runs on its own clock once you reach Contact (not on scroll):
  // put the last card away, take the pen, sign, step back. Leaving rewinds it quickly.
  let seqT = 0;
  const sigLocal = new THREE.Vector3();
  const toStage = (x, y, out) => robot.stage.worldToLocal(out.set(x, y, 0).applyMatrix4(points.matrixWorld));

  /* ---- loop ---- */
  const params = new URLSearchParams(location.search);
  const freezeT = Number(params.get('t')) || null;          // debug: ?t=3.2 freezes the intro
  const forceScene = params.has('scene') ? Number(params.get('scene')) : null;   // debug: ?scene=3
  const start = performance.now() / 1000;
  let last = start, fDisp = 0, pDisp = -1, rotX = 0, rotY = 0, activeScene = -1, hintMode = '';

  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last); last = now;
    const t = freezeT ?? now - start;
    const still = reduceMotion && freezeT === null;

    // Intro: write the signature, then morph it into the head.
    const write = still ? 1 : easeInOutSine(clamp01((t - T_DELAY) / T_WRITE));
    const intro = still ? 1 : easeInOut(clamp01((t - T_DELAY - T_WRITE - T_HOLD) / T_MORPH));

    // Scroll: one scene per screen; formations hold, then morph between scenes.
    const s = forceScene ?? storyPosition(scrollY);
    const target = 1 + Math.floor(s) + smoothstep(0.2, 0.8, s - Math.floor(s));
    if (intro < 1) fDisp = intro;
    else if (reduceMotion) fDisp = Math.round(target);
    else fDisp += (target - fDisp) * Math.min(1, dt * 7);

    // About tween
    aboutT = clamp01(aboutT + (aboutTarget ? 1 : -1) * dt / (reduceMotion ? 0.01 : ABOUT_TIME));
    if (aboutTarget === 0 && aboutT === 0 && !aboutEl.hidden && !aboutEl.classList.contains('is-open')) aboutEl.hidden = true;
    const a = easeInOut(aboutT);

    // Inspect tween
    inspectT = clamp01(inspectT + (inspectTarget ? 1 : -1) * dt / (reduceMotion ? 0.01 : inspectSpeed));
    if (inspectTarget === 0 && inspectT === 0 && !inspectEl.hidden) inspectEl.hidden = true;
    const ie = easeInOut(inspectT);

    // Contact: the ending sequence plays on time once the last card is back in the magazine.
    const pNow = s - 1;
    const atContact = pNow > NP - 0.45 && pDisp > NP - 0.5;
    const SEQ_END = SIGN_START + 0.2 + penPlan.duration + 1.5;
    if (reduceMotion) seqT = atContact ? SEQ_END : 0;
    else seqT = atContact ? Math.min(SEQ_END, seqT + dt) : Math.max(0, seqT - dt * 3);
    const writeTime = seqT - SIGN_START - 0.2;
    const pen = penPlan.at(writeTime);
    const ink = pen.ink;
    // Done writing: lift the pen and step back so the whole signature shows.
    const after = easeInOut(clamp01((writeTime - penPlan.duration - 0.3) / 1.0));
    if (after > 0) { pen.x += 0.22 * after; pen.y -= 0.55 * after; pen.lift = Math.max(pen.lift, after); }

    if (aboutT > 0) {
      setPair(aboutFrom, 'A');
      uniforms.uMix.value = a;
      uniforms.uWrite.value = 1;
      uniforms.uWriteTo.value = 1;
      uniforms.uFlight.value = 0.35;
    } else {
      const from = Math.min(LAST, Math.floor(fDisp + 1e-4));
      const to = Math.min(LAST, from + 1);
      setPair(from, to);
      uniforms.uMix.value = fDisp - from;
      uniforms.uWrite.value = from === 0 ? write : from === LAST ? ink : 1;
      uniforms.uWriteTo.value = to === LAST ? ink : 1;
      uniforms.uFlight.value = 0.1;
    }

    // Rotation: the head follows the cursor while hovered; projects sway on their own.
    faceHover = aboutT === 0 && intro >= 1 && Math.abs(fDisp - 1) < 0.03 && onFace();
    document.body.classList.toggle('is-face-hover', faceHover);
    let tx = 0, ty = 0;
    if (aboutT > 0) { ty = Math.sin(t * 0.4) * 0.5; tx = 0.12; }
    else if (fDisp < 1.5) {
      // The head turns toward the cursor anywhere on the first screen, not only over the face
      // (clicking still needs the face). tanh: quick to react near the head, eases out toward the edges.
      if (pointerSeen && intro >= 1 && !reduceMotion) { ty = Math.tanh(local.x / 0.8) * 0.45; tx = -Math.tanh((local.y - 0.1) / 0.7) * 0.25; }
    } else if (fDisp > LAST - 0.6) { /* contact: the signature sits still so the robot can write on it */ }
    else if (!reduceMotion) { ty = Math.sin(t * 0.35) * 0.45 + ndc.x * 0.3; tx = -ndc.y * 0.12; }
    const k = reduceMotion ? 1 : Math.min(1, dt * 4);
    rotY += (ty - rotY) * k; rotX += (tx - rotX) * k;
    points.rotation.set(rotX, rotY, 0);

    // Projects: the particle shape steps back and dims, it becomes the backdrop.
    const bg = smoothstep(1.0, 1.7, fDisp) * (1 - smoothstep(LAST - 0.7, LAST, fDisp)) * (1 - a);
    const lerp = THREE.MathUtils.lerp;
    points.position.set(lerp(base.x, base.bgX, bg), lerp(base.y, base.bgY, bg), -BG_DEPTH * bg);
    points.scale.setScalar(lerp(scale, base.bgScale, bg));
    uniforms.uAlphaMul.value = 1 - 0.62 * bg;

    // Robot: p = 0 → card 1 held up, 1 → card 2, … (scroll-driven, smoothed); then the timed ending.
    const p = pNow;
    if (reduceMotion) pDisp = Math.round(p);
    else pDisp += (p - pDisp) * Math.min(1, dt * 6);
    const vis = smoothstep(-0.95, -0.45, pDisp) * (1 - a);
    robot.stage.visible = vis > 0.001;
    cssRenderer.domElement.style.visibility = robot.stage.visible ? 'visible' : 'hidden';
    if (robot.stage.visible) {
      robot.stage.position.y = base.stageY - (1 - easeInOut(vis)) * base.stageDrop * robot.stage.scale.y;
      // Signing: the cell steps back so the arm writes from behind the signature (like on glass)
      // and its elbow folds away from the viewer instead of across the letters.
      robot.stage.position.z = -0.85 * robot.stage.scale.z * smoothstep(0, SIGN_START - 0.8, seqT);
      points.updateMatrixWorld();
      robot.stage.updateMatrixWorld();
      const writeStart = toStage(penPlan.start.x, penPlan.start.y, new THREE.Vector3());
      const penWrite = seqT >= SIGN_START ? { tip: toStage(pen.x, pen.y, sigLocal), lift: pen.lift } : null;
      robot.update(THREE.MathUtils.clamp(pDisp, -0.5, NP - 0.5), t, !reduceMotion, { seq: { t: seqT, writeStart, write: penWrite }, inspect: ie });
    }

    // Hovering the presented card shows it can be clicked.
    cardHover = !isTouch && robot.stage.visible && aboutT === 0 && inspectTarget === 0 && robot.pickHeld(ndc, camera) >= 0;
    document.body.classList.toggle('is-card-hover', cardHover);

    // Camera: fly into the head when About opens; move in on the card when inspecting.
    const bump = reduceMotion ? 0 : Math.sin(Math.PI * a);
    let camX = 0, camY = 0, camZ = CAM_Z - 2.6 * bump;
    if (ie > 0 && inspectK >= 0) {
      const c = robot.cardCenterWorld(inspectK);
      const rs = robot.stage.scale.x, tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      // Frame the card in the space the details panel leaves free (left of it, or above it on phones).
      const w = viewW(), h = viewH(), pr = inspectPanel.getBoundingClientRect();
      let fx = 0.5, fy = 0.5, fillW, fillH;
      if (isSmall()) {
        const freeH = Math.max(h * 0.35, pr.top || h * 0.5);
        fy = freeH / 2 / h; fillW = 0.9; fillH = (freeH * 0.8) / h;
      } else {
        const freeW = Math.max(w * 0.4, pr.left || w * 0.6);
        fx = freeW / 2 / w; fillW = (freeW * 0.84) / w; fillH = 0.72;
      }
      const dist = Math.max((1.8 * rs) / (fillW * 2 * tanH * camera.aspect), (1.125 * rs) / (fillH * 2 * tanH));
      const viewHgt = 2 * dist * tanH, viewWid = viewHgt * camera.aspect;
      camX = lerp(0, c.x - (fx - 0.5) * viewWid, ie);
      camY = lerp(0, c.y + (fy - 0.5) * viewHgt, ie);
      camZ = lerp(camZ, c.z + dist, ie);
    }
    camera.position.set(camX, camY, camZ);
    camera.fov = FOV + 14 * bump;
    camera.updateProjectionMatrix();

    // UI: active scene, rail, hint.
    const idx = Math.round(s);
    if (idx !== activeScene) {
      activeScene = idx;
      scenes.forEach((el, i) => el.classList.toggle('is-in', i === idx));
      railLinks.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    }
    const mode = write < 1 ? 'write' : intro < 1 ? 'morph' : 'done';
    if (mode !== hintMode) {
      hintMode = mode;
      hintText.textContent = { write: 'writing signature…', morph: 'building the head in 3D…', done: isTouch ? 'drag to turn my head · tap my face to meet me' : 'I follow your cursor · click my face to meet me' }[mode];
    }

    renderer.render(scene, camera);
    if (robot.stage.visible) {
      robot.syncCss();
      cssRenderer.render(cssScene, camera);
    }
    requestAnimationFrame(frame);
  }
  frame();
  if (new URLSearchParams(location.search).has("about")) openAbout();   // debug: ?about=1
  if (params.has('debug')) window.__debug = { THREE, robot, camera };   // for automated checks
}

/** Without WebGL there are no cards to click: show each project's details right under it. */
function inlineDetails() {
  document.querySelectorAll('.project').forEach((el) => {
    const box = document.createElement('div');
    box.className = 'inspect-body';
    box.appendChild(el.querySelector('template.details').content.cloneNode(true));
    el.querySelector('.copy').appendChild(box);
  });
}

/** Without WebGL the About panel still opens, as a plain dialog. */
function plainAbout() {
  inlineDetails();
  const close = () => { aboutEl.hidden = true; aboutEl.classList.remove("is-open"); document.body.classList.remove("is-about"); document.documentElement.classList.remove("is-locked"); };
  document.querySelectorAll("[data-open-about]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault(); aboutEl.hidden = false; aboutEl.classList.add("is-open"); document.body.classList.add("is-about"); document.documentElement.classList.add("is-locked"); $("#about-close").focus();
  }));
  $("#about-close").addEventListener("click", close);
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

if (webglAvailable()) {
  init().catch((err) => { console.error(err); document.documentElement.classList.add('no-gl'); plainAbout(); });
} else {
  document.documentElement.classList.add('no-gl');
  plainAbout();
}

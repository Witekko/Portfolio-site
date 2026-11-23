/*
 * Robot cell: an industrial arm that takes project cards out of a magazine,
 * presents them to the viewer and puts them back, one after another. After the
 * last project it takes a pen from its cup and signs "Witold K.".
 *
 * - The arm is solved with inverse kinematics every frame: the gripper is
 *   driven along keyframed waypoints, and the shoulder/elbow angles follow.
 * - Each card's face is a real HTML element (video/image) placed in 3D by
 *   CSS3DRenderer. In WebGL the card face is a "hole" (alpha 0, writes depth),
 *   so the HTML shows through, and the gripper or the magazine wall can still
 *   cover it correctly.
 *
 * Everything here is in stage space: about 3.8 units tall at the camera's focus.
 */
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const CARD_W = 1.8, CARD_H = 1.125;
export const PX_W = 1280, PX_H = 800;   // card HTML size; rendered at 2× so it stays sharp up close

const L1 = 1.85, L2 = 1.7;          // upper arm, forearm
const SHOULDER_H = 0.5;
const ROD = 0.42;                   // gripper attach point → wrist
export const BASE = new THREE.Vector3(1.6, -1.95, -0.1);
// The floor everything stands on (magazine, cup, the robot's base plate).
export const FLOOR_Y = -2.03;
const SHOULDER = BASE.clone().add(new THREE.Vector3(0, SHOULDER_H, 0));

const SLOT0 = new THREE.Vector3(1.0, -1.39, -0.56);   // centre of the front card in the magazine
const SLOT_GAP = 0.14;
const LIFT = 1.2;
const Q_SLOT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0));
const PRESENT = new THREE.Vector3(-0.15, 0.1, 0.85);
const Q_PRESENT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, -0.22, 0, 'YXZ'));
const INSPECT = new THREE.Vector3(0.0, 0.15, 1.3);     // card held out toward the camera, facing it
const Q_INSPECT = new THREE.Quaternion();

// Pen: held at its grip point; the tip is PEN_TIP below it along the tool's -Y.
const PEN_TIP = 0.45;
const CUP = new THREE.Vector3(-0.35, -2.0, -0.6);                 // cup base
const PEN_IN_CUP = new THREE.Vector3(CUP.x, CUP.y + 0.03 + PEN_TIP, CUP.z);
const Q_UPRIGHT = new THREE.Quaternion();
// Writing on an upright plane from behind it: tip forward-down, wrist up and back.
const Q_PEN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.22, 0, 0));
const PEN_LIFT = 0.12;
// After signing: a calm pose folded to the right, wrist left of the shoulder so the elbow
// stays out to the right, well clear of the signature.
const REST_GRIP = new THREE.Vector3(1.0, -0.9 - ROD, 0.0);

// Ending, on its own clock (seconds): to the cup, take the pen, bring it to the first stroke.
export const SIGN_START = 3.3;
// The ending (seconds from reaching Contact): the arm takes the business card from its stand
// and holds it up, big: the last thing on the page.
export const CARD_SHOWN = 3.0;
const BC_SCALE = 1.6;   // it grows as it is lifted, to the size of a presented project card and a bit more
const BC_W = 1.3, BC_H = 0.76;                                        // the business card
const BC_TOP = new THREE.Vector3(-1.0, FLOOR_Y + 0.07 + BC_H, -0.5);  // its top edge, standing in the stand
const Q_STAND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, 0.35, 0, 'YXZ'));
const BC_SHOW = new THREE.Vector3(-0.1, 0.25 + (BC_SCALE * BC_H) / 2, 1.05);   // top edge; the card's centre sits where project cards are shown
const Q_SHOW = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, -0.16, 0, 'YXZ'));
// Tic-Tac-Toe, on its own clock (seconds): put the card back, take the pen, wait by the board.
// Running the clock backwards plays it in reverse (pen back in the cup, card back in hand).
export const GAME_READY = 4.3;

const UP = new THREE.Vector3(0, 1, 0);
const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ------------------------------------------------------------- materials -- */

const mat = {
  arm: new THREE.MeshStandardMaterial({ color: 0x223a72, metalness: 0.45, roughness: 0.38 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0e1834, metalness: 0.5, roughness: 0.45 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8fa6cc, metalness: 0.8, roughness: 0.25 }),
  hot: new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff5a10, emissiveIntensity: 0.55, roughness: 0.5 }),
  cardBack: new THREE.MeshStandardMaterial({ color: 0x0b1430, metalness: 0.3, roughness: 0.6 }),
  // The hole: transparent black that still writes depth.
  hole: new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending }),
};

/* --------------------------------------------------------------- helpers -- */

const tmpM = new THREE.Matrix4();
const vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();

/** Places a mesh whose local Y runs from a to b, with its local Z along `axis`. */
function placeLink(mesh, a, b, axis) {
  vy.subVectors(b, a).normalize();
  vx.crossVectors(vy, axis).normalize();
  vz.crossVectors(vx, vy);
  tmpM.makeBasis(vx, vy, vz);
  mesh.quaternion.setFromRotationMatrix(tmpM);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
}
/** Places a mesh with its local Y along `axis` (joint housings are cylinders). */
function placeJoint(mesh, p, axis) {
  vy.copy(axis);
  vx.set(0, 1, 0).cross(vy).normalize();
  vz.crossVectors(vx, vy);
  tmpM.makeBasis(vx, vy, vz);
  mesh.quaternion.setFromRotationMatrix(tmpM);
  mesh.position.copy(p);
}
const m = (geo, material) => new THREE.Mesh(geo, material);

/* ------------------------------------------------------------------ arm -- */

function buildArm(stage) {
  const parts = {};

  // Pedestal down to the floor, on a wide, low base plate.
  const pedestalH = BASE.y - FLOOR_Y;
  const pedestal = m(new THREE.CylinderGeometry(0.36, 0.44, pedestalH, 48), mat.dark);
  pedestal.position.set(BASE.x, BASE.y - pedestalH / 2, BASE.z);
  const plate = m(new THREE.CylinderGeometry(0.5, 0.52, 0.03, 48), mat.dark);
  plate.position.set(BASE.x, FLOOR_Y + 0.015, BASE.z);
  stage.add(pedestal, plate);

  parts.turret = new THREE.Group();
  parts.turret.position.copy(BASE);
  stage.add(parts.turret);
  const turretBody = m(new THREE.CylinderGeometry(0.3, 0.34, SHOULDER_H, 48), mat.arm);
  turretBody.position.y = SHOULDER_H / 2;
  parts.turret.add(turretBody);
  const ring = m(new THREE.TorusGeometry(0.345, 0.022, 12, 64), mat.hot);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  parts.turret.add(ring);

  const housing = (r, len) => {
    const g = new THREE.Group();
    g.add(m(new THREE.CylinderGeometry(r, r, len, 40), mat.dark));
    for (const s of [-1, 1]) {
      const cap = m(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.03, 32), mat.hot);
      cap.position.y = s * (len / 2 + 0.012);
      g.add(cap);
    }
    stage.add(g);
    return g;
  };
  parts.shoulder = housing(0.22, 0.5);
  parts.elbow = housing(0.17, 0.4);

  parts.upper = m(new RoundedBoxGeometry(0.28, L1, 0.32, 4, 0.08), mat.arm);
  parts.fore = m(new RoundedBoxGeometry(0.2, L2, 0.24, 4, 0.06), mat.arm);
  stage.add(parts.upper, parts.fore);

  parts.wrist = m(new THREE.SphereGeometry(0.13, 32, 16), mat.dark);
  stage.add(parts.wrist);

  // Gripper: its origin is the grip point (a card's top-edge centre, or the pen's grip).
  parts.tool = new THREE.Group();
  stage.add(parts.tool);
  const rod = m(new THREE.CylinderGeometry(0.045, 0.045, ROD - 0.1, 20), mat.steel);
  rod.position.y = 0.1 + (ROD - 0.1) / 2;
  const palm = m(new RoundedBoxGeometry(0.46, 0.08, 0.16, 3, 0.02), mat.dark);
  palm.position.y = 0.08;
  const stripe = m(new THREE.BoxGeometry(0.3, 0.012, 0.165), mat.hot);
  stripe.position.y = 0.08;
  parts.tool.add(rod, palm, stripe);
  parts.fingers = [-1, 1].map((s) => {
    const f = m(new RoundedBoxGeometry(0.34, 0.17, 0.035, 2, 0.012), mat.steel);
    f.userData.side = s;
    parts.tool.add(f);
    return f;
  });

  return parts;
}

/** Elbow-up two-link IK in the arm's vertical plane. */
function solveArm(W) {
  const d = new THREE.Vector3().subVectors(W, SHOULDER);
  const r = Math.hypot(d.x, d.z) || 1e-6;
  const yaw = Math.atan2(d.x, d.z);
  const dir = new THREE.Vector3(d.x / r, 0, d.z / r);
  const axis = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const D = THREE.MathUtils.clamp(Math.hypot(r, d.y), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const a = Math.atan2(d.y, r);
  const b = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const th = a + b;
  const E = SHOULDER.clone().addScaledVector(dir, L1 * Math.cos(th)).addScaledVector(UP, L1 * Math.sin(th));
  return { yaw, axis, E };
}

/* --------------------------------------------------------- magazine, cup -- */

function buildMagazine(stage, count) {
  const g = new THREE.Group();
  const w = CARD_W + 0.24, depth = count * SLOT_GAP + 0.34;
  const front = SLOT0.z + 0.2, cx = SLOT0.x, floor = SLOT0.y - CARD_H / 2 - 0.05;
  const zc = front - depth / 2;
  const plate = (sx, sy, sz, x, y, z, material = mat.dark) => {
    const p = m(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(sx, sy, sz) * 0.3), material);
    p.position.set(x, y, z);
    g.add(p);
  };
  plate(w, 0.06, depth, cx, floor, zc);                           // floor
  plate(w, 0.95, 0.05, cx, floor + 0.47, front - depth);          // back wall
  plate(0.05, 0.7, depth, cx - w / 2, floor + 0.35, zc);          // sides
  plate(0.05, 0.7, depth, cx + w / 2, floor + 0.35, zc);
  plate(w, 0.46, 0.05, cx, floor + 0.23, front);                  // front lip: hides the lower card edges
  plate(w * 0.5, 0.025, 0.02, cx, floor + 0.36, front + 0.03, mat.hot);
  stage.add(g);
}

function buildPen(stage) {
  const cup = m(new THREE.CylinderGeometry(0.08, 0.07, 0.24, 32, 1, true), mat.dark);
  cup.material = mat.dark.clone();
  cup.material.side = THREE.DoubleSide;
  cup.position.set(CUP.x, CUP.y + 0.12, CUP.z);
  const cupBase = m(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 32), mat.dark);
  cupBase.position.set(CUP.x, CUP.y + 0.01, CUP.z);
  const cupRing = m(new THREE.TorusGeometry(0.08, 0.008, 8, 40), mat.hot);
  cupRing.rotation.x = Math.PI / 2;
  cupRing.position.set(CUP.x, CUP.y + 0.24, CUP.z);
  stage.add(cup, cupBase, cupRing);

  // Pen, origin at its grip point; the tip points down its -Y.
  const pen = new THREE.Group();
  const body = m(new THREE.CylinderGeometry(0.026, 0.026, 0.4, 20), mat.hot);
  body.position.y = -0.16;
  const cap = m(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 20), mat.steel);
  cap.position.y = 0.08;
  const cone = m(new THREE.ConeGeometry(0.026, 0.07, 20), mat.steel);
  cone.rotation.x = Math.PI;
  cone.position.y = -PEN_TIP + 0.035;
  pen.add(body, cap, cone);
  stage.add(pen);
  return pen;
}

/** The business card and the little stand it waits in, next to the cup. Origin: its top edge. */
function buildBusinessCard(stage) {
  const stand = new THREE.Group();
  const foot = m(new RoundedBoxGeometry(0.36, 0.05, 0.2, 2, 0.015), mat.dark);
  foot.position.set(0, 0.025, 0);
  const lip = m(new THREE.BoxGeometry(0.3, 0.012, 0.012), mat.hot);
  lip.position.set(0, 0.055, 0.075);
  stand.add(foot, lip);
  stand.position.set(BC_TOP.x, FLOOR_Y, BC_TOP.z);
  stand.rotation.y = 0.35;
  stage.add(stand);

  const W = 1024, H = Math.round(1024 * BC_H / BC_W), cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const draw = () => {
    const c = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const sans = css.getPropertyValue('--sans').trim() || 'system-ui, sans-serif';
    const mono = css.getPropertyValue('--mono').trim() || 'monospace';
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0a1330'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ff8a3d'; c.fillRect(0, 0, 14, H);                 // the accent edge, like the site's cards
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ff8a3d'; c.font = `500 34px ${mono}`; c.fillText('wk_', 64, 92);
    c.fillStyle = '#eef3ff'; c.font = `600 70px ${sans}`; c.fillText('Witold Korzeniewski', 64, 236);
    c.fillStyle = '#c3d0e8'; c.font = `400 40px ${sans}`;
    c.fillText('Industrial data engineer,', 64, 306);
    c.fillText('moving into machine learning.', 64, 356);
    c.fillStyle = '#93a6c8'; c.font = `500 30px ${mono}`;
    c.fillText('Wrocław, Poland  ·  LinkedIn  ·  github.com/Witekko', 64, H - 56);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const card = new THREE.Group();
  const back = m(new RoundedBoxGeometry(BC_W + 0.03, BC_H + 0.03, 0.02, 2, 0.01), mat.cardBack);
  back.position.y = -BC_H / 2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BC_W, BC_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, -BC_H / 2, 0.011);
  card.add(back, face);
  stage.add(card);
  draw();
  document.fonts?.ready.then(draw);   // the web fonts may arrive after the first draw
  return card;
}

/* ------------------------------------------------------------------ cards -- */

function buildCard(stage, cssScene, item, k) {
  const group = new THREE.Group();
  const face = m(new THREE.PlaneGeometry(CARD_W, CARD_H), mat.hole);
  face.position.z = 0.002;
  const back = m(new RoundedBoxGeometry(CARD_W + 0.05, CARD_H + 0.05, 0.03, 2, 0.012), mat.cardBack);
  back.position.z = -0.016;
  group.add(face, back);
  stage.add(group);

  const el = document.createElement('div');
  el.className = 'card3d';
  el.style.width = PX_W + 'px';
  el.style.height = PX_H + 'px';
  el.innerHTML = `
    <div class="card3d-bar"><span class="card3d-n">${String(k + 1).padStart(2, '0')}</span><span>${item.title}</span><i></i></div>
    <div class="card3d-media"></div>`;
  const media = el.querySelector('.card3d-media');
  const isVideo = /\.(mp4|webm)$/i.test(item.media || '');
  let node;
  if (item.html) {
    // A card face made of HTML (e.g. the thesis): nothing to load or play.
    media.innerHTML = item.html;
  } else if (isVideo) {
    node = document.createElement('video');
    Object.assign(node, { muted: true, loop: true, playsInline: true, preload: 'none' });
    node.setAttribute('muted', '');
    node.setAttribute('playsinline', '');
    if (item.poster) node.poster = item.poster;
  } else {
    node = document.createElement('img');
    node.alt = '';
    node.decoding = 'async';
  }
  if (node) media.appendChild(node);
  const css = new CSS3DObject(el);
  cssScene.add(css);

  return {
    group, face, css, item, loaded: false, playing: false,
    load() {
      if (this.loaded || !node) return;
      this.loaded = true;
      node.src = item.media;
      if (isVideo) node.preload = 'auto';
    },
    play(on) {
      if (!isVideo || on === this.playing) return;
      this.playing = on;
      if (on) { this.load(); node.play().catch(() => {}); } else node.pause();
    },
  };
}

/* ------------------------------------------------------------------ stage -- */

export function createRobotStage(items, cssScene) {
  const stage = new THREE.Group();

  stage.add(new THREE.HemisphereLight(0x9cbcff, 0x050b1a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 5, 6);
  const rim = new THREE.DirectionalLight(0x4d94ff, 3.5);
  rim.position.set(5, 2, -5);
  const warm = new THREE.PointLight(0xff8a3d, 3, 3.5, 2);
  stage.add(key, rim, warm);

  const arm = buildArm(stage);
  buildMagazine(stage, items.length);
  const pen = buildPen(stage);
  const bcard = buildBusinessCard(stage);
  const parkCardBC = () => { bcard.position.copy(BC_TOP); bcard.quaternion.copy(Q_STAND); };
  parkCardBC();
  const bcAbove = BC_TOP.clone().add(new THREE.Vector3(0, 0.5, 0.08));
  const cards = items.map((item, k) => buildCard(stage, cssScene, item, k));

  const slotCenter = (k) => SLOT0.clone().add(new THREE.Vector3(0, k * 0.045, -k * SLOT_GAP));
  const topOf = (center, q) => center.clone().addScaledVector(UP.clone().applyQuaternion(q), CARD_H / 2);
  const grasp = (k) => topOf(slotCenter(k), Q_SLOT);
  const above = (k) => grasp(k).add(new THREE.Vector3(0, LIFT, 0.05));
  const present = topOf(PRESENT, Q_PRESENT);
  const inspectTop = topOf(INSPECT, Q_INSPECT);
  const rest = above(0).add(new THREE.Vector3(-0.1, 0.25, 0.25));
  const cupAbove = PEN_IN_CUP.clone().add(new THREE.Vector3(0, 0.55, 0.1));

  const parkCard = (c, k) => { c.group.position.copy(slotCenter(k)); c.group.quaternion.copy(Q_SLOT); };
  cards.forEach(parkCard);
  const parkPen = () => { pen.position.copy(PEN_IN_CUP); pen.quaternion.copy(Q_UPRIGHT); };
  parkPen();

  /** Keyframes for presenting card k; u runs 0..1 across its scroll segment. */
  /** Above slot k, or the rest pose for k < 0 (nothing taken yet). */
  const aboveOr = (k) => (k < 0 ? rest : above(k));
  /** fromK: where the arm comes from (default: the card before). A jump comes from further away. */
  function cardKeys(k, fromK = null) {
    const from = fromK !== null ? aboveOr(fromK) : k === 0 ? rest : above(k - 1);
    return [
      [0.00, from, Q_SLOT, 0],
      [0.08, above(k), Q_SLOT, 0],
      [0.15, grasp(k), Q_SLOT, 0],
      [0.19, grasp(k), Q_SLOT, 1],
      [0.28, above(k), Q_SLOT, 1],
      [0.40, present, Q_PRESENT, 1],
      [0.62, present, Q_PRESENT, 1],
      [0.74, above(k), Q_SLOT, 1],
      [0.83, grasp(k), Q_SLOT, 1],
      [0.87, grasp(k), Q_SLOT, 0],
      [0.95, above(k), Q_SLOT, 0],
      [1.00, above(k), Q_SLOT, 0],
    ];
  }
  /** A game (times in seconds): card k back into the magazine, the pen out of the cup, ready by the board. */
  function gameKeys(k, readyGrip) {
    return [
      [0.0, present, Q_PRESENT, 1],
      [0.6, above(k), Q_SLOT, 1],
      [0.95, grasp(k), Q_SLOT, 1],
      [1.05, grasp(k), Q_SLOT, 0],
      [1.4, above(k), Q_SLOT, 0],
      [2.3, cupAbove, Q_UPRIGHT, 0],
      [2.75, PEN_IN_CUP, Q_UPRIGHT, 0],
      [2.95, PEN_IN_CUP, Q_UPRIGHT, 1],
      [3.4, cupAbove, Q_UPRIGHT, 1],
      [GAME_READY, readyGrip, Q_PEN, 1],
    ];
  }
  /** The ending (seconds): from the last card's slot (or fromK) to the stand, the business card up. */
  function endKeys(fromK = null) {
    return [
      [0.0, fromK !== null ? aboveOr(fromK) : above(cards.length - 1), Q_SLOT, 0],
      [0.9, bcAbove, Q_STAND, 0],
      [1.3, BC_TOP, Q_STAND, 0],
      [1.5, BC_TOP, Q_STAND, 1],
      [1.9, bcAbove, Q_STAND, 1],
      [CARD_SHOWN, BC_SHOW, Q_SHOW, 1],
    ];
  }
  /** After the last card (times in seconds): fetch the pen and bring it to the start of the signature. */
  function penKeys(writeStartGrip, fromK = null) {
    return [
      [0.0, fromK !== null ? aboveOr(fromK) : above(cards.length - 1), Q_SLOT, 0],
      [1.0, cupAbove, Q_UPRIGHT, 0],
      [1.45, PEN_IN_CUP, Q_UPRIGHT, 0],
      [1.65, PEN_IN_CUP, Q_UPRIGHT, 1],
      [2.1, cupAbove, Q_UPRIGHT, 1],
      [SIGN_START, writeStartGrip, Q_PEN, 1],
    ];
  }
  function sample(ks, u, out) {
    let i = 0;
    while (i < ks.length - 2 && u > ks[i + 1][0]) i++;
    const [u0, p0, q0, g0] = ks[i], [u1, p1, q1, g1] = ks[i + 1];
    const e = easeInOut(clamp01((u - u0) / (u1 - u0 || 1)));
    out.attach.lerpVectors(p0, p1, e);
    out.q.slerpQuaternions(q0, q1, e);
    out.grip = g0 + (g1 - g0) * e;
  }

  // Pen tip on the writing plane → grip point (the gripper holds the pen above its tip).
  const gripForTip = (tip, lift, out = new THREE.Vector3()) =>
    out.copy(tip).add(new THREE.Vector3(0, 0, -PEN_LIFT * lift)).addScaledVector(UP.clone().applyQuaternion(Q_PEN), PEN_TIP);

  const pose = { attach: new THREE.Vector3(), q: new THREE.Quaternion(), grip: 0 };
  const W = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpV = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  let heldCard = -1;

  /**
   * p: project progress (0 = card 1 held up, 1 = card 2, …), driven by scroll.
   * opts.seq: the timed ending, { t (seconds) }: the business card from its stand, held up
   *           positions in stage space; while seq.t > 0 it takes over from the cards.
   * opts.inspect: 0..1, how far the held card is brought out toward the camera
   * opts.fromK: a jump: the arm comes to this card (or to the pen) from above slot fromK
   *             (-1: from rest), instead of from the card before it
   * opts.game: Tic-Tac-Toe, { t (seconds, 0..GAME_READY), k (the game's card), rest: pen tip waiting
   *            by the board, write: { tip, lift } | null }, stage space; while t > 0 it takes over.
   */
  function update(p, t, motion = true, { seq = null, inspect = 0, game = null, fromK = null } = {}) {
    const n = cards.length;
    let holdingPen = false, holdingCard = false, cardGrow = 0;
    heldCard = -1;

    if (game && game.t > 0) {
      sample(gameKeys(game.k, gripForTip(game.rest, 1)), game.t, pose);
      if (game.t < 1.0) heldCard = game.k;      // released at 1.0–1.05: from then on it is in its slot
      holdingPen = game.t > 2.85;
      if (game.write && game.t >= GAME_READY) {
        gripForTip(game.write.tip, game.write.lift, pose.attach);
        pose.q.copy(Q_PEN);
        pose.grip = 1;
      }
    } else if (!seq || seq.t <= 0) {
      const k = THREE.MathUtils.clamp(Math.floor(p + 0.5), 0, n - 1);
      const u = clamp01(p + 0.5 - k);
      sample(cardKeys(k, fromK), u, pose);
      if (u > 0.18 && u < 0.86) heldCard = k;
      // Breathing while the card is held up for reading.
      if (motion) {
        const hold = clamp01((u - 0.36) / 0.06) * clamp01((0.66 - u) / 0.06) * (1 - inspect);
        pose.attach.x += Math.sin(t * 1.1) * 0.02 * hold;
        pose.attach.y += Math.sin(t * 0.8) * 0.025 * hold;
      }
      // Inspect: hold the card out toward the camera, square to it.
      if (inspect > 0 && heldCard >= 0) {
        const e = easeInOut(inspect);
        pose.attach.lerp(inspectTop, e);
        pose.q.slerp(Q_INSPECT, e);
      }
    } else {
      sample(endKeys(fromK), seq.t, pose);
      holdingCard = seq.t > 1.45;
      cardGrow = easeInOut(clamp01((seq.t - 1.6) / (CARD_SHOWN - 1.6)));
      if (motion && seq.t > CARD_SHOWN) {   // held up: breathing, like a presented card
        const b = clamp01(seq.t - CARD_SHOWN);
        pose.attach.x += Math.sin(t * 1.1) * 0.015 * b;
        pose.attach.y += Math.sin(t * 0.8) * 0.02 * b;
      }
    }

    // Gripper
    arm.tool.position.copy(pose.attach);
    arm.tool.quaternion.copy(pose.q);
    const closed = holdingPen ? 0.012 : 0.035;   // the pen is thinner than a card
    arm.fingers.forEach((f) => { f.position.set(0, 0.0, f.userData.side * (closed + (1 - pose.grip) * 0.07)); });
    W.copy(UP).applyQuaternion(pose.q).multiplyScalar(ROD).add(pose.attach);

    // Arm
    const { yaw, axis, E } = solveArm(W);
    arm.turret.rotation.y = yaw;
    placeJoint(arm.shoulder, SHOULDER, axis);
    placeJoint(arm.elbow, E, axis);
    placeLink(arm.upper, SHOULDER, E, axis);
    placeLink(arm.fore, E, W, axis);
    arm.wrist.position.copy(W);
    warm.position.copy(W).add(new THREE.Vector3(0, 0.3, 0.4));

    // Pen
    if (holdingPen) { pen.position.copy(pose.attach); pen.quaternion.copy(pose.q); } else parkPen();
    if (holdingCard) { bcard.position.copy(pose.attach); bcard.quaternion.copy(pose.q); } else parkCardBC();
    bcard.scale.setScalar(1 + (BC_SCALE - 1) * (holdingCard ? cardGrow : 0));

    // Cards: the held one follows the gripper and plays; the rest wait in their slots.
    cards.forEach((c, j) => {
      if (j === heldCard) {
        c.group.quaternion.copy(pose.q);
        c.group.position.copy(pose.attach).addScaledVector(tmpV.copy(UP).applyQuaternion(pose.q), -CARD_H / 2);
      } else parkCard(c, j);
      if (Math.abs(p - j) < 1.6) c.load();
      c.play(j === heldCard);
    });
    return heldCard;
  }

  /** Copies each card's world transform onto its HTML twin. */
  function syncCss() {
    stage.updateMatrixWorld();
    cards.forEach((c) => {
      c.group.matrixWorld.decompose(c.css.position, c.css.quaternion, tmpS);
      c.css.position.addScaledVector(tmpV.set(0, 0, 1).applyQuaternion(c.css.quaternion), 0.002 * tmpS.x);
      c.css.scale.copy(tmpS).multiplyScalar(CARD_W / PX_W);
    });
  }

  /** Index of the held card under the pointer, or -1. */
  function pickHeld(ndc, camera) {
    if (heldCard < 0) return -1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(cards[heldCard].face, false).length ? heldCard : -1;
  }

  /** World-space centre of a card (for the camera to frame it). */
  const cardCenterWorld = (k, out = new THREE.Vector3()) => cards[k].group.getWorldPosition(out);

  return { stage, update, syncCss, cards, pickHeld, cardCenterWorld, held: () => heldCard, yaw: () => arm.turret.rotation.y,
    /** For sound: where the gripper is, how the turret is turned, how closed the grip is. */
    motion: () => ({ x: arm.tool.position.x, y: arm.tool.position.y, z: arm.tool.position.z, yaw: arm.turret.rotation.y, grip: pose.grip }),
  };
}

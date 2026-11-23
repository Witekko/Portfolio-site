/*
 * Line Follower, in the Line Follower project: draw a track on the glass and a little
 * line follower drives it.
 *
 * You draw with the mouse or a finger; the arm's pen follows your hand, so it looks like
 * the robot is drawing what you guide. Then the car drops onto the start of the line and
 * follows it the way the real one did: five sensors under its nose, a PD controller that
 * steers toward whichever sensors see the line. Draw a corner too sharp and it loses the
 * line, searches for a moment, and gives up, just like the cardboard original.
 *
 * Same interface as ttt.js, so main.js runs both games the same way. Stage space.
 */
import * as THREE from 'three';
import { makeGlass } from './ttt.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);
const say = (list) => list[(Math.random() * list.length) | 0];

// The car (top view, forward = +x), and how it drives.
const SENSORS = [-0.064, -0.032, 0, 0.032, 0.064];   // across its nose
const NOSE = 0.11;                                   // sensors this far ahead of its centre
const SEE = 0.03;                                    // a sensor sees the line within this distance
const SPEED = 0.42, KP = 40, KD = 1.4, MAX_TURN = 6;
const LOST_AFTER = 1.4;                              // seconds of searching before it gives up
const STALL_AFTER = 3;                               // seconds without getting further along the line
const MAXP = 900, STEP = 0.018, LINE_W = 0.034;

const TALK = {
  draw: ['Draw me a track. I will follow it.', 'Draw a line on the glass. Any line.', 'Your turn to design the track.'],
  short: ['That is a dot. Draw a longer track.', 'A bit longer, please. I need room to drive.'],
  go: ['Sensors on. Here we go.', 'Following. Do not blink.', 'Line found. Rolling.'],
  done: ['Made it. Draw a harder one?', 'Track complete. Got anything sharper?', 'Easy. Try some tight corners.'],
  lost: ['Lost the line. The cardboard one did that too.', 'Too sharp for me. Real sensors, real limits.', 'Off the track. That corner wins.'],
};

/** The car, built flat on the glass, facing +x. */
function buildCar() {
  const g = new THREE.Group();
  const basic = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false });
  const rect = (w, h, color, x = 0, y = 0, r = 0.012) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2);
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 4), basic(color));
    m.position.set(x, y, 0);
    g.add(m);
    return m;
  };
  rect(0.075, 0.026, 0x0b1430, -0.03, 0.088, 0.008);    // wheels
  rect(0.075, 0.026, 0x0b1430, -0.03, -0.088, 0.008);
  const body = rect(0.2, 0.15, 0x2c4a8f);               // chassis
  body.position.z = 0.001;
  rect(0.12, 0.09, 0x0b1430, -0.02, 0, 0.01).position.z = 0.002;   // the deck
  const led = rect(0.022, 0.022, 0xff8a3d, 0.02, 0.04, 0.011);
  led.position.z = 0.003;
  const bar = rect(0.026, 0.16, 0x16244a, NOSE, 0, 0.006);   // the sensor bar
  bar.position.z = 0.002;
  const eyes = SENSORS.map((y) => {
    const e = rect(0.018, 0.018, 0x5a2a10, NOSE, y, 0.004);
    e.position.z = 0.003;
    return e;
  });
  g.traverse((o) => { if (o.isMesh) o.renderOrder = 6; });
  return { g, eyes, led, mats: [] };
}

export function createLineFollower({ onStatus = () => {}, audio = null, small = false } = {}) {
  // The board: the same glass as the Tic-Tac-Toe game, the same place.
  const C = small ? 0.5 : 0.56;
  const BOARD = new THREE.Vector3(small ? -0.5 : -0.6, small ? 0.465 : 0.62, 0.85);
  const HALF = C * 1.5;                                  // the drawing area is 3 squares wide
  const INK_Z = BOARD.z + 0.006;
  const REST = new THREE.Vector3(BOARD.x + 1.9 * C, BOARD.y - 0.4 * C, BOARD.z);
  const inside = (p, m = 0) => Math.abs(p.x - BOARD.x) <= HALF + m && Math.abs(p.y - BOARD.y) <= HALF + m;

  const group = new THREE.Group();
  group.visible = false;
  const glass = makeGlass(C * 3.7, BOARD.x, BOARD.y, BOARD.z);
  group.add(glass.mesh);

  // The track: a ribbon that grows as you draw.
  const pts = [];
  const pos = new Float32Array(MAXP * 2 * 3);
  const idx = [];
  for (let i = 1; i < MAXP; i++) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const inkMat = new THREE.MeshBasicMaterial({ color: 0xdce8ff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const ink = new THREE.Mesh(geo, inkMat);
  ink.renderOrder = 5;
  ink.frustumCulled = false;
  group.add(ink);
  let trackLen = 0;
  function clearTrack() { pts.length = 0; trackLen = 0; geo.setDrawRange(0, 0); }
  function setVertex(i, p, nx, ny) {
    pos.set([p.x + nx * LINE_W / 2, p.y + ny * LINE_W / 2, INK_Z, p.x - nx * LINE_W / 2, p.y - ny * LINE_W / 2, INK_Z], i * 6);
  }
  function addPoint(p) {
    if (pts.length >= MAXP) return;
    const last = pts[pts.length - 1];
    if (last && last.distanceTo(p) < STEP) return;
    if (last && last.distanceTo(p) > STEP * 3) {   // a fast stroke: fill in, so the ribbon stays smooth
      const n = Math.ceil(last.distanceTo(p) / STEP);
      const a = last.clone();
      for (let k = 1; k < n; k++) addPoint(a.clone().lerp(p, k / n));
    }
    const prev = pts[pts.length - 1];
    pts.push(p.clone());
    const i = pts.length - 1;
    if (prev) {
      trackLen += prev.distanceTo(p);
      const dx = p.x - prev.x, dy = p.y - prev.y, l = Math.hypot(dx, dy) || 1;
      setVertex(i, p, -dy / l, dx / l);
      if (i === 1) setVertex(0, prev, -dy / l, dx / l);
    } else setVertex(0, p, 0, 0);
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, pts.length - 1) * 6);
  }
  /** Distance from p to the track, and the index of the nearest point on it. */
  const near = { d: 0, i: 0 };
  function nearest(px, py) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = clamp01(((px - a.x) * vx + (py - a.y) * vy) / l2);
      const dx = a.x + vx * t - px, dy = a.y + vy * t - py, d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    near.d = Math.sqrt(best); near.i = bi;
    return near;
  }

  // The car.
  const car = buildCar();
  car.g.position.z = INK_Z + 0.004;
  car.g.visible = false;
  group.add(car.g);
  const carPos = new THREE.Vector2();
  let heading = 0, prevErr = 0, lastErr = 0, lostFor = 0, progress = 0, placeAt = 0, stallFor = 0;

  // The pen: follows your hand while you draw, otherwise waits beside the board.
  const tip = REST.clone(), penTarget = REST.clone();
  let lift = 1, liftTarget = 1;

  let state = 'off', glassIn = 0, fade = 1, leaveDone = null;

  function startDrawing() {
    state = 'draw';
    onStatus(say(TALK.draw));
  }
  function place() {
    // Behind the start, facing along the first bit of the line: the sensors sit on its start.
    const p0 = pts[0];
    let k = 1;
    while (k < pts.length - 1 && pts[k].distanceTo(p0) < 0.08) k++;
    heading = Math.atan2(pts[k].y - p0.y, pts[k].x - p0.x);
    carPos.set(p0.x - Math.cos(heading) * NOSE, p0.y - Math.sin(heading) * NOSE);
    prevErr = lastErr = 0; lostFor = 0; progress = 0; stallFor = 0;
    car.g.visible = true;
    state = 'place';
    placeAt = performance.now();
    onStatus(say(TALK.go));
    audio?.blip(660);
  }
  /** The sensors are at the end of the line (not just somewhere near it on a loop). */
  function nearEnd(x, y) {
    const last = pts[pts.length - 1];
    return progress >= pts.length - 8 && Math.hypot(x - last.x, y - last.y) < 0.09;
  }
  /** Finish: it rolls to a stop at the end of the line, then celebrates. */
  let parkAt = 0, parkV = 0;
  function park() {
    state = 'park';
    parkAt = performance.now();
    parkV = SPEED * 0.6;
    car.eyes.forEach((e) => e.material.color.setHex(0xffb27a));
  }
  function end(ok) {
    state = 'end';
    onStatus(say(ok ? TALK.done : TALK.lost), true);
    if (ok) audio?.finish(); else audio?.blip(330);
  }

  function drive(dt) {
    const c = Math.cos(heading), sn = Math.sin(heading);
    const nx = carPos.x + c * NOSE, ny = carPos.y + sn * NOSE;
    let sum = 0, on = 0;
    SENSORS.forEach((off, i) => {
      // sensor i sits "off" to the left of the heading
      const sx = nx - sn * off, sy = ny + c * off;
      const seen = nearest(sx, sy).d < SEE;
      car.eyes[i].material.color.setHex(seen ? 0xffb27a : 0x5a2a10);
      if (seen) { sum += off; on++; }
    });
    let v = SPEED, omega;
    if (on) {
      const err = sum / on;
      omega = Math.max(-MAX_TURN, Math.min(MAX_TURN, KP * err + KD * (err - prevErr) / Math.max(dt, 1e-3)));
      prevErr = err; lastErr = err; lostFor = 0;
      v *= 1 - Math.min(0.6, (Math.abs(err) / 0.064) * 0.6);   // slower into corners
    } else {
      if (nearEnd(nx, ny)) { park(); return; }   // the line ran out under its nose: that is the finish, not lost
      lostFor += dt;   // searching: turn toward where it last saw the line
      omega = (lastErr >= 0 ? 1 : -1) * 3;
      v = 0.06;
      if (lostFor > LOST_AFTER) { end(false); return; }
    }
    heading += omega * dt;
    carPos.x += Math.cos(heading) * v * dt;
    carPos.y += Math.sin(heading) * v * dt;
    // How far along the line it got, measured at the sensors (they lead the car by NOSE).
    const fx = carPos.x + Math.cos(heading) * NOSE, fy = carPos.y + Math.sin(heading) * NOSE;
    const n = nearest(fx, fy);
    if (n.d < 0.06 && n.i > progress) { progress = n.i; stallFor = 0; } else stallFor += dt;
    if (stallFor > STALL_AFTER) { end(false); return; }   // going round in circles at a corner: it is lost
    const last = pts[pts.length - 1];
    if (progress >= pts.length - 3 && Math.hypot(fx - last.x, fy - last.y) < 0.03) park();
    if (!inside({ x: carPos.x, y: carPos.y }, 0.15)) end(false);
  }

  return {
    group,
    rest: REST,
    get state() { return state; },
    get showHud() { return ['draw', 'drawing', 'place', 'run', 'end'].includes(state); },
    pen: () => ({ tip, lift }),
    caption: new THREE.Vector3(BOARD.x, BOARD.y - C * 1.75, BOARD.z),
    plane: { point: BOARD, normal: new THREE.Vector3(0, 0, 1) },
    cursor(p) { return (state === 'draw' || state === 'end') && inside(p) ? 'draw' : ''; },
    begin() {
      group.visible = true;
      glassIn = 0; fade = 1;
      inkMat.opacity = 1;
      clearTrack();
      car.g.visible = false;
      tip.copy(REST); penTarget.copy(REST); lift = liftTarget = 1;
      state = 'glass';
    },
    again() {
      if (state !== 'end') return;
      clearTrack();
      car.g.visible = false;
      startDrawing();
    },
    finish(done) {
      state = 'leaving';
      onStatus('');
      penTarget.copy(REST); liftTarget = 1;
      leaveDone = done;
    },
    click() { return false; },
    /** Drawing: main.js passes pointer down / move / up with the point on the board (or null). */
    pointer(type, p) {
      if (type === 'down' && p && inside(p) && (state === 'draw' || state === 'end')) {
        clearTrack();
        car.g.visible = false;
        state = 'drawing';
        onStatus('drawing… let go when the track is done');
        addPoint(p);
        penTarget.copy(p); liftTarget = 0;
        return true;
      }
      if (state !== 'drawing') return false;
      if (type === 'move' && p) {
        const q = p.clone();
        q.x = Math.max(BOARD.x - HALF, Math.min(BOARD.x + HALF, q.x));
        q.y = Math.max(BOARD.y - HALF, Math.min(BOARD.y + HALF, q.y));
        addPoint(q);
        penTarget.copy(q);
      }
      if (type === 'up') {
        penTarget.copy(REST); liftTarget = 1;
        if (trackLen < 0.6) { clearTrack(); state = 'draw'; onStatus(say(TALK.short)); }
        else place();
      }
      return true;
    },
    get drawing() { return state === 'drawing'; },
    update(dt, visible01) {
      // The pen: chase the target smoothly (the arm can't jump), lift and lower quickly.
      tip.lerp(penTarget, 1 - Math.exp(-dt * (state === 'drawing' ? 22 : 7)));
      lift += (liftTarget - lift) * (1 - Math.exp(-dt * 14));
      if (state === 'leaving' && tip.distanceTo(REST) < 0.02 && lift > 0.95) { state = 'off'; const f = leaveDone; leaveDone = null; f?.(); }
      // The glass slides up into place first.
      if (state === 'glass') {
        glassIn = Math.min(1, glassIn + dt / 0.5);
        if (glassIn >= 1) startDrawing();
      }
      const gi = ease(glassIn);
      glass.mesh.position.y = glass.homeY - (1 - gi) * C * 0.4;
      glass.mat.opacity = gi * fade;
      // The car drops onto the line, then drives.
      if (state === 'place') {
        const k = clamp01((performance.now() - placeAt) / 350);
        car.g.scale.setScalar(0.6 + 0.4 * ease(k));
        if (performance.now() - placeAt > 700) state = 'run';
      }
      if (state === 'run') {
        let left = dt;   // small steps: the controller stays stable when a frame is slow
        while (left > 0 && state === 'run') { const h = Math.min(left, 1 / 120); drive(h); left -= h; }
      }
      if (state === 'park') {
        parkV *= Math.exp(-dt * 9);   // brakes
        carPos.x += Math.cos(heading) * parkV * dt; carPos.y += Math.sin(heading) * parkV * dt;
        if (performance.now() - parkAt > 450) end(true);
      }
      if (car.g.visible) {
        car.g.position.x = carPos.x; car.g.position.y = carPos.y;
        car.g.rotation.z = heading;
        car.led.material.opacity = state === 'run' ? 0.6 + 0.4 * Math.sin(performance.now() * 0.02) : 1;
      }
      if (fade !== visible01) {
        fade = visible01;
        inkMat.opacity = fade;
        car.g.traverse((o) => { if (o.isMesh && o !== car.led) o.material.opacity = fade; });
        group.visible = fade > 0.01;
      }
    },
  };
}

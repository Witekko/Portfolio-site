/*
 * Tic-Tac-Toe against the robot, in the Tic-Tac-Toe project.
 *
 * The arm draws the board on the glass in front of it with the same pen it signs with.
 * You click a square for your X; it answers with an O. It plays minimax, like the original
 * project, so the best you can get is a draw.
 *
 * Everything here is in the robot stage's space. main.js runs the arm (robot.update with
 * { game }), turns clicks into points on the board and shows the status text.
 */
import * as THREE from 'three';

let C = 0.56;                                                // one square (smaller on phones)
const BOARD = new THREE.Vector3(-0.6, 0.62, 0.85);           // centre of the board, on the writing plane
const INK_Z = BOARD.z + 0.006;                               // the ink sits just in front of the pen tip
const REST = new THREE.Vector3(BOARD.x + 1.9 * C, BOARD.y - 0.4 * C, BOARD.z);   // the pen waits here, lifted
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const HOT = 0xff8a3d, COOL = 0xbcd4ff;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => x * x * (3 - 2 * x);
const at = (u, v) => new THREE.Vector3(BOARD.x + u * C, BOARD.y + v * C, BOARD.z);
const centre = (i) => at((i % 3) - 1, 1 - Math.floor(i / 3));

/* ----------------------------------------------------------------- ink -- */

/** A stroke of glowing ink along pts, revealed from start to end by set(0..1). */
function makeStroke(pts, color, width = 0.02) {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3), index = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    for (let k = 0; k < 2; k++) {
      const sgn = k ? 1 : -1;
      pos.set([pts[i].x + nx * sgn * width / 2, pts[i].y + ny * sgn * width / 2, INK_Z], (i * 2 + k) * 3);
    }
    if (i) { const q = (i - 1) * 2; index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const segs = n - 1;
  let len = 0;
  for (let i = 1; i < n; i++) len += pts[i].distanceTo(pts[i - 1]);
  return {
    mesh, pts, len, mat,
    set(p) { geo.setDrawRange(0, Math.round(clamp01(p) * segs) * 6); },
    /** The point at fraction p of the way along. */
    point(p, out = new THREE.Vector3()) {
      const f = clamp01(p) * segs, i = Math.min(segs - 1, Math.floor(f));
      return out.lerpVectors(pts[i], pts[i + 1], f - i);
    },
  };
}
const line = (a, b, steps = 24) => Array.from({ length: steps + 1 }, (_, i) => new THREE.Vector3().lerpVectors(a, b, i / steps));
const circle = (c, r, steps = 44) => Array.from({ length: steps + 1 }, (_, i) => {
  const a = Math.PI / 2 + (i / steps) * Math.PI * 2.08;   // a little past full: a hand-drawn O overlaps where it started
  return new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z);
});

/* --------------------------------------------------------------- glass -- */

/**
 * The glass board the games are drawn on: a faint tint, a brighter rim, a diagonal sheen.
 * width: its width; it is taller than wide and hangs below (x, y), the board's centre, so
 * there is room under the board for the robot's lines. Shared with the Line Follower game.
 */
export function makeGlass(width, x, y, z, ratio = 1.25) {
  const W = 512, H = Math.round(512 * ratio), cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 36);
  c.fillStyle = 'rgba(8, 16, 38, 0.72)'; c.fill();   // smoked glass: what is behind it stays out of the way
  c.fillStyle = 'rgba(150, 190, 255, 0.08)'; c.fill();
  c.lineWidth = 4; c.strokeStyle = 'rgba(190, 215, 255, 0.55)'; c.stroke();
  c.save(); c.clip();
  const g = c.createLinearGradient(0, 0, W, H * 0.6);   // the sheen
  g.addColorStop(0.18, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.36, 'rgba(255,255,255,0)'); g.addColorStop(0.44, 'rgba(255,255,255,0.06)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const h = width * (H / W);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
  const homeY = y - (h - width) / 2;
  mesh.position.set(x, homeY, z - 0.012);
  mesh.renderOrder = 4;
  return { mesh, mat, homeY, width };
}

/* -------------------------------------------------------------- minimax -- */

function winner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { who: b[l[0]], line: l };
  return b.every(Boolean) ? { who: 'draw' } : null;
}
function minimax(b, turn, depth) {
  const w = winner(b);
  if (w) return w.who === 'O' ? 10 - depth : w.who === 'X' ? depth - 10 : 0;
  let best = turn === 'O' ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const v = minimax(b, turn === 'O' ? 'X' : 'O', depth + 1);
    b[i] = null;
    best = turn === 'O' ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
/** The robot's move: the best by minimax; among equally good ones, any (so games differ). */
function bestMove(b) {
  let best = -Infinity, moves = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = 'O';
    const v = minimax(b, 'X', 1);
    b[i] = null;
    if (v > best) { best = v; moves = [i]; } else if (v === best) moves.push(i);
  }
  return moves[(Math.random() * moves.length) | 0];
}

/* ---------------------------------------------------------- trash talk -- */

// Light trash talk from the robot. It never gets mean: it is a minimax, not a troll.
const TALK = {
  start: ['Your move. I have already seen how this ends.', 'Go on. Take your time, I have all of it.', 'Try to beat me. Many have tried.'],
  think: ['Interesting choice.', 'Bold.', 'Hmm. Classic human move.', 'I saw that coming.', 'Oh, that one.', 'Calculating… done.'],
  yours: ['Your move.', 'Your turn. No pressure.', 'Beep. Your move.', 'Go on.'],
  blocked: ['Nice try. Blocked.', 'Not today.', 'I see you.'],
  threat: ['Careful now.', 'Two in a row. Just saying.', 'Watch the corner.'],
  win: ['Minimax 1, human 0. Rematch?', 'Told you. Again?', 'GG. The pen is mightier.'],
  draw: ['A draw. Against me, that is a win. Respect.', 'Draw. Best you can do. Well played.'],
  lost: ['Wait… that is not possible.'],
};
const say = (k) => TALK[k][(Math.random() * TALK[k].length) | 0];
/** Two of one mark and an empty square in a line: the empty square, or -1. */
function threat(b, who) {
  for (const l of LINES) {
    const v = l.map((i) => b[i]);
    if (v.filter((x) => x === who).length === 2 && v.includes(null)) return l[v.indexOf(null)];
  }
  return -1;
}

/* ----------------------------------------------------------------- game -- */

export function createTicTacToe({ onStatus = () => {}, onResult = () => {}, audio = null, small = false } = {}) {
  if (small) {   // phones: the board sits above the copy, under the menu: a little smaller and lower
    C = 0.5;
    BOARD.set(-0.5, 0.465, BOARD.z);
    REST.set(BOARD.x + 1.9 * C, BOARD.y - 0.4 * C, BOARD.z);
  }
  const group = new THREE.Group();
  group.visible = false;
  let glassIn = 0;   // the glass slides up into place before the board is drawn
  const tip = REST.clone();
  let glass = makeGlass(C * 3.7, BOARD.x, BOARD.y, BOARD.z);
  const caption = new THREE.Vector3(BOARD.x, BOARD.y - C * 1.75, BOARD.z);
  let lift = 1, board = Array(9).fill(null), marks = [], grid = [], state = 'off', fade = 1;
  let steps = [], stepAt = 0, afterSteps = null, xAnim = null, thinkUntil = 0;

  /* The pen's plan: travel lifted, put it down, draw, lift it. Steps are planned ahead
     against a cursor, so each one starts where the previous one will have ended. */
  const cursor = new THREE.Vector3();
  function travelFrom(to) {
    const from = cursor.clone(), d = from.distanceTo(to);
    cursor.copy(to);
    steps.push({ dur: 0.15 + d * 0.35, run: (k) => { tip.lerpVectors(from, to, ease(k)); lift = 1; } });
  }
  function drawFrom(stroke) {
    travelFrom(stroke.pts[0]);
    const end = stroke.pts[stroke.pts.length - 1];
    steps.push({ dur: 0.1, run: (k) => { tip.copy(stroke.pts[0]); lift = 1 - ease(k); } });
    steps.push({ dur: 0.1 + stroke.len * 0.38, run: (k) => { const e = ease(k) * 0.15 + k * 0.85; stroke.point(e, tip); stroke.set(e); lift = 0; } });
    steps.push({ dur: 0.1, run: (k) => { tip.copy(end); lift = ease(k); } });
    cursor.copy(end);
  }
  function schedule(build, then) {
    steps = [];
    cursor.copy(tip);
    build();
    stepAt = 0;
    afterSteps = then;
  }

  group.add(glass.mesh);
  function add(stroke) { group.add(stroke.mesh); return stroke; }
  function clearMarks() {
    marks.forEach((m) => { group.remove(m.mesh); m.mesh.geometry.dispose(); m.mat.dispose(); });
    marks = [];
    board = Array(9).fill(null);
  }

  function drawGrid() {
    if (!grid.length) {
      grid = [
        add(makeStroke(line(at(-0.5, 1.5), at(-0.5, -1.5)), COOL, 0.016)),   // zigzag: each line starts
        add(makeStroke(line(at(0.5, -1.5), at(0.5, 1.5)), COOL, 0.016)),     // near where the last ended
        add(makeStroke(line(at(1.5, 0.5), at(-1.5, 0.5)), COOL, 0.016)),
        add(makeStroke(line(at(-1.5, -0.5), at(1.5, -0.5)), COOL, 0.016)),
      ];
    }
    grid.forEach((g) => g.set(0));
    state = 'grid';
    onStatus('drawing the board…');
    talkNext = say('start');
    schedule(() => { grid.forEach(drawFrom); travelFrom(REST); }, yourTurn);
  }
  let talkNext = '';
  function yourTurn() {
    state = 'you';
    onStatus(talkNext || say('yours'));
    talkNext = '';
  }
  function robotTurn() {
    state = 'think';
    onStatus(say('think'));
    thinkUntil = performance.now() + 650;
  }
  function robotMove() {
    const block = threat(board, 'X');
    const i = bestMove(board);
    board[i] = 'O';
    talkNext = i === block ? say('blocked') : threat(board, 'O') >= 0 ? say('threat') : '';
    const o = add(makeStroke(circle(centre(i), C * 0.32), HOT, 0.022));
    marks.push(o);
    state = 'robot';
    schedule(() => { drawFrom(o); travelFrom(REST); }, () => check() || yourTurn());
  }
  /** After a move: is it over? Draws the winning line if the robot won. */
  function check() {
    const w = winner(board);
    if (!w) return false;
    if (w.who === 'O') {
      const a = centre(w.line[0]), b = centre(w.line[2]);
      const dir = b.clone().sub(a).normalize().multiplyScalar(C * 0.45);
      const strike = add(makeStroke(line(a.clone().sub(dir), b.clone().add(dir)), HOT, 0.016));
      marks.push(strike);
      state = 'robot';
      schedule(() => { drawFrom(strike); travelFrom(REST); }, () => { onResult('robot'); end(say('win')); });
      audio?.blip(392);
    } else { onResult(w.who === 'draw' ? 'draw' : 'you'); end(say(w.who === 'draw' ? 'draw' : 'lost')); }
    return true;
  }
  function end(text) {
    state = 'end';
    onStatus(text, true);
    audio?.finish();
  }

  return {
    group,
    rest: REST,
    get state() { return state; },
    get yourTurn() { return state === 'you'; },
    /** Show the robot's lines and the buttons under the board. */
    get showHud() { return ['grid', 'you', 'think', 'placing', 'robot', 'end'].includes(state); },
    /** What the pointer over the board would do: 'pick' (a free square on your turn) or ''. */
    cursor(p) { return state === 'you' && this.squareAt(p) >= 0 ? 'pick' : ''; },
    /** The pen for robot.update: { tip, lift } in stage space. */
    pen: () => ({ tip, lift }),
    /** The arm is ready by the board: draw it (or just wait, if it is already there). */
    begin() {
      group.visible = true;
      glassIn = 0;
      fade = 1;
      group.children.forEach((m) => { if (m !== glass.mesh) m.material.opacity = 1; });
      tip.copy(REST); lift = 1;
      clearMarks();
      state = 'glass';   // the glass settles first, then the pen starts
    },
    /** Start over on the same board. */
    again() {
      if (state !== 'end') return;
      clearMarks();
      talkNext = say('start');
      yourTurn();
    },
    /** Put the pen back where the arm expects it, then call done (the arm then leaves). */
    finish(done) {
      state = 'leaving';
      onStatus('');
      schedule(() => travelFrom(REST), () => { state = 'off'; done?.(); });
    },
    /** p: a point in stage space on the board's plane. Returns true if it was a move. */
    click(p) {
      if (state !== 'you') return false;
      const u = Math.round((p.x - BOARD.x) / C), v = Math.round((p.y - BOARD.y) / C);
      if (Math.abs(u) > 1 || Math.abs(v) > 1) return false;
      const i = (1 - v) * 3 + (u + 1);
      if (board[i]) return false;
      board[i] = 'X';
      const c = centre(i), r = C * 0.3;
      const a = add(makeStroke(line(new THREE.Vector3(c.x - r, c.y + r, c.z), new THREE.Vector3(c.x + r, c.y - r, c.z), 10), COOL, 0.022));
      const b = add(makeStroke(line(new THREE.Vector3(c.x + r, c.y + r, c.z), new THREE.Vector3(c.x - r, c.y - r, c.z), 10), COOL, 0.022));
      marks.push(a, b);
      xAnim = { a, b, t0: performance.now() };
      audio?.tick();
      state = 'placing';
      return true;
    },
    /** The square under a board point: its centre (stage space), for the cursor. */
    cellCentre(p) { const i = this.squareAt(p); return i < 0 ? null : centre(i); },
    /** Which square is under a board point (for the cursor), or -1. */
    squareAt(p) {
      const u = Math.round((p.x - BOARD.x) / C), v = Math.round((p.y - BOARD.y) / C);
      if (Math.abs(u) > 1 || Math.abs(v) > 1) return -1;
      const i = (1 - v) * 3 + (u + 1);
      return board[i] ? -1 : i;
    },
    /** Where the robot's lines go: under the board, on the glass (stage space). */
    caption,
    /** One square (stage units). */
    get size() { return C; },
    /** Phones: put the board where it fits the screen (centre x, y and square size c, stage space). */
    place(x, y, c, ratio = 1.25) {
      C = c;
      BOARD.set(x, y, BOARD.z);
      REST.set(BOARD.x + 1.9 * C, BOARD.y - 0.4 * C, BOARD.z);
      caption.set(BOARD.x, BOARD.y - C * 1.75, BOARD.z);
      group.remove(glass.mesh); glass.mesh.geometry.dispose(); glass.mat.map?.dispose(); glass.mat.dispose();
      glass = makeGlass(C * 3.7, BOARD.x, BOARD.y, BOARD.z, ratio);
      group.add(glass.mesh);
      grid.forEach((g) => { group.remove(g.mesh); g.mesh.geometry.dispose(); g.mat.dispose(); });
      grid = [];   // redrawn at the new place
      tip.copy(REST);
    },
    /** The board's plane in stage space (for picking). */
    plane: { point: BOARD, normal: new THREE.Vector3(0, 0, 1) },
    /** Every frame. visible01: how present the game is (fades the ink as the arm leaves). */
    update(dt, visible01) {
      const dt0 = dt;
      // The pen's plan.
      while (steps.length && dt > 0) {
        const st = steps[0];
        stepAt += dt / st.dur;
        st.run(Math.min(1, stepAt));
        if (stepAt < 1) { dt = 0; break; }
        dt = (stepAt - 1) * st.dur;
        stepAt = 0;
        steps.shift();
        if (!steps.length && afterSteps) { const f = afterSteps; afterSteps = null; f(); }
      }
      // Your X: two quick strokes, no pen.
      if (xAnim) {
        const k = (performance.now() - xAnim.t0) / 260;
        xAnim.a.set(k);
        xAnim.b.set(k - 0.6);
        if (k >= 1.6) { xAnim = null; if (!check()) robotTurn(); }
      }
      if (state === 'think' && performance.now() > thinkUntil) robotMove();
      if (state === 'glass') {
        glassIn = Math.min(1, glassIn + dt0 / 0.5);
        if (glassIn >= 1) drawGrid();
      }
      const gi = ease(glassIn);
      glass.mesh.position.y = glass.homeY - (1 - gi) * C * 0.4;
      glass.mat.opacity = gi * fade;
      // Leaving: the ink fades with the arm.
      if (fade !== visible01) {
        fade = visible01;
        group.children.forEach((m) => { if (m !== glass.mesh) m.material.opacity = fade; });
        group.visible = fade > 0.01;
      }
    },
  };
}

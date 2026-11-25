/*
 * The cursor companion: a thin ring that trails the mouse and says what a click would do.
 *
 *   idle   a small ring, fades out when the mouse rests and over text
 *   hot    over a link or button: the ring opens up a little
 *   disc   over the face / a project card: a disc with a word in it replaces the arrow
 *   tag    over a small target (the business card's links): the hand stays, a tag hangs below it
 *   draw   Line Follower: crosshair ticks around the system crosshair
 *   cell   Tic-Tac-Toe: a ring that snaps into the free square under the mouse
 *
 * Only with a real mouse and without reduced motion. The system cursor is hidden in one case
 * only (disc, a big target), and never when frames are slow: then the word moves to the tag.
 */
const SMOOTH = 0.09;       // seconds: the ring's spring (critically damped, settles in ~2×)
const REST_MS = 2200;      // the idle ring fades after this long without moving
const SLOW = 0.045;        // average frame time above which the arrow is never replaced

export function createCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const el = document.createElement('div');
  el.className = 'cur';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="cur-ring"></i><i class="cur-cell"></i><i class="cur-cross"></i><b class="cur-disc mono"></b><b class="cur-tag mono"></b>';
  document.body.appendChild(el);
  const disc = el.querySelector('.cur-disc'), tag = el.querySelector('.cur-tag'), cell = el.querySelector('.cur-cell');

  const m = { x: 0, y: 0 }, p = { x: 0, y: 0 }, v = { x: 0, y: 0 };
  let seen = false, movedAt = 0, over = 'page', mode = '', frameAvg = 1 / 60, cellSize = 0;
  const forceFull = new URLSearchParams(location.search).get('cursor') === 'full';   // debug: slow test browsers

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    m.x = e.clientX; m.y = e.clientY;
    movedAt = performance.now();
    if (!seen) { p.x = m.x; p.y = m.y; seen = true; }
    const t = e.target;
    over = !t.closest ? 'page'
      : t.closest('a, button, input, label, .j-slots li') ? 'control'
      : t.closest('p, h1, h2, h3, li, .inspect-panel, .cookies, .j-card') ? 'text' : 'page';
  }, { passive: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') el.classList.add('is-down'); }, { passive: true });
  addEventListener('pointerup', () => el.classList.remove('is-down'), { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { seen = false; });

  const damp = (k, target, dt, time) => {   // critically damped spring (never overshoots)
    const w = 2 / time, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const d = p[k] - target, tmp = (v[k] + w * d) * dt;
    v[k] = (v[k] - w * tmp) * e;
    p[k] = target + (d + tmp) * e;
  };

  return {
    /**
     * want: what is under the mouse in the 3D scene, or null:
     *   { mode: 'disc' | 'tag', label } · { mode: 'draw' } · { mode: 'cell', x, y, size } (screen px)
     * quiet: no idle ring (the ride, the entrance).
     */
    update(dt, want, quiet = false) {
      frameAvg += (dt - frameAvg) * 0.05;
      let next;
      if (!seen) next = '';
      else if (over === 'control') next = 'hot';          // page controls are on top of the scene
      else if (want) next = want.mode === 'disc' && frameAvg > SLOW && !forceFull ? 'tag' : want.mode;
      else if (quiet || over === 'text' || performance.now() - movedAt > REST_MS) next = '';
      else next = 'idle';

      const snap = next === 'cell';
      const time = next === 'draw' ? 0.03 : next === 'disc' ? 0.05 : SMOOTH;   // tighter when precision matters
      damp('x', snap ? want.x : m.x, dt, time);
      damp('y', snap ? want.y : m.y, dt, time);
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      if (snap && Math.abs(want.size - cellSize) > 0.5) { cellSize = want.size; cell.style.width = cell.style.height = `${cellSize}px`; cell.style.margin = `${-cellSize / 2}px`; }
      if (next === 'disc' && disc.textContent !== want.label) disc.textContent = want.label;
      if (next === 'tag' && tag.textContent !== want.label) tag.textContent = want.label;
      if (next !== mode) {
        mode = next;
        el.dataset.mode = mode;
        document.documentElement.classList.toggle('cur-none', mode === 'disc');
      }
    },
  };
}

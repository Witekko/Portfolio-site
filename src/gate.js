/*
 * The entrance: a "calibration" screen that shows real loading progress, then lets
 * the visitor enter with sound or in silence. Entering is the user gesture that
 * browsers require before any audio, and it is what starts the intro.
 */
export function createGate() {
  const el = document.getElementById('gate');
  const pct = document.getElementById('gate-pct');
  const bar = document.getElementById('gate-bar');
  const status = document.getElementById('gate-status');
  let target = 0, shown = 0, ready = false, done = false, resolveEnter;
  const entered = new Promise((r) => { resolveEnter = r; });

  el.querySelectorAll('[data-sound]').forEach((b) => b.addEventListener('click', () => {
    if (!ready || done) return;
    done = true;
    resolveEnter({ sound: b.dataset.sound === 'on' });
  }));

  // The number eases toward the real progress, so it never jumps.
  const tick = () => {
    if (done && !el.isConnected) return;
    shown += Math.min(target - shown, Math.max(0.012, (target - shown) * 0.07));   // ~1.3 s at least: the calibration is felt
    if (target >= 1 && shown > 0.995) shown = 1;
    pct.textContent = `${Math.round(shown * 100)}%`;
    bar.style.transform = `scaleX(${shown})`;
    if (shown === 1 && !ready) {
      ready = true;
      status.textContent = 'ready';
      el.classList.add('is-ready');
      el.querySelector('[data-sound="on"]').focus({ preventScroll: true });
    }
    if (!done || shown < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    entered,
    /** p: 0..1 real progress; label: what is happening now. */
    setProgress(p, label) {
      target = Math.max(target, p);
      if (label && !ready) status.textContent = label;
    },
    /** Opens up from the centre, then goes away. */
    leave(instant = false) {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), instant ? 0 : 1100);
    },
    /** Skip the gate (debug, or no WebGL). */
    skip() { done = true; resolveEnter({ sound: false }); el.remove(); },
  };
}

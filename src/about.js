/*
 * About, inside the head: a walk along a line, then things to play with.
 *
 *  - Its own scroll, with the same inertia as the page (Lenis on the About layer).
 *  - chapter(): where the reader is, 0 = hello, 1..5 = the stops on the line, 6 = off hours,
 *    fractional in between. main.js morphs the particles from shape to shape with it.
 *  - The route: an orange line draws itself down the left side as you scroll, and a little
 *    line follower (the cardboard one, in spirit) rides at its tip. Stops it has passed light up.
 *    After the last stop the line goes on as a dotted trail: to be continued.
 *  - F1 start lights: five lamps come on one by one, go out after a random wait, click.
 */
import Lenis from 'lenis';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createAbout({ audio = null } = {}) {
  const el = document.getElementById('about');
  const inner = el.querySelector('.about-inner');
  const chapters = [...el.querySelectorAll('[data-chapter]')];
  const route = el.querySelector('.route');
  const svg = route.querySelector('.route-line');
  const ghost = svg.querySelector('.route-ghost'), ink = svg.querySelector('.route-ink'), tail = svg.querySelector('.route-tail');
  const follower = svg.querySelector('.follower');
  const stations = [...route.querySelectorAll('.station')];
  const loading = el.querySelector('.loading span');
  let lenis = null, total = 0, stops = [];

  /* ---- scroll ---- */
  function ensureLenis() {
    if (lenis || reduceMotion) return;
    lenis = new Lenis({ wrapper: el, content: inner, lerp: 0.07, autoRaf: true });
    lenis.on('scroll', draw);
  }
  el.addEventListener('scroll', () => { if (!lenis) draw(); }, { passive: true });

  /** 0 hello … 6 off hours, fractional between chapters (by their centres). */
  function chapter() {
    const mid = el.clientHeight / 2;
    const c = chapters.map((ch) => { const r = ch.getBoundingClientRect(); return r.top + r.height / 2; });
    if (mid <= c[0]) return 0;
    for (let i = 0; i < c.length - 1; i++) {
      if (mid < c[i + 1]) return i + (mid - c[i]) / (c[i + 1] - c[i]);
    }
    return c.length - 1;
  }

  /* ---- the route ---- */
  // A gentle S-curve through the stops, then a dotted trail into the dark.
  function buildRoute() {
    const h = route.offsetHeight;
    if (!h) return;
    svg.setAttribute('viewBox', `0 0 44 ${h}`);
    // Stops sit on the station markers (CSS: .station::before), the line swings out between them.
    const X = 25.5;
    stops = stations.map((s) => ({ x: X, y: s.offsetTop + s.offsetHeight / 2 - 34 }));
    const pts = [{ x: X, y: 0 }, ...stops];
    let d = `M${X},0`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dy = b.y - a.y, w = i % 2 ? 15 : -15;
      d += ` C${a.x + w},${a.y + dy * 0.35} ${b.x - w},${a.y + dy * 0.65} ${b.x},${b.y}`;
    }
    ghost.setAttribute('d', d);
    ink.setAttribute('d', d);
    const last = stops[stops.length - 1];
    tail.setAttribute('d', `M${X},${last.y} C${X + 14},${last.y + 70} ${X - 14},${last.y + 130} ${X},${Math.min(h, last.y + 230)}`);
    total = ink.getTotalLength();
    ink.style.strokeDasharray = `${total} ${total}`;
    stops.forEach((s) => { s.len = lengthAtY(s.y); });
    draw();
  }
  // y grows along the path, so the length at a given y can be found by bisection.
  function lengthAtY(y) {
    let lo = 0, hi = total;
    for (let k = 0; k < 18; k++) {
      const m = (lo + hi) / 2;
      if (ink.getPointAtLength(m).y < y) lo = m; else hi = m;
    }
    return lo;
  }
  let lastLen = -1;
  function draw() {
    if (!total) return;
    // The tip follows the middle of the screen.
    const tipY = el.clientHeight * 0.55 - route.getBoundingClientRect().top;
    const len = reduceMotion ? total : Math.min(total, lengthAtY(tipY));
    if (Math.abs(len - lastLen) < 0.25) return;
    lastLen = len;
    ink.style.strokeDashoffset = String(total - len);
    const p = ink.getPointAtLength(len), q = ink.getPointAtLength(Math.min(total, len + 1));
    const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI - 90;
    follower.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${len >= total - 0.5 ? 0 : ang}) scale(1.45)`);
    stations.forEach((s, i) => {
      const reached = len >= stops[i].len - 1;
      if (reached !== s.classList.contains('is-reached')) {
        s.classList.toggle('is-reached', reached);
        if (reached) audio?.tick();
      }
    });
    tail.style.opacity = len >= total - 0.5 ? '' : '0';
    if (loading) loading.textContent = String(Math.round(37 * Math.min(1, Math.max(0, (len - stops[stops.length - 1].len + 160) / 160))));
  }
  new ResizeObserver(() => { if (!el.hidden) buildRoute(); }).observe(inner);

  /* ---- F1 start lights ---- */
  const gantry = el.querySelector('#f1');
  const lamps = [...gantry.querySelectorAll('.lamps i')];
  const msg = el.querySelector('#f1-msg');
  const bestEl = el.querySelector('#f1-best');
  let best = Number(localStorage.getItem('wk-f1-best')) || 0;
  let state = 'idle', timers = [], outAt = 0;
  const showBest = () => { bestEl.textContent = best ? `${best} ms` : '—'; };
  showBest();
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const setLamps = (n) => lamps.forEach((l, i) => l.classList.toggle('on', i < n));
  function startSequence() {
    clear();
    state = 'lights';
    gantry.classList.remove('is-jump');
    setLamps(0);
    msg.textContent = 'Wait for it…';
    lamps.forEach((_, i) => timers.push(setTimeout(() => { setLamps(i + 1); audio?.blip(i === 4 ? 880 : 660); }, 700 + i * 900)));
    // After the fifth lamp: a random hold, as in a real start.
    timers.push(setTimeout(() => {
      setLamps(0);
      state = 'go';
      outAt = performance.now();
    }, 700 + 4 * 900 + 400 + Math.random() * 2200));
  }
  function press(timeStamp) {
    if (state === 'idle' || state === 'done') { startSequence(); return; }
    if (state === 'lights') {
      clear();
      state = 'done';
      setLamps(5);
      gantry.classList.add('is-jump');
      msg.textContent = 'Jump start! Click to try again.';
      return;
    }
    if (state === 'go') {
      const ms = Math.max(1, Math.round(timeStamp - outAt));
      state = 'done';
      const verdict = ms < 200 ? 'faster than most F1 drivers' : ms < 260 ? 'race-ready' : ms < 350 ? 'solid start' : 'still on the grid';
      msg.innerHTML = `<b>${ms} ms</b> ${verdict} · click to go again`;
      if (!best || ms < best) { best = ms; localStorage.setItem('wk-f1-best', String(best)); showBest(); }
      audio?.tick();
    }
  }
  // pointerdown, not click: it fires as the finger goes down, which is what a reaction is.
  gantry.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); press(e.timeStamp); } });
  gantry.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press(e.timeStamp); }
  });
  gantry.addEventListener('click', (e) => e.preventDefault());

  return {
    el,
    chapter,
    /** Call when About opens: back to the top, scroll on. */
    open() {
      ensureLenis();
      el.scrollTop = 0;
      lenis?.scrollTo(0, { immediate: true, force: true });
      lenis?.start();
      lastLen = -1;
      requestAnimationFrame(buildRoute);
    },
    close() {
      lenis?.stop();
      clear();
      if (state !== 'done') { state = 'idle'; setLamps(0); msg.textContent = 'Click to start. Click again when the lights go out.'; }
    },
  };
}

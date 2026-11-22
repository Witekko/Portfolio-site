/*
 * Letter scramble on hover / keyboard focus, for functional text only
 * (menu links, buttons, Back, the section rail, the sound switch).
 * Each letter shuffles through random glyphs and settles, left to right.
 * The element keeps its width while it runs, so nothing around it jumps.
 */
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=/<>';
const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DURATION = 420;

function firstText(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  return walker.nextNode();
}

export function initScramble({ selector, onStart } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const running = new WeakSet();

  function run(el) {
    const node = firstText(el);
    if (!node || running.has(el)) return;
    running.add(el);
    // Screen readers keep hearing the real words.
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    const original = node.nodeValue;
    const chars = [...original];
    const settle = chars.map((_, i) => 90 + (i / Math.max(1, chars.length - 1)) * (DURATION - 150) + Math.random() * 60);
    const width = el.getBoundingClientRect().width;
    const prevMin = el.style.minWidth;
    el.style.minWidth = `${width}px`;
    const t0 = performance.now();
    let lastSwap = 0;

    const step = (now) => {
      const t = now - t0;
      if (t >= DURATION + 80) {
        node.nodeValue = original;
        el.style.minWidth = prevMin;
        running.delete(el);
        return;
      }
      if (now - lastSwap > 40) {   // ~25 swaps a second reads as "shuffling", not flicker
        lastSwap = now;
        node.nodeValue = chars.map((c, i) => {
          if (t >= settle[i] || c === ' ' || !/[\p{L}\p{N}]/u.test(c)) return c;
          const pool = c === c.toLowerCase() ? LOWER : UPPER;
          return pool[(Math.random() * pool.length) | 0];
        }).join('');
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    onStart?.(el);
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(selector);
    if (el && !el.contains(e.relatedTarget)) run(el);
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.(selector);
    if (el && e.target.matches(':focus-visible')) run(el);
  });
}

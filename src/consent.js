/*
 * Cookies: a small consent window for analytics (Google Tag Manager → Google Analytics).
 *
 * index.html sets Google's consent mode to "denied" before GTM loads, so nothing is stored
 * until the visitor accepts here. The choice is remembered (localStorage) and can be changed
 * with the "Cookie settings" link at the end of the page.
 */
const KEY = 'wk-consent';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

function apply(granted) {
  window.gtag?.('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  window.dataLayer?.push({ event: granted ? 'wk_consent_granted' : 'wk_consent_denied' });
}

export function initConsent() {
  const el = document.getElementById('cookies');
  if (!el) return;
  const show = () => { el.hidden = false; requestAnimationFrame(() => el.classList.add('is-in')); };
  const hide = () => { el.classList.remove('is-in'); setTimeout(() => { el.hidden = true; }, 250); };
  el.querySelector('[data-consent="yes"]').addEventListener('click', () => { set('granted'); apply(true); hide(); });
  el.querySelector('[data-consent="no"]').addEventListener('click', () => { set('denied'); apply(false); hide(); });
  document.querySelectorAll('[data-cookie-settings]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); asked = false; show(); }));
  // Phones: the window sits over the page's buttons, so the first swipe puts it away. No choice
  // made: consent stays denied and it asks again next visit (or from "Cookie settings").
  const putAway = (e) => { if (!el.hidden && innerWidth <= 860 && !el.contains(e.target) && asked) hide(); };
  let asked = false;
  addEventListener('touchmove', putAway, { passive: true });
  addEventListener('scroll', putAway, { passive: true });
  if (get()) return;   // already chose
  // Ask once the entrance is gone, so the question doesn't sit on top of it.
  const wait = setInterval(() => {
    const gate = document.getElementById('gate');
    if (!gate || gate.classList.contains('is-leaving')) { clearInterval(wait); setTimeout(() => { show(); asked = true; }, 1400); }
  }, 400);
}

/** For main.js: an event for analytics (stored only with consent; consent mode handles that). */
export const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event: `wk_${event}`, ...data }); };

initConsent();

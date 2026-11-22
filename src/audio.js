/*
 * Sound, generated in the browser (Web Audio): no files, no licences.
 *
 *  - a slow, hypnotic drone (low A-minor tones breathing through a moving filter),
 *    a bed of filtered noise ("air"), distant bells now and then, all in a long reverb;
 *  - the music follows the story: dark in the hero, a soft pulse in the projects,
 *    open and spacious inside the head (About), quiet under the signature;
 *  - sounds tied to what moves: the pen scratching (its loudness follows the pen's
 *    speed), the robot's servos (pitch follows how fast the arm moves), the gripper
 *    clicking, a whoosh for camera moves, a tiny tick on hover.
 *
 * Nothing plays until setEnabled(true) is called from a user gesture.
 */

const MASTER = 0.55;   // background, not foreground: about -18…-22 dBFS RMS
const BELLS = [440, 523.25, 587.33, 659.25, 783.99, 880, 220, 329.63];   // A minor pentatonic

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function impulse(ctx, seconds, decay) {
  const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
  }
  return b;
}

export function createAudio() {
  let ctx = null, enabled = false, n = null;
  let nextBell = 0, nextPulse = 0, state = { projects: 0, about: 0, contact: 0 };

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const meter = ctx.createAnalyser();   // for level checks (debug)
    meter.fftSize = 2048;
    comp.connect(meter);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 4.5, 2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.55;
    verb.connect(verbOut).connect(master);
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    dry.connect(master);
    /** a channel: dry + a send into the reverb */
    const bus = (wet) => {
      const g = ctx.createGain();
      g.connect(dry);
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(verb);
      return g;
    };
    const noise = noiseBuffer(ctx, 4);

    // Drone: four low tones, each breathing at its own slow rate.
    const droneF = ctx.createBiquadFilter();
    droneF.type = 'lowpass'; droneF.frequency.value = 420; droneF.Q.value = 0.8;
    const droneOut = ctx.createGain();
    droneOut.gain.value = 0.5;
    droneF.connect(droneOut).connect(bus(0.5));
    [[55, 'sine', 0.34], [82.41, 'sine', 0.2], [110, 'triangle', 0.16], [164.81, 'triangle', 0.05]].forEach(([f, type, level], i) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 10;
      const g = ctx.createGain();
      g.gain.value = level;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.045 + i * 0.021;
      const depth = ctx.createGain();
      depth.gain.value = level * 0.55;
      lfo.connect(depth).connect(g.gain);
      o.connect(g).connect(droneF);
      o.start(); lfo.start();
    });
    const fl = ctx.createOscillator();
    fl.frequency.value = 0.03;
    const flDepth = ctx.createGain();
    flDepth.gain.value = 160;
    fl.connect(flDepth).connect(droneF.frequency);
    fl.start();

    // Air: noise through a slowly wandering band-pass.
    const air = ctx.createBufferSource();
    air.buffer = noise; air.loop = true;
    const airF = ctx.createBiquadFilter();
    airF.type = 'bandpass'; airF.frequency.value = 900; airF.Q.value = 0.7;
    const airG = ctx.createGain();
    airG.gain.value = 0.02;
    air.connect(airF).connect(airG).connect(bus(0.8));
    air.start();

    // Pen scratch: noise, band-passed high, loudness driven by the pen.
    const scr = ctx.createBufferSource();
    scr.buffer = noise; scr.loop = true; scr.playbackRate.value = 1.4;
    const scrF = ctx.createBiquadFilter();
    scrF.type = 'bandpass'; scrF.frequency.value = 3600; scrF.Q.value = 1.1;
    const scrG = ctx.createGain();
    scrG.gain.value = 0;
    scr.connect(scrF).connect(scrG).connect(bus(0.25));
    scr.start();

    // Servos: a filtered sawtooth whose pitch and level follow the arm's speed.
    const srv = ctx.createOscillator();
    srv.type = 'sawtooth'; srv.frequency.value = 80;
    const srvF = ctx.createBiquadFilter();
    srvF.type = 'lowpass'; srvF.frequency.value = 650; srvF.Q.value = 5;
    const srvG = ctx.createGain();
    srvG.gain.value = 0;
    srv.connect(srvF).connect(srvG).connect(bus(0.2));
    srv.start();

    n = { meter, master, verbOut, droneF, airF, airG, scrF, scrG, srv, srvF, srvG, bus, noise, sfx: bus(0.35), bells: bus(0.9), pulse: bus(0.3) };
    nextBell = ctx.currentTime + 2;
    nextPulse = ctx.currentTime + 1;
  }

  const set = (param, value, tc = 0.4) => param.setTargetAtTime(value, ctx.currentTime, tc);

  function bell() {
    const t = ctx.currentTime;
    const f = BELLS[(Math.random() * BELLS.length) | 0];
    for (const [mult, level] of [[1, 0.05], [2.01, 0.012]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(g).connect(n.bells);
      o.start(t); o.stop(t + 3.3);
    }
  }
  function thump(t, level) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(n.pulse);
    o.start(t); o.stop(t + 0.5);
  }
  function burst({ from, to, dur, level, q = 1.2 }) {
    if (!enabled) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = n.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(n.sfx);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }

  return {
    get enabled() { return enabled; },
    /** Debug: output level right now, { rms, peak } in dBFS. */
    level() {
      if (!n) return null;
      const d = new Float32Array(n.meter.fftSize);
      n.meter.getFloatTimeDomainData(d);
      let s = 0, p = 0;
      for (const v of d) { s += v * v; p = Math.max(p, Math.abs(v)); }
      const db = (v) => Math.round(20 * Math.log10(v + 1e-9) * 10) / 10;
      return { rms: db(Math.sqrt(s / d.length)), peak: db(p) };
    },

    /** Must be first called from a user gesture (click). Fades in, or out. */
    async setEnabled(on) {
      if (on && !ctx) build();
      if (!ctx) return;
      enabled = on;
      if (on) { await ctx.resume(); set(n.master.gain, MASTER, 1.2); }
      else { set(n.master.gain, 0, 0.15); }
    },
    /** Pause audio while the tab is hidden. */
    setHidden(hidden) {
      if (!ctx) return;
      if (hidden) ctx.suspend(); else if (enabled) ctx.resume();
    },

    /**
     * Every frame. projects/about/contact/inspect: 0..1 how much of that part is on screen;
     * scratch: 0..1 pen on paper and moving; servo: 0..1 how fast the arm moves.
     */
    update({ projects = 0, about = 0, contact = 0, inspect = 0, scratch = 0, servo = 0 }) {
      if (!ctx || !enabled) return;
      state = { projects, about, contact };
      set(n.droneF.frequency, 380 + projects * 520 + about * 1100 - contact * 120 + inspect * 300, 0.8);
      set(n.verbOut.gain, 0.5 + about * 0.4, 0.8);
      set(n.airG.gain, 0.018 + about * 0.025, 0.8);
      set(n.airF.frequency, 700 + projects * 500 + about * 1500, 1.5);
      set(n.master.gain, MASTER * (1 - contact * 0.3), 1.0);
      set(n.scrG.gain, 0.16 * scratch, 0.03);
      set(n.scrF.frequency, 2800 + scratch * 1600, 0.05);
      set(n.srvG.gain, 0.045 * servo, 0.06);
      set(n.srv.frequency, 62 + servo * 95, 0.06);
      set(n.srvF.frequency, 450 + servo * 900, 0.06);

      const t = ctx.currentTime;
      if (t >= nextBell) {   // distant bells, more often inside the head
        bell();
        nextBell = t + (2.5 + Math.random() * 4) / (1 + about * 1.5);
      }
      const pulse = projects * (1 - about) * (1 - contact);
      if (t >= nextPulse - 0.05) {   // a soft heartbeat while the robot works
        if (pulse > 0.05) thump(Math.max(t, nextPulse), 0.16 * pulse);
        nextPulse = Math.max(t, nextPulse) + 0.8;
      }
    },

    /** Gripper closing or opening. */
    click() {
      if (!enabled) return;
      burst({ from: 2400, to: 1800, dur: 0.06, level: 0.12, q: 6 });
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 180;
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(n.sfx); o.start(t); o.stop(t + 0.06);
    },
    /** Camera moves: in (up) or back out (down). */
    whoosh(up = true) { burst(up ? { from: 300, to: 2600, dur: 1.1, level: 0.09 } : { from: 2200, to: 260, dur: 0.9, level: 0.07 }); },
    /** The smallest possible hover tick. */
    tick() {
      if (!enabled) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 2400 + Math.random() * 400;
      g.gain.setValueAtTime(0.018, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(n.sfx); o.start(t); o.stop(t + 0.04);
    },
  };
}

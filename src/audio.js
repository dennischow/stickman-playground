import { readStorage, writeStorage } from './storage.js';

const STORAGE_KEY = 'stickman.muted';
const MASTER_GAIN = 0.55;

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = readStorage(STORAGE_KEY) === '1';

    if (typeof window !== 'undefined') {
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      });
    }
  }

  unlock() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : MASTER_GAIN;
    master.connect(comp);
    comp.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.noiseBuf = buf;
    return ctx;
  }

  setMuted(muted) {
    this.muted = !!muted;
    writeStorage(STORAGE_KEY, this.muted ? '1' : '0');
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_GAIN, t, 0.02);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _ready() {
    if (this.muted) return null;
    return this.ensure();
  }

  _out(pan) {
    const ctx = this._ready();
    if (!ctx) return null;
    const out = ctx.createGain();
    out.gain.value = 1;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      out.connect(p);
      p.connect(this.master);
      out._panner = p;
    } else {
      out.connect(this.master);
    }
    return out;
  }

  _release(out, nodes) {
    if (!out) return;
    out.disconnect();
    if (out._panner) out._panner.disconnect();
    for (const n of nodes) {
      try { n.disconnect(); } catch (err) {}
    }
  }

  _noise({ dur = 0.2, gain = 0.1, pan = 0, type = 'bandpass', freq = 800, freqEnd = null, q = 0.8, attack = 0.005, delay = 0 }) {
    const ctx = this._ready();
    if (!ctx) return;
    const out = this._out(pan);
    if (!out) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, freq), t);
    if (freqEnd != null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + dur + 0.03);
    src.onended = () => this._release(out, [src, filter, g]);
  }

  _tone({ type = 'sine', freq = 200, freqEnd = null, dur = 0.15, gain = 0.2, pan = 0, attack = 0.004, delay = 0 }) {
    const ctx = this._ready();
    if (!ctx) return;
    const out = this._out(pan);
    if (!out) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = () => this._release(out, [osc, g]);
  }

  whoosh(pan = 0, strength = 1, up = false) {
    this._noise({
      dur: 0.16 + 0.08 * strength,
      gain: 0.055 * strength,
      pan,
      type: 'bandpass',
      freq: up ? 460 : 1000,
      freqEnd: up ? 1700 : 320,
      q: 1.1
    });
  }

  hit(kind = 'punch', strength = 1, pan = 0) {
    if (kind === 'block') {
      this.block(pan, strength);
      return;
    }
    const heavy = kind === 'heavy';
    const kick = kind === 'kick';
    const base = heavy ? 96 : kick ? 132 : 176;
    const end = heavy ? 32 : kick ? 48 : 60;
    const dur = heavy ? 0.26 : kick ? 0.17 : 0.12;
    this._tone({ type: 'sine', freq: base, freqEnd: end, dur, gain: 0.28 * strength, pan });
    this._tone({ type: 'triangle', freq: base * 2.1, freqEnd: end * 1.6, dur: dur * 0.6, gain: 0.09 * strength, pan });
    this._noise({ dur: 0.05, gain: 0.16 * strength, pan, type: 'highpass', freq: 1500, freqEnd: 720, q: 0.7 });
    if (heavy) {
      this._noise({ dur: 0.22, gain: 0.12 * strength, pan, type: 'lowpass', freq: 620, freqEnd: 160, q: 0.8 });
    }
  }

  block(pan = 0, strength = 1) {
    this._tone({ type: 'square', freq: 980, dur: 0.09, gain: 0.075 * strength, pan });
    this._tone({ type: 'square', freq: 1470, dur: 0.07, gain: 0.045 * strength, pan });
    this._noise({ dur: 0.06, gain: 0.12 * strength, pan, type: 'highpass', freq: 2200, q: 1.2 });
  }

  step(pan = 0, run = false) {
    this._noise({
      dur: 0.05,
      gain: run ? 0.055 : 0.03,
      pan,
      type: 'lowpass',
      freq: run ? 720 : 520,
      freqEnd: 170,
      q: 0.9
    });
  }

  land(pan = 0, heavy = false) {
    this._tone({ type: 'sine', freq: 152, freqEnd: 44, dur: heavy ? 0.24 : 0.15, gain: heavy ? 0.3 : 0.18, pan });
    this._noise({ dur: 0.13, gain: heavy ? 0.14 : 0.08, pan, type: 'lowpass', freq: 760, freqEnd: 180, q: 0.8 });
  }

  jump(pan = 0) {
    this._noise({ dur: 0.18, gain: 0.06, pan, type: 'bandpass', freq: 420, freqEnd: 1500, q: 1.2 });
  }

  leap(pan = 0, power = 1) {
    this._noise({ dur: 0.2, gain: 0.07 * power, pan, type: 'bandpass', freq: 400, freqEnd: 1600, q: 1.2 });
  }

  supermanLaunch(pan = 0) {
    this._noise({ dur: 0.32, gain: 0.09, pan, type: 'bandpass', freq: 320, freqEnd: 2400, q: 1.3 });
    this._tone({ type: 'sawtooth', freq: 120, freqEnd: 520, dur: 0.3, gain: 0.04, pan });
    this._noise({ dur: 0.14, gain: 0.07, pan, type: 'lowpass', freq: 300, freqEnd: 110, q: 0.9 });
  }

  supermanHit(pan = 0) {
    this._tone({ type: 'sine', freq: 150, freqEnd: 26, dur: 0.5, gain: 0.4, pan });
    this._tone({ type: 'triangle', freq: 300, freqEnd: 52, dur: 0.3, gain: 0.12, pan });
    this._noise({ dur: 0.08, gain: 0.22, pan, type: 'highpass', freq: 2200, freqEnd: 900, q: 0.7 });
    this._noise({ dur: 0.36, gain: 0.18, pan, type: 'lowpass', freq: 900, freqEnd: 120, q: 0.8 });
    this._tone({ type: 'sine', freq: 70, freqEnd: 44, dur: 0.2, gain: 0.2, pan, delay: 0.05 });
  }

  blast(pan = 0) {
    this._tone({ type: 'sine', freq: 180, freqEnd: 34, dur: 0.55, gain: 0.34, pan });
    this._tone({ type: 'sawtooth', freq: 90, freqEnd: 470, dur: 0.28, gain: 0.055, pan });
    this._noise({ dur: 0.45, gain: 0.18, pan, type: 'lowpass', freq: 2200, freqEnd: 180, q: 0.7 });
    this._noise({ dur: 0.2, gain: 0.1, pan, type: 'bandpass', freq: 900, freqEnd: 2400, q: 1.4, delay: 0.02 });
  }

  wallHit(pan = 0) {
    this._tone({ type: 'sine', freq: 112, freqEnd: 32, dur: 0.4, gain: 0.32, pan });
    this._noise({ dur: 0.28, gain: 0.2, pan, type: 'lowpass', freq: 1200, freqEnd: 120, q: 0.8 });
    this._noise({ dur: 0.08, gain: 0.11, pan, type: 'highpass', freq: 1900, q: 0.9 });
  }

  ko(pan = 0) {
    this._tone({ type: 'sine', freq: 330, freqEnd: 82, dur: 0.9, gain: 0.2, pan });
    this._tone({ type: 'triangle', freq: 660, freqEnd: 165, dur: 0.7, gain: 0.07, pan });
    this._noise({ dur: 0.55, gain: 0.1, pan, type: 'lowpass', freq: 900, freqEnd: 110, q: 0.7 });
  }

  charge(pan = 0) {
    this._tone({ type: 'sawtooth', freq: 104, freqEnd: 640, dur: 0.5, gain: 0.05, pan });
    this._tone({ type: 'sine', freq: 208, freqEnd: 1280, dur: 0.5, gain: 0.035, pan });
    this._noise({ dur: 0.5, gain: 0.05, pan, type: 'bandpass', freq: 320, freqEnd: 1700, q: 1.6 });
  }

  duel(pan = 0) {
    this._tone({ type: 'sine', freq: 96, freqEnd: 58, dur: 0.28, gain: 0.24, pan });
    this._tone({ type: 'sine', freq: 132, freqEnd: 66, dur: 0.3, gain: 0.18, pan, delay: 0.12 });
    this._noise({ dur: 0.32, gain: 0.07, pan, type: 'bandpass', freq: 700, freqEnd: 240, q: 1.1 });
  }
}

export const audio = new SoundEngine();

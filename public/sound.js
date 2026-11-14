// Procedural WebAudio sound: every effect is synthesised from oscillators and a
// shared noise buffer, so the game ships no audio files.
const HEAR_RANGE = 1900;

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('flagrun.sound') !== 'off';
    this.listener = { x: 0, y: 0, yaw: 0 };
  }

  // Browsers only allow audio to start from a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? .55 : 0;
    this.master.connect(comp);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.buildEngine();
  }

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('flagrun.sound', on ? 'on' : 'off');
    if (this.master) this.master.gain.setTargetAtTime(on ? .55 : 0, this.ctx.currentTime, .05);
  }

  setListener(x, y, yaw) { this.listener = { x, y, yaw }; }

  // Distance falloff plus stereo pan relative to the rotated camera.
  output(x, y, volume = 1) {
    const ctx = this.ctx;
    let level = volume, pan = 0;
    if (x !== undefined) {
      const dx = x - this.listener.x, dy = y - this.listener.y, d = Math.hypot(dx, dy);
      if (d > HEAR_RANGE) return null;
      level *= 1 / (1 + (d / 430) ** 2);
      const yaw = this.listener.yaw;
      pan = Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / 650));
    }
    if (level < .004) return null;
    const g = ctx.createGain(); g.gain.value = level;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  ready() { return this.ctx && this.enabled && this.ctx.state === 'running'; }

  noiseBurst({ x, y, volume = 1, dur = .3, freq = 1000, to, type = 'lowpass', q = .8, attack = .004, delay = 0 }) {
    if (!this.ready()) return;
    const out = this.output(x, y, volume); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = .8 + Math.random() * .4;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(filter); filter.connect(env); env.connect(out);
    src.start(t, Math.random() * 1.5, dur + .05);
  }

  tone({ x, y, volume = .3, freq = 440, to, dur = .2, type = 'sine', attack = .005, delay = 0 }) {
    if (!this.ready()) return;
    const out = this.output(x, y, volume); if (!out) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(.001, t + dur);
    osc.connect(env); env.connect(out);
    osc.start(t); osc.stop(t + dur + .05);
  }

  shot(kind, x, y) {
    switch (kind) {
      case 'tank':
        this.noiseBurst({ x, y, volume: 1.1, dur: .45, freq: 1400, to: 160 });
        this.tone({ x, y, volume: .7, freq: 120, to: 38, dur: .35 });
        break;
      case 'heli':
        this.noiseBurst({ x, y, volume: .35, dur: .07, freq: 2600, type: 'bandpass', q: 1.2 });
        break;
      case 'asv':
        this.noiseBurst({ x, y, volume: .7, dur: .75, freq: 500, to: 2200, type: 'bandpass', q: 1.5, attack: .03 });
        break;
      case 'grenade':
        this.noiseBurst({ x, y, volume: .3, dur: .22, freq: 700, to: 1500, type: 'bandpass', q: 2, attack: .03 });
        this.tone({ x, y, volume: .15, freq: 260, to: 180, dur: .12, type: 'triangle' });
        break;
      default:
        this.noiseBurst({ x, y, volume: .45, dur: .14, freq: 1800, to: 500 });
    }
  }

  explosion(scale, x, y) {
    const s = Math.max(.4, Math.min(2.6, scale || 1));
    this.noiseBurst({ x, y, volume: .9 + s * .35, dur: .7 + s * .45, freq: 900 + s * 300, to: 90, attack: .006 });
    this.tone({ x, y, volume: .5 + s * .2, freq: 85, to: 28, dur: .5 + s * .3 });
  }

  splash(x, y) {
    this.noiseBurst({ x, y, volume: 1, dur: .9, freq: 2400, to: 300, type: 'bandpass', q: .6, attack: .02 });
    this.noiseBurst({ x, y, volume: .6, dur: 1.6, freq: 700, to: 120, delay: .12 });
    for (let i = 0; i < 4; i++) this.tone({ x, y, volume: .08, freq: 300 + Math.random() * 500, to: 120, dur: .18, delay: .3 + i * .17 });
  }

  artillery(fromX, fromY, toX, toY, flightMs) {
    this.noiseBurst({ x: fromX, y: fromY, volume: 1.2, dur: .8, freq: 800, to: 70 });
    this.tone({ x: fromX, y: fromY, volume: .7, freq: 70, to: 30, dur: .6 });
    const whistle = Math.min(1.1, flightMs / 1000 - .05);
    this.tone({ x: toX, y: toY, volume: .22, freq: 1700, to: 420, dur: whistle, delay: Math.max(0, flightMs / 1000 - whistle), attack: .2 });
  }

  deploy() {
    for (let i = 0; i < 3; i++) this.tone({ volume: .14, freq: 140 - i * 20, to: 70, dur: .09, type: 'square', delay: i * .22 });
  }

  pickup() {
    this.tone({ volume: .2, freq: 660, dur: .12, type: 'triangle' });
    this.tone({ volume: .2, freq: 990, dur: .2, type: 'triangle', delay: .11 });
  }

  capture(ours) {
    const notes = ours ? [523, 659, 784, 1047] : [440, 392, 330, 262];
    notes.forEach((f, i) => this.tone({ volume: .22, freq: f, dur: .26, type: 'triangle', delay: i * .14 }));
  }

  warning() { this.tone({ volume: .2, freq: 880, dur: .12, type: 'square' }); }
  click() { this.tone({ volume: .1, freq: 1200, to: 900, dur: .05, type: 'triangle' }); }

  buildEngine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    const filter = this.engineFilter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 300;
    this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 45;
    this.engineSub = ctx.createOscillator(); this.engineSub.type = 'square'; this.engineSub.frequency.value = 22.5;
    const subGain = ctx.createGain(); subGain.gain.value = .35;
    this.engineOsc.connect(filter); this.engineSub.connect(subGain); subGain.connect(filter);
    filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineSub.start();

    // Rotor wash: looping noise chopped by a low-frequency amplitude wobble.
    const rotor = ctx.createBufferSource(); rotor.buffer = this.noise; rotor.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 420;
    this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = 0;
    const chop = ctx.createGain(); chop.gain.value = .5;
    this.rotorLfo = ctx.createOscillator(); this.rotorLfo.frequency.value = 11;
    const depth = ctx.createGain(); depth.gain.value = .5;
    this.rotorLfo.connect(depth); depth.connect(chop.gain);
    rotor.connect(rf); rf.connect(chop); chop.connect(this.rotorGain); this.rotorGain.connect(this.master);
    rotor.start(); this.rotorLfo.start();
  }

  // Continuous sound of the player's own vehicle, driven every frame.
  engine({ type, speed = 0, top = 200, alive, swimming, drone }) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime, k = Math.min(1, speed / Math.max(60, top));
    const ground = alive && type !== 'heli';
    const base = { tank: 34, asv: 30, arty: 32, fpv: 48, jeep: 58 }[type] || 45;
    let freq = base * (1 + k * 1.3), cutoff = 220 + k * 900, level = ground ? .07 + k * .1 : 0;
    if (swimming) { freq *= .8; cutoff *= .55; level *= 1.2; }
    if (drone) { freq = 160 + k * 120; cutoff = 2400; level = .05; }
    this.engineOsc.frequency.setTargetAtTime(freq, t, .12);
    this.engineSub.frequency.setTargetAtTime(freq / 2, t, .12);
    this.engineFilter.frequency.setTargetAtTime(cutoff, t, .12);
    this.engineGain.gain.setTargetAtTime(drone ? .05 : level, t, .15);
    const heli = alive && type === 'heli';
    this.rotorGain.gain.setTargetAtTime(heli ? .22 + k * .1 : 0, t, .2);
    this.rotorLfo.frequency.setTargetAtTime(10 + k * 4, t, .2);
  }
}

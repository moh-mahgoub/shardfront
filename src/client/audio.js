// Synthesised sound effects (WebAudio only, no samples). The context is created
// on the first user gesture, as iOS Safari requires.
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.volume = 0.6; this.last = {}; this.noise = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5 | 0;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    } catch (e) { this.ctx = null; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  tone(type, f0, f1, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, vol, freq) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = this.noise; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(80, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.02);
  }

  // `gain` 0..1 lets callers attenuate off-screen sounds.
  play(name, gain) {
    if (!this.ctx || this.volume <= 0 || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, gap = name === 'shot' || name === 'melee' || name === 'hit' ? 0.045 : 0.08;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const v = gain === undefined ? 1 : gain;
    if (v <= 0.02) return;
    switch (name) {
      case 'select': this.tone('sine', 660, 880, 0.07, 0.18 * v); break;
      case 'order': this.tone('triangle', 420, 560, 0.08, 0.2 * v); break;
      case 'attackOrder': this.tone('sawtooth', 300, 200, 0.1, 0.12 * v); break;
      case 'click': this.tone('square', 900, 700, 0.03, 0.06 * v); break;
      case 'error': this.tone('square', 160, 120, 0.16, 0.12 * v); break;
      case 'shot': this.tone('square', 900, 240, 0.07, 0.05 * v); break;
      case 'melee': this.burst(0.05, 0.12 * v, 2400); break;
      case 'hit': this.burst(0.06, 0.07 * v, 1400); break;
      case 'boom': this.burst(0.35, 0.4 * v, 900); this.tone('sine', 120, 40, 0.3, 0.3 * v); break;
      case 'bigboom': this.burst(0.7, 0.55 * v, 700); this.tone('sine', 90, 30, 0.6, 0.4 * v); break;
      case 'place': this.tone('triangle', 200, 300, 0.12, 0.2 * v); break;
      case 'built': this.tone('sine', 520, 520, 0.1, 0.2 * v); this.tone('sine', 780, 780, 0.16, 0.2 * v, 0.1); break;
      case 'trained': this.tone('sine', 700, 940, 0.09, 0.12 * v); break;
      case 'alert': this.tone('sawtooth', 520, 520, 0.12, 0.16 * v); this.tone('sawtooth', 390, 390, 0.18, 0.16 * v, 0.14); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.22, i * 0.14)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.22, i * 0.18)); break;
    }
  }
}

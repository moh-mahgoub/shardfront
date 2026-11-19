// Small deterministic PRNG (mulberry32). The simulation must never use Math.random.
export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return (this.next() * n) | 0; }
  range(a, b) { return a + this.next() * (b - a); }
}

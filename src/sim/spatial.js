// Uniform spatial hash for neighbour queries. Buckets are reused every tick.
export class SpatialHash {
  constructor(cell, worldW, worldH) {
    this.cell = cell;
    this.cols = Math.ceil(worldW / cell);
    this.rows = Math.ceil(worldH / cell);
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
    this.out = [];
  }
  clear() { const b = this.buckets; for (let i = 0; i < b.length; i++) b[i].length = 0; }
  insert(e) {
    let cx = (e.x / this.cell) | 0, cy = (e.y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    this.buckets[cy * this.cols + cx].push(e);
  }
  // Fills the shared `out` array with every entity whose bucket overlaps the
  // circle; callers do the exact distance test. Returns the shared array.
  query(x, y, r) {
    const out = this.out; out.length = 0;
    const c = this.cell;
    let x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= this.cols) x1 = this.cols - 1; if (y1 >= this.rows) y1 = this.rows - 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.buckets[cy * this.cols + cx];
      for (let i = 0; i < b.length; i++) out.push(b[i]);
    }
    return out;
  }
}

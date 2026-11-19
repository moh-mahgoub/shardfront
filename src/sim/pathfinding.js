// Navigation grid + A* (8-directional, no corner cutting) with typed-array state,
// connected-component labelling (so unreachable goals never flood the whole map)
// and line-of-sight path smoothing.
import { TILE } from '../data.js';

const SQRT2 = 1.41421356;

export class NavGrid {
  constructor(w, h, terrain) {
    this.w = w; this.h = h;
    const n = w * h;
    this.blocked = new Uint8Array(n);     // 0 free, 1 terrain, 2 structure/resource
    for (let i = 0; i < n; i++) this.blocked[i] = terrain[i] ? 1 : 0;
    this.version = 1;
    this.comp = new Int32Array(n);
    this.compVersion = 0;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.openStamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new Int32Array(n * 4);
    this.heapN = 0;
    this.stack = new Int32Array(n);
    this.tmp = [];
    this.queries = 0;                      // debug counter
  }

  isBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.blocked[ty * this.w + tx] !== 0;
  }
  blockedAtPx(x, y) { return this.isBlocked((x / TILE) | 0, (y / TILE) | 0) || x < 0 || y < 0; }

  setRect(tx, ty, w, h, v) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.blocked[y * this.w + x] = v;
    this.version++;
  }
  rectFree(tx, ty, w, h) {
    if (tx < 0 || ty < 0 || tx + w > this.w || ty + h > this.h) return false;
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (this.blocked[y * this.w + x]) return false;
    return true;
  }

  components() {
    if (this.compVersion === this.version) return this.comp;
    const { w, h, comp, blocked, stack } = this;
    comp.fill(-1);
    let label = 0;
    for (let s = 0; s < w * h; s++) {
      if (blocked[s] || comp[s] >= 0) continue;
      let n = 0; stack[n++] = s; comp[s] = label;
      while (n) {
        const i = stack[--n], x = i % w;
        if (x > 0 && !blocked[i - 1] && comp[i - 1] < 0) { comp[i - 1] = label; stack[n++] = i - 1; }
        if (x < w - 1 && !blocked[i + 1] && comp[i + 1] < 0) { comp[i + 1] = label; stack[n++] = i + 1; }
        if (i >= w && !blocked[i - w] && comp[i - w] < 0) { comp[i - w] = label; stack[n++] = i - w; }
        if (i < w * (h - 1) && !blocked[i + w] && comp[i + w] < 0) { comp[i + w] = label; stack[n++] = i + w; }
      }
      label++;
    }
    this.compVersion = this.version;
    return comp;
  }

  // Nearest free tile on the growing perimeter around a rectangle. `comp` (>=0)
  // restricts to one connected component. (px,py) in tile units is the tie-break
  // preference point. Returns a tile index or -1.
  nearestFree(tx, ty, fw, fh, px, py, comp, startR) {
    const { w, h, blocked } = this;
    const comps = comp >= 0 ? this.components() : null;
    for (let r = startR; r <= 24; r++) {
      let best = -1, bd = 1e9;
      const x0 = tx - r, y0 = ty - r, x1 = tx + fw - 1 + r, y1 = ty + fh - 1 + r;
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= h) continue;
        const edgeRow = (y === y0 || y === y1);
        const step = (edgeRow || r === 0) ? 1 : (x1 - x0) || 1;
        for (let x = x0; x <= x1; x += step) {
          if (x < 0 || x >= w) continue;
          const i = y * w + x;
          if (blocked[i]) continue;
          if (comps && comps[i] !== comp) continue;
          const d = (x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // Fat line-of-sight test in pixels (keeps roughly a unit radius of clearance).
  los(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return true;
    const n = Math.ceil(d / 8);
    const ox = -dy / d * 8, oy = dx / d * 8;
    const w = this.w, h = this.h, b = this.blocked;
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * i / n, y = y0 + dy * i / n;
      let tx = (x / TILE) | 0, ty = (y / TILE) | 0;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || b[ty * w + tx]) return false;
      tx = ((x + ox) / TILE) | 0; ty = ((y + oy) / TILE) | 0;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || b[ty * w + tx]) return false;
      tx = ((x - ox) / TILE) | 0; ty = ((y - oy) / TILE) | 0;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || b[ty * w + tx]) return false;
    }
    return true;
  }

  heapPush(i) {
    const { heap, f } = this;
    let n = this.heapN++;
    heap[n] = i;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (f[heap[p]] <= f[heap[n]]) break;
      const t = heap[p]; heap[p] = heap[n]; heap[n] = t; n = p;
    }
  }
  heapPop() {
    const { heap, f } = this;
    const top = heap[0];
    const last = heap[--this.heapN];
    let n = 0; const N = this.heapN;
    heap[0] = last;
    for (;;) {
      let l = n * 2 + 1, r = l + 1, m = n;
      if (l < N && f[heap[l]] < f[heap[m]]) m = l;
      if (r < N && f[heap[r]] < f[heap[m]]) m = r;
      if (m === n) break;
      const t = heap[m]; heap[m] = heap[n]; heap[n] = t; n = m;
    }
    return top;
  }

  // Path from pixel (sx,sy) to pixel (gx,gy). If `foot` ({tx,ty,w,h}) is given the
  // goal is "any free tile touching that footprint" (used for buildings/resources).
  // Returns a flat array of pixel waypoints [x0,y0,x1,y1,...] or null.
  findPath(sx, sy, gx, gy, foot) {
    this.queries++;
    const { w, h, blocked } = this;
    let stx = Math.min(w - 1, Math.max(0, (sx / TILE) | 0)), sty = Math.min(h - 1, Math.max(0, (sy / TILE) | 0));
    let si = sty * w + stx;
    if (blocked[si]) {
      si = this.nearestFree(stx, sty, 1, 1, sx / TILE, sy / TILE, -1, 1);
      if (si < 0) return null;
      stx = si % w; sty = (si / w) | 0;
    }
    const comps = this.components();
    const comp = comps[si];
    let gi, fx = gx, fy = gy;
    if (foot) {
      gi = this.nearestFree(foot.tx, foot.ty, foot.w, foot.h, sx / TILE, sy / TILE, comp, 1);
      if (gi < 0) return null;
      fx = (gi % w + 0.5) * TILE; fy = (((gi / w) | 0) + 0.5) * TILE;
    } else {
      const gtx = Math.min(w - 1, Math.max(0, (gx / TILE) | 0)), gty = Math.min(h - 1, Math.max(0, (gy / TILE) | 0));
      gi = gty * w + gtx;
      if (blocked[gi] || comps[gi] !== comp) {
        gi = this.nearestFree(gtx, gty, 1, 1, gx / TILE, gy / TILE, comp, 1);
        if (gi < 0) return null;
        fx = (gi % w + 0.5) * TILE; fy = (((gi / w) | 0) + 0.5) * TILE;
      } else {
        fx = Math.min(w * TILE - 1, Math.max(1, gx)); fy = Math.min(h * TILE - 1, Math.max(1, gy));
      }
    }
    if (gi === si || this.los(sx, sy, fx, fy)) return [fx, fy];

    // ---- A* ----
    const stamp = ++this.stamp;
    const { g, f, parent, openStamp, closedStamp } = this;
    const gtx = gi % w, gty = (gi / w) | 0;
    this.heapN = 0;
    g[si] = 0; f[si] = 0; parent[si] = -1; openStamp[si] = stamp;
    this.heapPush(si);
    let found = false;
    while (this.heapN > 0) {
      const cur = this.heapPop();
      if (closedStamp[cur] === stamp) continue;
      closedStamp[cur] = stamp;
      if (cur === gi) { found = true; break; }
      const cx = cur % w, cy = (cur / w) | 0, cg = g[cur];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (blocked[ni] || closedStamp[ni] === stamp) continue;
          let cost = 1;
          if (dx && dy) {
            if (blocked[cy * w + nx] || blocked[ny * w + cx]) continue;
            cost = SQRT2;
          }
          const ng = cg + cost;
          if (openStamp[ni] === stamp && ng >= g[ni]) continue;
          openStamp[ni] = stamp;
          g[ni] = ng; parent[ni] = cur;
          const hx = nx > gtx ? nx - gtx : gtx - nx, hy = ny > gty ? ny - gty : gty - ny;
          f[ni] = ng + (hx > hy ? hx + 0.4142 * hy : hy + 0.4142 * hx) * 1.001;
          this.heapPush(ni);
        }
      }
    }
    if (!found) return null;

    // ---- reconstruct + smooth ----
    const pts = this.tmp; pts.length = 0;
    for (let i = gi; i !== -1 && i !== si; i = parent[i]) pts.push(i);
    pts.reverse();
    const out = [];
    let ax = sx, ay = sy, cur = 0;
    const n = pts.length;
    while (cur < n) {
      let j = cur;
      const lim = Math.min(n - 1, cur + 18);
      while (j < lim) {
        const k = pts[j + 1];
        if (!this.los(ax, ay, (k % w + 0.5) * TILE, (((k / w) | 0) + 0.5) * TILE)) break;
        j++;
      }
      const k = pts[j];
      ax = (k % w + 0.5) * TILE; ay = (((k / w) | 0) + 0.5) * TILE;
      out.push(ax, ay);
      cur = j + 1;
    }
    out[out.length - 2] = fx; out[out.length - 1] = fy;
    return out;
  }
}

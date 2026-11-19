// Seeded, point-symmetric map generation (rotate 180 degrees around the centre).
import { MAP_W, MAP_H } from '../data.js';
import { RNG } from './rng.js';

export const T_GROUND = 0;
export const T_ROCK = 1;
export const T_WATER = 2;

function mapReachable(terrain, W, H, fromX, fromY, points) {
  const seen = new Uint8Array(W * H);
  const stack = [fromY * W + fromX];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && !seen[i - 1] && !terrain[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
    if (x < W - 1 && !seen[i + 1] && !terrain[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !seen[i - W] && !terrain[i - W]) { seen[i - W] = 1; stack.push(i - W); }
    if (y < H - 1 && !seen[i + W] && !terrain[i + W]) { seen[i + W] = 1; stack.push(i + W); }
  }
  for (const p of points) if (!seen[p[1] * W + p[0]]) return false;
  return true;
}

export function generateMap(seed) {
  const W = MAP_W, H = MAP_H;
  const rng = new RNG(seed ^ 0x51ab3d);
  const base = new Uint8Array(W * H);
  const put = (t, x, y, v) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    t[y * W + x] = v;
    t[(H - 1 - y) * W + (W - 1 - x)] = v;
  };

  // 1. Cliff ring around each main base with one ramp-like gap (the main choke).
  const rcx = 4, rcy = 91;
  for (let y = 60; y < H; y++) for (let x = 0; x < 34; x++) {
    const d = Math.hypot(x - rcx, y - rcy);
    if (d >= 22 && d < 24.6) {
      const ang = Math.atan2(rcy - y, x - rcx) * 180 / Math.PI;
      if (ang < 33 || ang > 57) put(base, x, y, T_ROCK);
    }
  }
  // 2. Central ridge along the map's mirror line with four gaps (chokes), and a lake.
  for (let t = 0; t < W; t++) {
    if (Math.abs(t - 24) <= 4 || Math.abs(t - 71) <= 4) continue;
    if ((t >= 37 && t <= 40) || (t >= 55 && t <= 58)) continue;
    put(base, t, t, T_ROCK); put(base, t + 1, t, T_ROCK); put(base, t, t + 1, T_ROCK);
  }
  for (let y = 38; y < 58; y++) for (let x = 38; x < 58; x++) {
    if ((x - 47.5) ** 2 + (y - 47.5) ** 2 < 6.2 * 6.2) put(base, x, y, T_WATER);
  }
  // 3. Wall sheltering the natural expansion.
  for (let y = 85; y < H; y++) { put(base, 50, y, T_ROCK); put(base, 51, y, T_ROCK); }

  // Base sites for player 0 (top-left tile of a 4x4 main); player 1 gets the mirror.
  const sites0 = [{ tx: 10, ty: 80 }, { tx: 34, ty: 84 }, { tx: 7, ty: 50 }];
  const sites1 = sites0.map(s => ({ tx: W - s.tx - 4, ty: H - s.ty - 4 }));

  // 4. Random rock outcrops and ponds, kept away from bases and chokes.
  const keep = [[rcx, rcy, 28], [36, 86, 11], [9, 52, 11], [24, 24, 9], [71, 71, 9],
                [38.5, 38.5, 6], [56.5, 56.5, 6], [47.5, 47.5, 10], [30, 66, 7]];
  const isKept = (x, y) => {
    for (const k of keep) {
      if (Math.hypot(x - k[0], y - k[1]) < k[2]) return true;
      if (Math.hypot(W - 1 - x - k[0], H - 1 - y - k[1]) < k[2]) return true;
    }
    return false;
  };
  const checks = [];
  for (const s of sites0.concat(sites1)) checks.push([s.tx + 2, s.ty - 2]);
  let terrain = base;
  for (let attempt = 0; attempt < 12; attempt++) {
    const t = base.slice();
    for (let i = 0; i < 26; i++) {
      const bx = rng.int(W), by = rng.int(H), r = 1.2 + rng.next() * 2.3;
      const type = rng.next() < 0.25 ? T_WATER : T_ROCK;
      if (isKept(bx, by)) continue;
      for (let y = Math.floor(by - r - 1); y <= by + r + 1; y++) for (let x = Math.floor(bx - r - 1); x <= bx + r + 1; x++) {
        if (isKept(x, y)) continue;
        if (Math.hypot(x - bx, y - by) < r + rng.next() * 0.8 - 0.4) put(t, x, y, type);
      }
    }
    if (mapReachable(t, W, H, checks[0][0], checks[0][1], checks)) { terrain = t; break; }
  }

  // 5. Resource patches in an arc behind each base site.
  const resources = [];
  const used = new Set();
  const arc = (site, r, a0, a1, n) => {
    const cx = site.tx + 2, cy = site.ty + 2;
    for (let i = 0; i < n; i++) {
      const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180;
      const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * r);
      for (const [px, py] of [[x, y], [W - 1 - x, H - 1 - y]]) {
        const k = py * W + px;
        if (used.has(k)) continue;
        used.add(k);
        terrain[k] = T_GROUND;
        resources.push({ tx: px, ty: py });
      }
    }
  };
  arc(sites0[0], 6.5, 100, 200, 8);
  arc(sites0[1], 6.2, 35, 145, 6);
  arc(sites0[2], 6.2, 125, 235, 6);
  // make sure the building sites themselves are clear
  for (const s of sites0) for (let y = -1; y < 5; y++) for (let x = -1; x < 5; x++) put(terrain, s.tx + x, s.ty + y, T_GROUND);
  resources.sort((a, b) => (a.ty * W + a.tx) - (b.ty * W + b.tx));

  const shade = new Uint8Array(W * H);
  for (let i = 0; i < shade.length; i++) shade[i] = rng.int(256);

  return { w: W, h: H, seed, terrain, shade, resources, bases: [sites0, sites1] };
}

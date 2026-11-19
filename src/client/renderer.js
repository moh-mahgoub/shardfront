// Canvas 2D renderer. Reads simulation state, never writes it (it only caches a
// few underscore-prefixed presentation fields on entities, e.g. smoothed facing).
import { DEFS, TILE, MAP_W, MAP_H } from '../data.js';
import { T_ROCK, T_WATER } from '../sim/map.js';
import { app } from './app.js';
import { TEAM_COLORS } from './sprites.js';

const TP = 24;                                   // terrain cache resolution, px per tile
const WORLD = MAP_W * TILE;
let canvas, ctx, terrainCv, fogCv, fogCtx, fogImg, fogAlpha, miniTerrain;
let frameNo = 0;

// ------------------------------------------------------------------ effects
const particles = [], rings = [], pool = [];
export const fx = {
  particle(x, y, vx, vy, life, size, color) {
    if (particles.length > 500) return;
    const p = pool.pop() || {};
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    particles.push(p);
  },
  // space: 'world' or 'screen'
  ring(x, y, r0, r1, life, color, space, lw) { rings.push({ x, y, r0, r1, life, max: life, color, screen: space === 'screen', lw: lw || 2 }); },
  explosion(x, y, size, color) {
    const n = Math.min(26, 6 + size * 0.5 | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, s = (0.4 + Math.random()) * (30 + size * 2.2);
      fx.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.4, 2 + Math.random() * (2 + size * 0.08), i % 3 ? color : '#fff3c4');
    }
    fx.ring(x, y, size * 0.4, size * 1.9, 0.35, '#ffe9a8', 'world', 3);
  },
  marker(x, y, color) { fx.ring(x, y, 22, 5, 0.45, color, 'world', 3); fx.ring(x, y, 7, 7, 0.45, color, 'world', 2); },
  ripple(sx, sy) { fx.ring(sx, sy, 6, 30, 0.3, 'rgba(255,255,255,0.9)', 'screen', 2); },
  pings: [],                                     // minimap alerts { x, y, life }
  clear() { particles.length = 0; rings.length = 0; fx.pings.length = 0; },
};

// ------------------------------------------------------------------ set-up
export function initRenderer(cv) {
  canvas = cv;
  ctx = canvas.getContext('2d', { alpha: false });
  fogCv = document.createElement('canvas'); fogCv.width = MAP_W; fogCv.height = MAP_H;
  fogCtx = fogCv.getContext('2d');
  fogImg = fogCtx.createImageData(MAP_W, MAP_H);
  fogAlpha = new Float32Array(MAP_W * MAP_H);
  resizeRenderer();
}

export function resizeRenderer() {
  const dpr = Math.min(app.view.maxDpr || 2.5, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  app.view.w = w; app.view.h = h; app.view.dpr = dpr;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}

export function getFogCanvas() { return fogCv; }
export function getMiniTerrain() { return miniTerrain; }

// Pre-render the whole terrain once per match.
export function buildTerrain(map) {
  const W = map.w, H = map.h, t = map.terrain, sh = map.shade;
  terrainCv = document.createElement('canvas');
  terrainCv.width = W * TP; terrainCv.height = H * TP;
  const c = terrainCv.getContext('2d');
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T_ROCK : t[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = sh[y * W + x];
    const k = (s & 31) - 16 + Math.sin(x * 0.22) * 6 + Math.cos(y * 0.19 + x * 0.07) * 6;
    c.fillStyle = `rgb(${46 + k * 0.5 | 0},${58 + k * 0.7 | 0},${52 + k * 0.5 | 0})`;
    c.fillRect(x * TP, y * TP, TP, TP);
    if (s > 200) { c.fillStyle = 'rgba(0,0,0,0.13)'; c.fillRect(x * TP + (s % 17), y * TP + (s % 13), 3, 2); }
    else if (s < 40) { c.fillStyle = 'rgba(190,220,190,0.09)'; c.fillRect(x * TP + (s % 19), y * TP + (s % 11) + 4, 2, 2); }
  }
  // water
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] !== T_WATER) continue;
    c.fillStyle = '#35616a'; c.fillRect(x * TP - 2, y * TP - 2, TP + 4, TP + 4);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] !== T_WATER) continue;
    const s = sh[y * W + x];
    c.fillStyle = s & 1 ? '#153d5e' : '#17425f'; c.fillRect(x * TP, y * TP, TP, TP);
    c.fillStyle = 'rgba(140,200,255,0.16)'; c.fillRect(x * TP + (s % 12), y * TP + 6 + (s % 9), 9, 1.5);
  }
  // rock: shadow/base, then raised top
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] !== T_ROCK) continue;
    c.fillStyle = '#1b1e25'; c.fillRect(x * TP - 1, y * TP + 2, TP + 2, TP + 4);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] !== T_ROCK) continue;
    const s = sh[y * W + x], k = (s & 15) - 8;
    c.fillStyle = `rgb(${96 + k},${101 + k},${114 + k})`;
    c.fillRect(x * TP, y * TP - 3, TP, TP);
    if (at(x, y - 1) !== T_ROCK) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x * TP, y * TP - 3, TP, 3); }
    if (at(x - 1, y) !== T_ROCK) { c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x * TP, y * TP - 3, 2, TP); }
    if (at(x + 1, y) !== T_ROCK) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x * TP + TP - 2, y * TP - 3, 2, TP); }
    if (at(x, y + 1) !== T_ROCK) { c.fillStyle = '#3a3e49'; c.fillRect(x * TP, y * TP + TP - 3, TP, 5); }
    if (s > 150) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x * TP + (s % 14) + 2, y * TP + (s % 11), 5, 2); }
  }
  // minimap base image (1 px per tile)
  miniTerrain = document.createElement('canvas'); miniTerrain.width = W; miniTerrain.height = H;
  const mc = miniTerrain.getContext('2d'), img = mc.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = t[i], o = i * 4;
    img.data[o] = v === T_ROCK ? 112 : v === T_WATER ? 28 : 50;
    img.data[o + 1] = v === T_ROCK ? 118 : v === T_WATER ? 74 : 66;
    img.data[o + 2] = v === T_ROCK ? 134 : v === T_WATER ? 118 : 58;
    img.data[o + 3] = 255;
  }
  mc.putImageData(img, 0, 0);
  fogAlpha.fill(255);
}

function updateFogTexture(snap) {
  const fog = app.game.players[app.human].fog, d = fogImg.data, a = fogAlpha;
  const k = snap ? 1 : 0.3;
  for (let i = 0; i < a.length; i++) {
    const target = fog[i] === 2 ? 0 : fog[i] === 1 ? 138 : 255;
    const v = a[i] + (target - a[i]) * k;
    a[i] = v;
    d[i * 4 + 3] = v;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}
export function snapFog() { updateFogTexture(true); }

function hpBar(x, y, w, frac) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = frac > 0.6 ? '#5be36a' : frac > 0.3 ? '#f2cf4a' : '#f0513c';
  ctx.fillRect(x - w / 2, y, w * (frac < 0 ? 0 : frac), 3);
}

// ------------------------------------------------------------------ frame
export function render(alpha, dt) {
  const g = app.game, v = app.view, cam = app.cam, z = cam.zoom, dpr = v.dpr;
  frameNo++;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!g) return;
  const P = app.human, me = g.players[P], fog = me.fog;
  const S = dpr * z, OX = dpr * (v.w / 2 - cam.x * z), OY = dpr * (v.h / 2 - cam.y * z);
  const wx0 = cam.x - v.w / 2 / z, wy0 = cam.y - v.h / 2 / z, wx1 = cam.x + v.w / 2 / z, wy1 = cam.y + v.h / 2 / z;
  ctx.setTransform(S, 0, 0, S, OX, OY);
  ctx.imageSmoothingEnabled = true;

  // terrain (only the visible slice of the cache)
  {
    const sx0 = Math.max(0, wx0), sy0 = Math.max(0, wy0), sx1 = Math.min(WORLD, wx1), sy1 = Math.min(WORLD, wy1);
    if (sx1 > sx0 && sy1 > sy0) {
      const k = TP / TILE;
      ctx.drawImage(terrainCv, sx0 * k, sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k, sx0, sy0, sx1 - sx0, sy1 - sy0);
    }
  }
  const M = 80;
  const inView = (x, y, r) => x + r > wx0 - M && x - r < wx1 + M && y + r > wy0 - M && y - r < wy1 + M;
  const sprites = app.sprites;

  // resources (shown once explored)
  for (let i = 0; i < g.resources.length; i++) {
    const r = g.resources[i];
    if (!inView(r.x, r.y, 20) || fog[r.ty * MAP_W + r.tx] === 0) continue;
    const sp = sprites.crystals[r.id & 3], k = 0.62 + 0.38 * (r.amount / r.max);
    const sz = sp._size * k;
    ctx.drawImage(sp, r.x - sz / 2, r.y - sz / 2 - 2, sz, sz);
    if (r._sel) { ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r.x, r.y + 6, 17, 9, 0, 0, 6.2832); ctx.stroke(); }
  }

  // remembered enemy structures under fog
  ctx.globalAlpha = 0.6;
  for (const m of me.seen.values()) {
    if (!inView(m.x, m.y, m.size * 16)) continue;
    const b = g.byId.get(m.id);
    if (b && !b.dead && g.isVisible(P, b)) continue;
    const sp = sprites.get(m.type, m.owner), sz = sp._size;
    ctx.drawImage(sp, m.x - sz / 2, m.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  // buildings
  for (let i = 0; i < g.buildings.length; i++) {
    const b = g.buildings[i];
    if (b.dead || !inView(b.x, b.y, b.radius)) continue;
    if (b.owner !== P && !g.isVisible(P, b)) continue;
    const sp = sprites.get(b.type, b.owner), sz = sp._size;
    if (b._sel) {
      ctx.strokeStyle = b.owner === P ? '#69ff8f' : '#ff6b5b'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x - b.radius - 1, b.y - b.radius - 1, b.radius * 2 + 2, b.radius * 2 + 2);
    }
    if (!b.done) {
      const f = b.bp / b.def._bt;
      ctx.globalAlpha = 0.35 + 0.45 * f;
      ctx.drawImage(sp, b.x - sz / 2, b.y - sz / 2, sz, sz);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.strokeRect(b.x - b.radius + 2, b.y - b.radius + 2, b.radius * 2 - 4, b.radius * 2 - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.x - b.radius + 4, b.y + b.radius - 10, b.radius * 2 - 8, 6);
      ctx.fillStyle = '#ffd76a'; ctx.fillRect(b.x - b.radius + 5, b.y + b.radius - 9, (b.radius * 2 - 10) * f, 4);
    } else {
      ctx.drawImage(sp, b.x - sz / 2, b.y - sz / 2, sz, sz);
      if (b.def.damage) {
        const a = b.facing, flash = g.tick - b.lastShot < 3;
        ctx.strokeStyle = b.def.faction === 'compact' ? '#20242c' : '#fff8e0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(a) * 20, b.y + Math.sin(a) * 20); ctx.stroke();
        if (flash) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * 24, b.y + Math.sin(a) * 24, 5, 0, 6.2832); ctx.fill(); }
        ctx.lineCap = 'butt';
      }
      if (b.queue.length && b.owner === P) {
        const f = b.prog / DEFS[b.queue[0]]._bt;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.x - b.radius + 4, b.y + b.radius - 10, b.radius * 2 - 8, 6);
        ctx.fillStyle = '#7fd4ff'; ctx.fillRect(b.x - b.radius + 5, b.y + b.radius - 9, (b.radius * 2 - 10) * f, 4);
      }
    }
    if (b._sel || b.hp < b.maxHp) hpBar(b.x, b.y - b.radius - 8, b.radius * 1.6, b.hp / b.maxHp);
    if (b._sel && b.owner === P && b.rallyX >= 0) {
      ctx.strokeStyle = 'rgba(120,255,160,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.rallyX, b.rallyY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#78ffa0'; ctx.beginPath(); ctx.moveTo(b.rallyX, b.rallyY); ctx.lineTo(b.rallyX, b.rallyY - 18); ctx.lineTo(b.rallyX + 12, b.rallyY - 13); ctx.lineTo(b.rallyX, b.rallyY - 8); ctx.fill();
      ctx.fillRect(b.rallyX - 1, b.rallyY - 18, 2, 18);
    }
  }

  // units: rings first, then sprites, then bars
  const units = g.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.dead) { u._vis = false; continue; }
    const x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
    u._rx = x; u._ry = y;
    u._vis = inView(x, y, 16) && (u.owner === P || fog[((u.y / TILE) | 0) * MAP_W + ((u.x / TILE) | 0)] === 2);
    if (u._vis && u._sel) {
      ctx.strokeStyle = u.owner === P ? '#69ff8f' : '#ff6b5b'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y + 2, u.radius + 4, u.radius + 1, 0, 0, 6.2832); ctx.stroke();
    }
  }
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u._vis) continue;
    let rf = u._rf === undefined ? u.facing : u._rf;
    let da = u.facing - rf;
    while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832;
    rf += da * 0.3; u._rf = rf;
    const sp = sprites.get(u.type, u.owner), sz = sp._size, c = Math.cos(rf), s = Math.sin(rf);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.setTransform(S, 0, 0, S, OX + u._rx * S, OY + (u._ry + 3) * S);
    ctx.beginPath(); ctx.ellipse(0, 0, u.radius, u.radius * 0.7, 0, 0, 6.2832); ctx.fill();
    ctx.setTransform(c * S, s * S, -s * S, c * S, OX + u._rx * S, OY + u._ry * S);
    ctx.drawImage(sp, -sz / 2, -sz / 2, sz, sz);
    if (u.carrying) { ctx.fillStyle = '#b9a2ff'; ctx.fillRect(-u.radius - 2, -3, 5, 6); }
    if (g.tick - u.lastShot < 2 && u.def._proj) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(u.radius + 5, 0, 3.5, 0, 6.2832); ctx.fill(); }
  }
  ctx.setTransform(S, 0, 0, S, OX, OY);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u._vis && (u._sel || u.hp < u.maxHp)) hpBar(u._rx, u._ry - u.radius - 9, u.radius * 2 + 4, u.hp / u.maxHp);
  }

  // projectiles
  for (let i = 0; i < g.projectiles.length; i++) {
    const p = g.projectiles[i];
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    if (!inView(x, y, 8) || fog[((y / TILE) | 0) * MAP_W + ((x / TILE) | 0)] !== 2) continue;
    const dx = p.x - p.px, dy = p.y - p.py, big = p.def.splash ? 1.6 : 1;
    if (p.def.faction === 'compact') {
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2.2 * big; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - dx * 0.6, y - dy * 0.6); ctx.lineTo(x, y); ctx.stroke(); ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = TEAM_COLORS[p.owner]; ctx.beginPath(); ctx.arc(x, y, 3.6 * big, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.7 * big, 0, 6.2832); ctx.fill();
    }
  }

  // particles + world rings
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { pool.push(p); particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
    ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    if (r.screen) continue;
    r.life -= dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    const f = 1 - r.life / r.max;
    ctx.globalAlpha = 1 - f; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * f, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // fog of war (eased so reveals are soft)
  if (frameNo % 2 === 0) updateFogTexture(false);
  ctx.drawImage(fogCv, 0, 0, MAP_W, MAP_H, 0, 0, WORLD, WORLD);

  // building placement ghost
  const pl = app.placing;
  if (pl) {
    const d = DEFS[pl.what], sp = sprites.get(pl.what, P), sz = sp._size;
    const cx = (pl.tx + d.size / 2) * TILE, cy = (pl.ty + d.size / 2) * TILE;
    let ok = true;
    for (let ty = 0; ty < d.size; ty++) for (let tx = 0; tx < d.size; tx++) {
      const X = pl.tx + tx, Y = pl.ty + ty;
      const free = X >= 0 && Y >= 0 && X < MAP_W && Y < MAP_H && !g.grid.blocked[Y * MAP_W + X] && fog[Y * MAP_W + X] > 0;
      if (!free) ok = false;
      ctx.fillStyle = free ? 'rgba(90,255,140,0.33)' : 'rgba(255,70,60,0.45)';
      ctx.fillRect(X * TILE + 1, Y * TILE + 1, TILE - 2, TILE - 2);
    }
    pl.ok = ok;
    ctx.globalAlpha = 0.7; ctx.drawImage(sp, cx - sz / 2, cy - sz / 2, sz, sz); ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#69ff8f' : '#ff5b4c'; ctx.lineWidth = 2;
    ctx.strokeRect(pl.tx * TILE, pl.ty * TILE, d.size * TILE, d.size * TILE);
    if (d.damage) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, d._range + d.radius, 0, 6.2832); ctx.stroke(); }
  }

  // ---- screen space ----
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (app.box) {
    const b = app.box, x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    ctx.fillStyle = 'rgba(105,255,143,0.12)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#69ff8f'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    if (!r.screen) continue;
    r.life -= dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    const f = 1 - r.life / r.max;
    ctx.globalAlpha = 1 - f; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * f, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ minimap
let mini, mctx;
export function initMinimap(cv) { mini = cv; mctx = cv.getContext('2d'); }

export function renderMinimap(dt) {
  const g = app.game;
  if (!g || !mini) return;
  const dpr = app.view.dpr, cw = mini.clientWidth || 150;
  if (mini.width !== Math.round(cw * dpr)) { mini.width = mini.height = Math.round(cw * dpr); }
  const k = mini.width / MAP_W, P = app.human, me = g.players[P], fog = me.fog;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(miniTerrain, 0, 0, mini.width, mini.height);
  mctx.setTransform(k, 0, 0, k, 0, 0);
  mctx.fillStyle = '#b79cff';
  for (const r of g.resources) if (fog[r.ty * MAP_W + r.tx]) mctx.fillRect(r.tx, r.ty, 1.2, 1.2);
  for (const m of me.seen.values()) { mctx.fillStyle = '#9c4a3a'; mctx.fillRect(m.tx, m.ty, m.size, m.size); }
  for (const b of g.buildings) {
    if (b.owner !== P && !g.isVisible(P, b)) continue;
    mctx.fillStyle = TEAM_COLORS[b.owner]; mctx.fillRect(b.tx, b.ty, b.size, b.size);
  }
  for (const u of g.units) {
    const tx = u.x / TILE, ty = u.y / TILE;
    if (u.owner !== P && fog[(ty | 0) * MAP_W + (tx | 0)] !== 2) continue;
    mctx.fillStyle = u._sel ? '#ffffff' : TEAM_COLORS[u.owner];
    mctx.fillRect(tx - 0.8, ty - 0.8, 1.7, 1.7);
  }
  mctx.imageSmoothingEnabled = true;
  mctx.globalAlpha = 0.85; mctx.drawImage(fogCv, 0, 0, MAP_W, MAP_H); mctx.globalAlpha = 1;
  for (let i = fx.pings.length - 1; i >= 0; i--) {
    const p = fx.pings[i];
    p.life -= dt;
    if (p.life <= 0) { fx.pings.splice(i, 1); continue; }
    const f = (p.life * 2) % 1;
    mctx.strokeStyle = '#ff4433'; mctx.lineWidth = 1; mctx.globalAlpha = 0.4 + f * 0.6;
    mctx.beginPath(); mctx.arc(p.x / TILE, p.y / TILE, 3 + (1 - f) * 6, 0, 6.2832); mctx.stroke(); mctx.globalAlpha = 1;
  }
  const v = app.view, cam = app.cam;
  mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 0.9;
  mctx.strokeRect((cam.x - v.w / 2 / cam.zoom) / TILE, (cam.y - v.h / 2 / cam.zoom) / TILE, v.w / cam.zoom / TILE, v.h / cam.zoom / TILE);
}

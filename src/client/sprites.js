// All art is generated here, in code, onto offscreen canvases at start-up.
import { DEFS, TILE } from '../data.js';

export const TEAM_COLORS = ['#3fc8ff', '#ff5e3a'];
export const SPRITE_SCALE = 2;

const HULL = '#8d97a6', HULL_D = '#566072', HULL_DD = '#2c323e', CREAM = '#efe6c4', CREAM_D = '#b3a172', CREAM_DD = '#6f6342';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return c;
}
function poly(c, pts, fill, stroke, lw) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}
function circ(c, x, y, r, fill, stroke, lw) {
  c.beginPath(); c.arc(x, y, r, 0, 6.2832);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}
function rrect(c, x, y, w, h, r, fill, stroke, lw) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}
function ngon(n, r, rot) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = rot + i * 6.2832 / n; p.push(Math.cos(a) * r, Math.sin(a) * r); }
  return p;
}
function glow(c, x, y, r, col) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
}

// Each painter draws centred at (0,0), facing +x, in world pixels. T = team colour.
const PAINT = {
  // ---- Foundry Compact units ----
  tinker(c, T) {
    c.strokeStyle = HULL_DD; c.lineWidth = 2.2; c.beginPath();
    c.moveTo(4, -4); c.lineTo(9, -6); c.moveTo(4, 4); c.lineTo(9, 6); c.stroke();
    rrect(c, -7, -6, 13, 12, 3, HULL, HULL_DD, 1.2);
    rrect(c, -6, -3, 5, 6, 1, T);
    circ(c, 3, 0, 2, '#ffd76a');
  },
  brawler(c, T) {
    poly(c, [3, -3, 11, -7, 6, -1], '#d7dde6', HULL_DD, 0.8);
    poly(c, [3, 3, 11, 7, 6, 1], '#d7dde6', HULL_DD, 0.8);
    poly(c, [8, 0, -3, -8, -8, -5, -5, 0, -8, 5, -3, 8], HULL, HULL_DD, 1.2);
    poly(c, [3, 0, -3, -4, -5, 0, -3, 4], T);
  },
  arbalest(c, T) {
    rrect(c, 0, -1.6, 12, 3.2, 1, HULL_DD);
    rrect(c, 8, -2.6, 3, 5.2, 1, HULL_D);
    circ(c, -1, 0, 6.5, HULL, HULL_DD, 1.2);
    circ(c, -1, 0, 3.4, T);
    rrect(c, -8, -2.5, 3, 5, 1, HULL_D);
  },
  breacher(c, T) {
    rrect(c, 2, -6.5, 10, 4, 1, HULL_DD); rrect(c, 2, 2.5, 10, 4, 1, HULL_DD);
    rrect(c, -8, -8, 14, 16, 3, HULL, HULL_DD, 1.2);
    rrect(c, -6, -5, 5, 10, 1, T);
    rrect(c, 1, -2, 4, 4, 1, HULL_D);
  },
  bulwark(c, T) {
    rrect(c, -12, -13, 23, 5, 2, HULL_DD); rrect(c, -12, 8, 23, 5, 2, HULL_DD);
    poly(c, ngon(8, 11.5, 0.3927), HULL, HULL_DD, 1.4);
    rrect(c, 2, -2.6, 13, 5.2, 1.5, HULL_DD);
    circ(c, 0, 0, 6, T, HULL_DD, 1.2);
    circ(c, 0, 0, 2.4, '#fff');
  },
  // ---- Lumen Choir units ----
  wisp(c, T) {
    glow(c, 0, 0, 9, T);
    circ(c, 0, 0, 5.5, null, CREAM, 1.4);
    circ(c, 0, 0, 3, CREAM);
    poly(c, [5, 0, 9, -2, 9, 2], CREAM);
  },
  shardling(c, T) {
    poly(c, [10, 0, 0, -3, -8, -8, -4, 0, -8, 8, 0, 3], CREAM, CREAM_DD, 1);
    poly(c, [5, 0, -2, -2.5, -3, 0, -2, 2.5], T);
  },
  glinter(c, T) {
    c.strokeStyle = CREAM; c.lineWidth = 1.6; c.beginPath(); c.moveTo(6, 0); c.lineTo(13, 0); c.stroke();
    poly(c, [9, 0, 0, -7, -8, 0, 0, 7], CREAM, CREAM_DD, 1);
    poly(c, [4, 0, 0, -3.4, -4, 0, 0, 3.4], T);
    circ(c, 0, 0, 1.3, '#fff');
  },
  piercer(c, T) {
    poly(c, [14, 0, 2, -4.5, -9, -7, -6, 0, -9, 7, 2, 4.5], CREAM, CREAM_DD, 1);
    poly(c, [8, 0, 1, -2.4, -4, 0, 1, 2.4], T);
    poly(c, [-6, 0, -11, -3, -11, 3], CREAM_D);
  },
  monolith(c, T) {
    glow(c, 0, 0, 16, T);
    poly(c, ngon(6, 12.5, 0), CREAM, CREAM_DD, 1.4);
    poly(c, [0, 0, 12.5, 0, 6.2, 10.8], CREAM_D); poly(c, [0, 0, -6.2, -10.8, -12.5, 0], '#fff8e0');
    poly(c, ngon(6, 6, 0.5236), T, CREAM_DD, 1);
    circ(c, 0, 0, 2.2, '#fff');
  },
  // ---- Foundry Compact buildings (s = footprint px) ----
  core(c, T, s) {
    const h = s / 2 - 4;
    rrect(c, -h, -h, h * 2, h * 2, 10, HULL_D, HULL_DD, 2);
    rrect(c, -h + 8, -h + 8, h * 2 - 16, h * 2 - 16, 6, HULL, HULL_DD, 1.5);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { rrect(c, x * (h - 10) - 8, y * (h - 10) - 8, 16, 16, 3, HULL_DD); circ(c, x * (h - 10), y * (h - 10), 4, T); }
    rrect(c, -h + 26, -5, h * 2 - 52, 10, 2, HULL_D); rrect(c, -5, -h + 26, 10, h * 2 - 52, 2, HULL_D);
    circ(c, 0, 0, 22, HULL_DD); circ(c, 0, 0, 17, T, '#fff', 1.5); circ(c, -5, -5, 5, 'rgba(255,255,255,0.55)');
  },
  quarters(c, T, s) {
    const h = s / 2 - 4;
    rrect(c, -h, -h, h * 2, h * 2, 6, HULL, HULL_DD, 2);
    rrect(c, -h, -h, h * 2, 9, 4, T);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) rrect(c, -h + 7 + x * 15, -h + 16 + y * 18, 10, 11, 2, (x + y) % 2 ? '#ffd76a' : HULL_DD);
  },
  yard(c, T, s) {
    const h = s / 2 - 4;
    rrect(c, -h, -h, h * 2, h * 2, 7, HULL_D, HULL_DD, 2);
    rrect(c, -h + 6, -h + 6, h * 2 - 12, h - 2, 4, HULL, HULL_DD, 1);
    rrect(c, -h + 12, -h + 12, h * 2 - 24, 10, 2, T);
    c.strokeStyle = HULL_DD; c.lineWidth = 3; c.beginPath(); c.moveTo(-h + 14, -6); c.lineTo(h - 14, -6); c.stroke();
    rrect(c, -h + 10, 6, h * 2 - 20, h - 12, 3, HULL_DD);
    c.save(); c.beginPath(); c.rect(-h + 12, 8, h * 2 - 24, h - 16); c.clip();
    c.strokeStyle = '#ffd76a'; c.lineWidth = 5;
    for (let x = -h - 20; x < h + 20; x += 14) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 26, 4); c.stroke(); }
    c.restore();
  },
  lab(c, T, s) {
    const h = s / 2 - 4;
    rrect(c, -h, -h, h * 2, h * 2, 7, HULL, HULL_DD, 2);
    rrect(c, -h + 6, h - 20, h * 2 - 12, 13, 3, HULL_D);
    for (let i = 0; i < 4; i++) circ(c, -h + 14 + i * 20, h - 13.5, 3, i % 2 ? T : '#ffd76a');
    circ(c, 0, -8, 25, HULL_DD); circ(c, 0, -8, 21, '#c5ccd6', HULL_DD, 1); circ(c, 0, -8, 12, HULL_D); circ(c, 0, -8, 6, T, '#fff', 1.2);
    c.strokeStyle = HULL_DD; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -8); c.lineTo(17, -25); c.stroke(); circ(c, 17, -25, 3, '#ffd76a');
  },
  watchpost(c, T, s) {
    poly(c, ngon(8, s / 2 - 4, 0.3927), HULL_D, HULL_DD, 2);
    poly(c, ngon(8, s / 2 - 11, 0.3927), HULL, HULL_DD, 1);
    circ(c, 0, 0, 11, T, HULL_DD, 1.5);
  },
  // ---- Lumen Choir buildings ----
  spire(c, T, s) {
    const h = s / 2 - 4;
    glow(c, 0, 0, h + 4, T);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) poly(c, [x * (h - 12), y * (h - 12) - 13, x * (h - 12) + 9, y * (h - 12), x * (h - 12), y * (h - 12) + 13, x * (h - 12) - 9, y * (h - 12)], CREAM, CREAM_DD, 1.2);
    poly(c, [0, -h, h, 0, 0, h, -h, 0], CREAM, CREAM_DD, 2);
    poly(c, [0, -h, h, 0, 0, 0], '#fff8e0'); poly(c, [0, h, -h, 0, 0, 0], CREAM_D);
    poly(c, [0, -h, h, 0, 0, h, -h, 0], null, CREAM_DD, 2);
    poly(c, ngon(4, 26, 0.7854), CREAM_DD); poly(c, ngon(8, 19, 0), T, '#fff', 1.5); circ(c, 0, 0, 7, '#fff');
  },
  prism(c, T, s) {
    const h = s / 2 - 4;
    glow(c, 0, 0, h + 3, T);
    poly(c, [0, -h, h, h - 6, -h, h - 6], CREAM, CREAM_DD, 2);
    poly(c, [0, -h, 0, h - 6, -h, h - 6], '#fff8e0');
    poly(c, [0, -h + 16, h - 14, h - 13, -h + 14, h - 13], T, CREAM_DD, 1);
    circ(c, 0, 6, 4, '#fff');
  },
  gate(c, T, s) {
    const h = s / 2 - 4;
    glow(c, 0, 0, h + 4, T);
    poly(c, ngon(8, h, 0.3927), CREAM_D, CREAM_DD, 2);
    circ(c, 0, 0, h - 9, CREAM, CREAM_DD, 1.5);
    circ(c, 0, 0, h - 18, HULL_DD);
    const g = c.createRadialGradient(0, 0, 2, 0, 0, h - 18);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, T); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, h - 19, 0, 6.2832); c.fill();
    for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.7854; poly(c, [Math.cos(a) * (h - 4), Math.sin(a) * (h - 4) - 8, Math.cos(a) * (h - 4) + 6, Math.sin(a) * (h - 4), Math.cos(a) * (h - 4), Math.sin(a) * (h - 4) + 8, Math.cos(a) * (h - 4) - 6, Math.sin(a) * (h - 4)], '#fff8e0', CREAM_DD, 1); }
  },
  vault(c, T, s) {
    const h = s / 2 - 4;
    glow(c, 0, 0, h + 3, T);
    poly(c, ngon(6, h, 0.5236), CREAM, CREAM_DD, 2);
    poly(c, ngon(6, h - 10, 0), CREAM_D, CREAM_DD, 1.2);
    poly(c, ngon(6, h - 20, 0.5236), '#fff8e0', CREAM_DD, 1.2);
    poly(c, ngon(3, h - 27, -1.5708), T, '#fff', 1.5);
    circ(c, 0, 0, 4, '#fff');
  },
  obelisk(c, T, s) {
    const h = s / 2 - 4;
    glow(c, 0, 0, h + 3, T);
    poly(c, [0, -h, 8, -8, h, 0, 8, 8, 0, h, -8, 8, -h, 0, -8, -8], CREAM, CREAM_DD, 2);
    poly(c, ngon(4, 11, 0), T, '#fff', 1.5);
    circ(c, 0, 0, 3.5, '#fff');
  },
};

function paintCrystal(c, seed) {
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(0, 9, 13, 5, 0, 0, 6.2832); c.fill();
  for (let i = 0; i < 4; i++) {
    const x = -8 + i * 5.2 + r() * 2, h = 12 + r() * 9, w = 4 + r() * 2.5, lean = (r() - 0.5) * 6;
    poly(c, [x - w, 9, x + lean, 9 - h, x + w, 9], '#7a55e6', '#33206e', 1);
    poly(c, [x - w, 9, x + lean, 9 - h, x, 9], '#b9a2ff');
  }
}

// Command-card glyphs (white line art).
const ICONS = {
  move(c) { c.beginPath(); c.moveTo(-9, 0); c.lineTo(7, 0); c.moveTo(1, -7); c.lineTo(9, 0); c.lineTo(1, 7); c.stroke(); },
  amove(c) { c.beginPath(); c.arc(0, 0, 7, 0, 6.2832); c.moveTo(0, -11); c.lineTo(0, -3); c.moveTo(0, 3); c.lineTo(0, 11); c.moveTo(-11, 0); c.lineTo(-3, 0); c.moveTo(3, 0); c.lineTo(11, 0); c.stroke(); },
  stop(c) { c.strokeRect(-7, -7, 14, 14); },
  hold(c) { c.beginPath(); c.moveTo(0, -10); c.lineTo(8, -6); c.lineTo(8, 1); c.quadraticCurveTo(7, 8, 0, 11); c.quadraticCurveTo(-7, 8, -8, 1); c.lineTo(-8, -6); c.closePath(); c.stroke(); },
  patrol(c) { c.beginPath(); c.moveTo(-9, -4); c.lineTo(8, -4); c.moveTo(4, -8); c.lineTo(8, -4); c.lineTo(4, 0); c.moveTo(9, 5); c.lineTo(-8, 5); c.moveTo(-4, 1); c.lineTo(-8, 5); c.lineTo(-4, 9); c.stroke(); },
  build(c) { c.beginPath(); c.moveTo(-9, 9); c.lineTo(3, -3); c.stroke(); c.strokeRect(1, -10, 9, 6); c.beginPath(); c.moveTo(-10, 10); c.lineTo(10, 10); c.stroke(); },
  cancel(c) { c.beginPath(); c.moveTo(-8, -8); c.lineTo(8, 8); c.moveTo(8, -8); c.lineTo(-8, 8); c.stroke(); },
  rally(c) { c.beginPath(); c.moveTo(-6, 10); c.lineTo(-6, -10); c.lineTo(8, -5); c.lineTo(-6, 0); c.stroke(); },
  confirm(c) { c.beginPath(); c.moveTo(-9, 1); c.lineTo(-3, 8); c.lineTo(9, -7); c.stroke(); },
  back(c) { c.beginPath(); c.moveTo(4, -9); c.lineTo(-6, 0); c.lineTo(4, 9); c.stroke(); },
};

export function buildSprites() {
  const S = SPRITE_SCALE;
  const map = {};
  for (const key in DEFS) {
    const d = DEFS[key];
    for (let o = 0; o < 2; o++) {
      const size = d.kind === 'unit' ? d.radius * 2 + 14 : d.size * TILE + 12;
      const cv = mk(size * S, size * S), c = cv.getContext('2d');
      c.setTransform(S, 0, 0, S, size * S / 2, size * S / 2);
      c.lineJoin = 'round';
      PAINT[key](c, TEAM_COLORS[o], d.kind === 'unit' ? 0 : d.size * TILE);
      cv._size = size;
      map[key + ':' + o] = cv;
    }
  }
  const crystals = [];
  for (let i = 0; i < 4; i++) {
    const cv = mk(40 * S, 40 * S), c = cv.getContext('2d');
    c.setTransform(S, 0, 0, S, 20 * S, 20 * S); c.lineJoin = 'round';
    paintCrystal(c, i + 1);
    cv._size = 40;
    crystals.push(cv);
  }
  return {
    get(type, owner) { return map[type + ':' + owner]; },
    crystals,
    // Draws a sprite or glyph into a small DOM canvas (buttons, portraits).
    paintIcon(canvas, name, owner) {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 44, h = canvas.clientHeight || 44;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      if (ICONS[name]) {
        c.translate(w / 2, h / 2); c.scale(w / 30, w / 30);
        c.strokeStyle = '#e8f1ff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
        ICONS[name](c);
      } else if (name === 'shards') {
        c.drawImage(crystals[0], 0, 0, w, h);
      } else {
        const sp = map[name + ':' + (owner || 0)];
        if (!sp) return;
        const d = DEFS[name];
        if (d.kind === 'unit') {
          const k = Math.min(w, h) / (d.radius * 2 + 8) * 1.0;
          c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2);
          c.drawImage(sp, -sp._size * k / 2, -sp._size * k / 2, sp._size * k, sp._size * k);
        } else c.drawImage(sp, 1, 1, w - 2, h - 2);
      }
    },
  };
}

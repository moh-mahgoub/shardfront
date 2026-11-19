// Touch-first input built on Pointer Events (touch, pen and mouse share one path).
//   one finger tap  : select / smart command           one finger drag : box-select (Select mode) or pan (Camera mode)
//   two fingers     : pan + pinch-zoom, always         double tap      : select all of that type on screen
//   mouse           : left = select/box, right = smart command, wheel = zoom, middle-drag = pan
import { app, screenToWorldX, screenToWorldY } from './app.js';
import { TILE, MAP_W, DEFS } from '../data.js';
import { fx } from './renderer.js';
import {
  clampCamera, centerOn, zoomAt, setSelection, pickEntity, selectBox, selectSameType, smartCommand, targetedCommand,
  movePlacement, confirmPlacement, cancelModes, startTargeting, orderSimple, recallGroup, assignGroup,
} from './controller.js';

const pts = new Map();
let gesture = null;            // null | 'tap' | 'box' | 'pan' | 'pinch' | 'place' | 'dead'
let pinchDist = 0, pinchX = 0, pinchY = 0;
let lastTap = { t: 0, x: 0, y: 0, type: '' };
let lastMoveT = 0;
const keys = {};
let lastGroupKey = { i: -1, t: 0 };

function twoPoints() {
  const it = pts.values();
  return [it.next().value, it.next().value];
}

function handleTap(sx, sy, isTouch, shift) {
  fx.ripple(sx, sy);
  const wx = screenToWorldX(sx), wy = screenToWorldY(sy);
  if (app.placing) {
    const pl = app.placing, s = DEFS[pl.what].size;
    const inside = wx >= pl.tx * TILE && wx < (pl.tx + s) * TILE && wy >= pl.ty * TILE && wy < (pl.ty + s) * TILE;
    if (!isTouch) { movePlacement(wx, wy); confirmPlacement(); }
    else if (inside) confirmPlacement();              // tap the ghost again to confirm
    else movePlacement(wx, wy);
    return;
  }
  if (app.targeting) { targetedCommand(wx, wy); return; }
  const e = pickEntity(wx, wy, (isTouch ? 20 : 6) / app.cam.zoom);
  const now = performance.now();
  if (e && e.owner === app.human) {
    if (now - lastTap.t < 380 && lastTap.type === e.type && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 44) {
      selectSameType(e); lastTap.t = 0; return;
    }
    lastTap = { t: now, x: sx, y: sy, type: e.type };
    if (shift) {
      const has = app.sel.includes(e);
      setSelection(has ? app.sel.filter(o => o !== e) : app.sel.filter(o => o.owner === app.human).concat([e]));
    } else setSelection([e]);
    app.sfx.play('select');
    return;
  }
  lastTap.t = 0;
  if (isTouch && smartCommand(wx, wy, e)) return;
  setSelection(e ? [e] : []);
  if (e) app.sfx.play('select');
}

function onDown(ev) {
  app.sfx.unlock();
  if (!app.running || app.paused) return;
  ev.preventDefault();
  const cv = ev.currentTarget;
  try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
  const p = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), touch: ev.pointerType !== 'mouse', button: ev.button };
  pts.set(ev.pointerId, p);
  app.cam.vx = app.cam.vy = 0;
  if (!p.touch) {
    if (ev.button === 2) {
      pts.delete(ev.pointerId);
      if (app.placing || app.targeting) { cancelModes(); return; }
      const wx = screenToWorldX(p.x), wy = screenToWorldY(p.y);
      fx.ripple(p.x, p.y);
      smartCommand(wx, wy, pickEntity(wx, wy, 6 / app.cam.zoom));
      return;
    }
    gesture = ev.button === 1 ? 'pan' : 'tap';
    return;
  }
  if (pts.size === 1) gesture = 'tap';
  else if (pts.size === 2) {
    gesture = 'pinch'; app.box = null;
    const [a, b] = twoPoints();
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinchX = (a.x + b.x) / 2; pinchY = (a.y + b.y) / 2;
  }
}

function onMove(ev) {
  if (ev.pointerType === 'mouse') {
    app.hover.x = ev.clientX; app.hover.y = ev.clientY;
    if (app.placing && app.running) movePlacement(screenToWorldX(ev.clientX), screenToWorldY(ev.clientY));
  }
  const p = pts.get(ev.pointerId);
  if (!p) return;
  ev.preventDefault();
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
  p.x = ev.clientX; p.y = ev.clientY;
  const cam = app.cam;
  if (gesture === 'pinch' && pts.size >= 2) {
    const [a, b] = twoPoints();
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.x -= (mx - pinchX) / cam.zoom; cam.y -= (my - pinchY) / cam.zoom;
    zoomAt(mx, my, d / pinchDist);
    pinchDist = d; pinchX = mx; pinchY = my;
    return;
  }
  if (gesture === 'tap') {
    if (Math.hypot(p.x - p.x0, p.y - p.y0) < (p.touch ? 11 : 5)) return;
    if (app.placing && p.touch) gesture = 'place';
    else if (p.button !== 1 && !app.targeting && !app.placing && (!p.touch || app.mode === 'select')) gesture = 'box';
    else gesture = 'pan';
    lastMoveT = performance.now();
  }
  if (gesture === 'box') app.box = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y };
  else if (gesture === 'pan') {
    const now = performance.now(), dt = Math.max(1, now - lastMoveT) / 1000;
    lastMoveT = now;
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
    cam.vx = cam.vx * 0.6 + (-dx / cam.zoom / dt) * 0.4; cam.vy = cam.vy * 0.6 + (-dy / cam.zoom / dt) * 0.4;
    clampCamera();
  } else if (gesture === 'place') {
    movePlacement(screenToWorldX(p.x), screenToWorldY(p.y - 56));   // keep the ghost above the fingertip
  }
}

function onUp(ev) {
  const p = pts.get(ev.pointerId);
  if (!p) return;
  pts.delete(ev.pointerId);
  const cancelled = ev.type === 'pointercancel';
  if (gesture === 'pinch') { gesture = pts.size ? 'dead' : null; return; }
  if (!cancelled) {
    if (gesture === 'tap') handleTap(p.x, p.y, p.touch, ev.shiftKey);
    else if (gesture === 'box') selectBox(p.x0, p.y0, p.x, p.y, ev.shiftKey);
    else if (gesture === 'pan') {
      if (performance.now() - lastMoveT > 90) app.cam.vx = app.cam.vy = 0;   // finger rested: no fling
      const sp = Math.hypot(app.cam.vx, app.cam.vy), max = 2600;
      if (sp > max) { app.cam.vx *= max / sp; app.cam.vy *= max / sp; }
    }
  }
  app.box = null;
  if (!pts.size) gesture = null;
}

// Smooth inertial panning + keyboard panning; called every frame.
export function updateCamera(dt) {
  const cam = app.cam;
  if (gesture !== 'pan' && (cam.vx || cam.vy)) {
    cam.x += cam.vx * dt; cam.y += cam.vy * dt;
    const k = Math.exp(-dt * 4.5);
    cam.vx *= k; cam.vy *= k;
    if (Math.abs(cam.vx) + Math.abs(cam.vy) < 4) cam.vx = cam.vy = 0;
  }
  const s = 900 * dt / cam.zoom;
  if (keys.ArrowLeft) cam.x -= s; if (keys.ArrowRight) cam.x += s;
  if (keys.ArrowUp) cam.y -= s; if (keys.ArrowDown) cam.y += s;
  const bx = cam.x, by = cam.y;
  clampCamera();
  if (cam.x !== bx) cam.vx = 0; if (cam.y !== by) cam.vy = 0;
}

function onKey(ev) {
  keys[ev.key] = true;
  if (ev.key === 'F3' || ev.key === '`') { ev.preventDefault(); app.ui.toggleDebug(); return; }
  if (!app.running) return;
  if (ev.key === 'Escape') {
    if (app.targeting || app.placing || app.buildMenu) cancelModes(); else app.ui.togglePause();
    return;
  }
  if (app.paused || ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (k >= '1' && k <= '5') {
    const i = +k - 1;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) { ev.preventDefault(); assignGroup(i); app.ui.toast('Group ' + k + ' set'); }
    else { const now = performance.now(); recallGroup(i, lastGroupKey.i === i && now - lastGroupKey.t < 400); lastGroupKey = { i, t: now }; }
    return;
  }
  if (k === 'a') startTargeting('amove');
  else if (k === 'm') startTargeting('move');
  else if (k === 'p') startTargeting('patrol');
  else if (k === 's') orderSimple('stop');
  else if (k === 'h') orderSimple('hold');
  else if (k === 'b') { app.buildMenu = !app.buildMenu; app.selVersion++; }
  else if (k === 'tab') { ev.preventDefault(); app.ui.setMode(app.mode === 'select' ? 'camera' : 'select'); }
}

export function initInput(canvas, minimap) {
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (app.running && !app.paused) zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', ev => { keys[ev.key] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // minimap: tap to jump, drag to pan
  const jump = ev => {
    const r = minimap.getBoundingClientRect();
    centerOn((ev.clientX - r.left) / r.width * MAP_W * TILE, (ev.clientY - r.top) / r.height * MAP_W * TILE);
  };
  let miniDown = false;
  minimap.addEventListener('pointerdown', ev => {
    ev.preventDefault(); ev.stopPropagation(); app.sfx.unlock();
    if (!app.running || app.paused) return;
    miniDown = true; try { minimap.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    jump(ev);
  });
  minimap.addEventListener('pointermove', ev => { if (miniDown) { ev.preventDefault(); jump(ev); } });
  const end = () => { miniDown = false; };
  minimap.addEventListener('pointerup', end); minimap.addEventListener('pointercancel', end);

  // Stop the browser from scrolling, bouncing, zooming or selecting.
  const block = ev => { if (!(ev.target.closest && ev.target.closest('.scroll'))) ev.preventDefault(); };
  document.addEventListener('touchmove', block, { passive: false });
  for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart', 'dragstart']) document.addEventListener(t, ev => ev.preventDefault());
}

export function resetInput() { pts.clear(); gesture = null; app.box = null; }

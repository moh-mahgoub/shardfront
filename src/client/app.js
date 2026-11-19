// Shared client state. Simulation state lives in app.game; everything here is
// presentation / input state only and never feeds back into the simulation
// except through app.game.issue(command).
export const app = {
  game: null,
  human: 0,                    // player index controlled by this client
  running: false, paused: false, ended: false,
  cam: { x: 0, y: 0, zoom: 1, vx: 0, vy: 0 },
  view: { w: 1024, h: 768, dpr: 1, maxDpr: 2.5 },   // maxDpr drops automatically if the device can't hold 60 fps
  sel: [],                     // selected entities
  selVersion: 0,
  groups: [[], [], [], [], []],
  mode: 'select',              // one-finger drag: 'select' (box) | 'camera' (pan)
  targeting: null,             // 'move' | 'amove' | 'patrol' | 'rally'
  placing: null,               // { what, tx, ty, ok }
  buildMenu: false,
  box: null,                   // selection box in screen px { x0, y0, x1, y1 }
  hover: { x: -1, y: -1 },
  alpha: 0,
  settings: null, sprites: null, sfx: null,
  stats: { fps: 0, frameMs: 0, renderMs: 0, tickMs: 0, tickMax: 0, pathsPerSec: 0 },
  // filled in by the modules that own them
  ui: null, fx: null,
};

export function screenToWorldX(sx) { return (sx - app.view.w / 2) / app.cam.zoom + app.cam.x; }
export function screenToWorldY(sy) { return (sy - app.view.h / 2) / app.cam.zoom + app.cam.y; }
export function worldToScreenX(wx) { return (wx - app.cam.x) * app.cam.zoom + app.view.w / 2; }
export function worldToScreenY(wy) { return (wy - app.cam.y) * app.cam.zoom + app.view.h / 2; }

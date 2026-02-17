import { TILE_SIZE } from '../../config/gameConfig';
import {
  initWaterOverlayWebGL,
  renderWaterOverlayWebGL,
  clearWaterOverlayWebGL,
  setWaterOverlayContextLostCallback,
} from './waterOverlayWebGL';

/**
 * Water Overlay Rendering Utilities
 *
 * GPU path: WebGL renders voronoi/caustics/ripple for the entire viewport,
 * then a cheap CPU-built alpha mask (grid + feathering) is composited via
 * 2D-canvas 'source-in' to restrict the pattern to water tiles.
 *
 * CPU fallback: full per-pixel loop with inline voronoi when WebGL unavailable.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const TWO_PI = 6.283185307179586;
const PX = 4; // shader texel size — bilinear-scaled up

// --- Voronoi ---
const VS  = 0.013;
const VA  = 0.55;
const VW  = 0.35;
const VE  = 0.08;
const VCS = 0.35;

// --- Caustic sine-interference ---
const CA1X = 0.031; const CA1Y = 0.013; const CA1S = 1.40;
const CA2X = 0.017; const CA2Y = 0.023; const CA2S = 1.10;

// --- UV distortion ---
const DFX = 0.018; const DSX = 1.50; const DAX = 3.0;
const DFY = 0.014; const DSY = 1.20; const DAY = 2.5;

// --- Ripple ---
const RFX = 0.042; const RFY = 0.016; const RS = 2.00;

// --- Layer weights ---
const WCR = 0.55;
const WCA = 0.28;
const WRI = 0.16;
const WCS = 0.06;

// --- Output ---
const BR = 225; const RR = 30;
const BG = 240; const RG = 15;
const OB = 255;
const BA = 4;   const RA = 85;

// --- Shoreline feathering ---
const FEATH = 14;
const INV_F = 1.0 / FEATH;

// ============================================================================
// SINE LUT
// ============================================================================

const SN = 4096, SM = SN - 1, SS = SN / TWO_PI;
const SL = new Float32Array(SN);
for (let i = 0; i < SN; i++) SL[i] = Math.sin((i / SN) * TWO_PI);

function fsin(x: number): number {
  let i = (x * SS) % SN; if (i < 0) i += SN;
  return SL[i & SM];
}

// ============================================================================
// SMOOTHSTEP
// ============================================================================

function sst(e0: number, e1: number, x: number): number {
  if (x <= e0) return 0; if (x >= e1) return 1;
  const t = (x - e0) / (e1 - e0);
  return t * t * (3.0 - 2.0 * t);
}

// ============================================================================
// HASH  (Jenkins 32-bit — pure ALU, no trig)
// ============================================================================

function jh(n: number): number {
  n = (n + 0x7ed55d16 + (n << 12)) | 0;
  n = (n ^ 0xc761c23c ^ (n >>> 19)) | 0;
  n = (n + 0x165667b1 + (n <<  5)) | 0;
  n = (n + 0xd3a2646c ^ (n <<  9)) | 0;
  n = (n + 0xfd7046c5 + (n <<  3)) | 0;
  n = (n ^ 0xb55a4f09 ^ (n >>> 16)) | 0;
  return (n & 0x7fffffff) * 4.656612873077393e-10;
}

// ============================================================================
// WATER TILE SET
// ============================================================================

const _wS = new Set<number>();
let _wR: Map<string, any> | null = null;

function tk(tx: number, ty: number): number {
  return ((tx + 32768) << 16) | ((ty + 32768) & 0xFFFF);
}
function rebuildSet(wt: Map<string, any>): void {
  _wS.clear();
  wt.forEach(t => {
    const tag = t.tileType?.tag;
    if (tag === 'Sea' || tag === 'HotSpringWater') _wS.add(tk(t.worldX | 0, t.worldY | 0));
  });
  _wR = wt;
}

// ============================================================================
// OFFSCREEN CANVAS (CPU fallback)
// ============================================================================

let _oc: HTMLCanvasElement | null = null;
let _ox: CanvasRenderingContext2D | null = null;
let _oi: ImageData | null = null;
let _op: Uint8ClampedArray | null = null;
let _bw = 0, _bh = 0;

const WATER_OVERLAY_THROTTLE_MS = 34;
let _lastRenderTime = 0;
let _lastRenderCw = 0;
let _lastRenderCh = 0;

// ============================================================================
// WEBGL PATH: compositing canvases
// ============================================================================

let _webglCtx: ReturnType<typeof initWaterOverlayWebGL> | undefined = undefined;

// Compositing canvas: receives WebGL output then gets masked via 'source-in'
let _glCompCanvas: HTMLCanvasElement | null = null;
let _glCompCtx: CanvasRenderingContext2D | null = null;
let _glMaskData: ImageData | null = null;
let _glCompW = 0;
let _glCompH = 0;

function ensureGlComp(w: number, h: number): void {
  if (_glCompCanvas && _glCompW === w && _glCompH === h) return;
  if (_glCompCanvas) { _glCompCanvas.width = 0; _glCompCanvas.height = 0; }
  _glCompCanvas = document.createElement('canvas');
  _glCompCanvas.width = w;
  _glCompCanvas.height = h;
  _glCompCtx = _glCompCanvas.getContext('2d')!;
  _glMaskData = new ImageData(w, h);
  _glCompW = w;
  _glCompH = h;
}

function ensureBuf(w: number, h: number): void {
  if (_oc && _bw === w && _bh === h) return;
  if (_oc) { _oc.width = 0; _oc.height = 0; }
  _oc = document.createElement('canvas');
  _oc.width = w; _oc.height = h;
  _ox = _oc.getContext('2d', { willReadFrequently: true })!;
  _oi = _ox.createImageData(w, h);
  _op = _oi.data;
  _bw = w; _bh = h;
}

// ============================================================================
// TILE GRID  (0 = land, TG_I = interior water, bits 0-3 = water edge adjacency)
// ============================================================================

const TG_I = 0x80;
let _tg: Uint8Array | null = null;
let _tC = 0, _tMx = 0, _tMy = 0, _tRw = 0;

function buildGrid(wt: Map<string, any>, ox: number, oy: number, vw: number, vh: number): void {
  if (wt !== _wR) rebuildSet(wt);
  const ts = TILE_SIZE;
  const mx = Math.floor(ox / ts) - 2, my = Math.floor(oy / ts) - 2;
  const Mx = Math.floor((ox + vw) / ts) + 2, My = Math.floor((oy + vh) / ts) + 2;
  const cols = Mx - mx + 1, rows = My - my + 1, sz = cols * rows;

  if (!_tg || _tg.length < sz) _tg = new Uint8Array(sz);
  else _tg.fill(0, 0, sz);

  for (let ty = my; ty <= My; ty++) {
    const ro = (ty - my) * cols;
    for (let tx = mx; tx <= Mx; tx++) if (_wS.has(tk(tx, ty))) _tg[ro + (tx - mx)] = TG_I;
  }
  for (let ty = my; ty <= My; ty++) {
    const r = ty - my, ro = r * cols;
    for (let tx = mx; tx <= Mx; tx++) {
      const c = tx - mx, i = ro + c;
      if (_tg[i] === 0) continue;
      let e = 0;
      if (c === 0          || _tg[ro + c - 1]         === 0) e |= 1;
      if (c === cols - 1   || _tg[ro + c + 1]         === 0) e |= 2;
      if (r === 0          || _tg[(r - 1) * cols + c] === 0) e |= 4;
      if (r === rows - 1   || _tg[(r + 1) * cols + c] === 0) e |= 8;
      if (e) _tg[i] = e;
    }
  }
  _tC = cols; _tRw = rows; _tMx = mx; _tMy = my;
}

// ============================================================================
// WATER MASK BUILDER  (cheap — grid lookup + feathering only, no voronoi)
// ============================================================================

/**
 * Fills maskPx with an alpha-only mask at PX resolution.
 * Returns true if any water pixel was found.
 */
function buildWaterMask(
  maskPx: Uint8ClampedArray,
  bw: number, bh: number,
  camX: number, camY: number,
  grid: Uint8Array, gC: number, gMx: number, gMy: number,
): boolean {
  const ts = TILE_SIZE;
  const invTS = 1.0 / ts;
  let hasWater = false;

  for (let py = 0; py < bh; py++) {
    const wy = camY + py * PX;
    const tileRowY = Math.floor(wy * invTS);
    const gridRowO = (tileRowY - gMy) * gC;
    const lyBase   = wy - tileRowY * ts;

    for (let px = 0; px < bw; px++) {
      const wx = camX + px * PX;
      const idx = (py * bw + px) << 2;

      const tileColX = Math.floor(wx * invTS);
      const gc = tileColX - gMx;
      const v = grid[gridRowO + gc];

      if (v === 0) {
        maskPx[idx] = 0; maskPx[idx + 1] = 0; maskPx[idx + 2] = 0; maskPx[idx + 3] = 0;
        continue;
      }

      hasWater = true;
      let feather = 1.0;
      const edgeFlags = v & 15;

      if (edgeFlags !== 0) {
        const lx = wx - tileColX * ts;
        const ly = lyBase;
        if (edgeFlags & 1) { const d = lx * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 2) { const d = (ts - lx) * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 4) { const d = ly * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 8) { const d = (ts - ly) * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
      }

      // RGB = white (irrelevant for source-in, only alpha matters), A = feathered alpha
      maskPx[idx] = 255; maskPx[idx + 1] = 255; maskPx[idx + 2] = 255;
      maskPx[idx + 3] = feather * 255 + 0.5 | 0;
    }
  }

  return hasWater;
}

// ============================================================================
// INTENSITY
// ============================================================================

let _int = 1.0;

// ============================================================================
// MAIN RENDER
// ============================================================================

function renderShader(
  ctx: CanvasRenderingContext2D,
  camX: number, camY: number,
  cw: number, ch: number,
  tMs: number,
  wt: Map<string, any>,
): void {
  if (cw <= 0 || ch <= 0) return;

  // --- WebGL (GPU) path ---
  if (_webglCtx === undefined) {
    setWaterOverlayContextLostCallback(() => { _webglCtx = undefined; });
    _webglCtx = initWaterOverlayWebGL();
    if (_webglCtx) {
      console.log('[WaterOverlay] Using WebGL (GPU) path');
    } else {
      console.log('[WaterOverlay] WebGL unavailable, using CPU fallback');
      setWaterOverlayContextLostCallback(null);
    }
  }

  if (_webglCtx) {
    buildGrid(wt, camX, camY, cw, ch);
    const grid = _tg!;
    if (grid.length === 0) return;

    // 1. GPU: render voronoi + caustics + ripple for entire viewport
    const ok = renderWaterOverlayWebGL(
      _webglCtx,
      camX, camY, cw, ch,
      tMs, _int,
    );
    if (!ok) {
      _webglCtx = undefined;
      clearWaterOverlayWebGL();
      // fall through to CPU path
    } else {
      // 2. CPU: build water alpha mask (cheap — grid lookup + feathering only)
      const bw = Math.ceil(cw / PX);
      const bh = Math.ceil(ch / PX);
      ensureGlComp(bw, bh);

      const hasWater = buildWaterMask(
        _glMaskData!.data, bw, bh,
        camX, camY,
        grid, _tC, _tMx, _tMy,
      );
      if (!hasWater) return;

      // 3. Composite: put mask on comp canvas, then draw voronoi through it
      const cctx = _glCompCtx!;
      cctx.globalCompositeOperation = 'source-over';
      cctx.clearRect(0, 0, bw, bh);
      // Put mask pixels directly (putImageData ignores composite/transform state)
      cctx.putImageData(_glMaskData!, 0, 0);
      // Draw voronoi, keeping only where mask alpha > 0
      cctx.globalCompositeOperation = 'source-in';
      cctx.drawImage(_webglCtx.canvas, 0, 0, _webglCtx.canvas.width, _webglCtx.canvas.height, 0, 0, bw, bh);
      cctx.globalCompositeOperation = 'source-over';

      // 4. Draw composited result onto main canvas (scale up from PX resolution)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(_glCompCanvas!, 0, 0, bw, bh, 0, 0, cw, ch);
      ctx.restore();
      return;
    }
  }

  // --- CPU fallback ---
  const bw = Math.ceil(cw / PX), bh = Math.ceil(ch / PX);
  if (bw <= 0 || bh <= 0) return;
  ensureBuf(bw, bh);

  const now = tMs;
  const canSkip = _oc && _ox &&
    (now - _lastRenderTime) < WATER_OVERLAY_THROTTLE_MS &&
    _lastRenderCw === cw && _lastRenderCh === ch;
  if (canSkip) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(_oc!, 0, 0, cw, ch);
    ctx.restore();
    return;
  }

  const px = _op!;
  const t  = tMs * 0.001;
  const intA = _int;
  const ts = TILE_SIZE;
  const invTS = 1.0 / ts;

  const tAnim = t * VA;
  const tCa1 = t * CA1S, tCa2 = t * CA2S;
  const tDX = t * DSX, tDY = t * DSY;
  const tR = t * RS;

  buildGrid(wt, camX, camY, cw, ch);
  const grid = _tg!, gC = _tC, gMx = _tMx, gMy = _tMy;

  for (let py = 0; py < bh; py++) {
    const wy = camY + py * PX;
    const rowOff = py * bw;

    const tileRowY  = Math.floor(wy * invTS);
    const gridRowO  = (tileRowY - gMy) * gC;
    const lyBase    = wy - tileRowY * ts;
    const distRowX  = fsin(wy * DFX + tDX) * DAX;

    for (let ppx = 0; ppx < bw; ppx++) {
      const wx  = camX + ppx * PX;
      const idx = (rowOff + ppx) << 2;

      const tileColX = Math.floor(wx * invTS);
      const gc = tileColX - gMx;
      const v  = grid[gridRowO + gc];

      if (v === 0) {
        px[idx] = 0; px[idx + 1] = 0; px[idx + 2] = 0; px[idx + 3] = 0;
        continue;
      }

      const lx = wx - tileColX * ts;
      const ly = lyBase;
      let feather = 1.0;
      const edgeFlags = v & 15;

      if (edgeFlags !== 0) {
        if (edgeFlags & 1) { const d = lx * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 2) { const d = (ts - lx) * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 4) { const d = ly * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
        if (edgeFlags & 8) { const d = (ts - ly) * INV_F; if (d < 1) feather *= d * d * (3 - 2 * d); }
      }

      if (feather <= 0) {
        px[idx] = 0; px[idx + 1] = 0; px[idx + 2] = 0; px[idx + 3] = 0;
        continue;
      }

      const dX = wx + distRowX;
      const dY = wy + fsin(wx * DFY + tDY) * DAY;

      const sx = dX * VS, sy = dY * VS;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      const fx = sx - ix, fy = sy - iy;

      const i0 = fx < 0.5 ? -1 : 0;
      const j0 = fy < 0.5 ? -1 : 0;

      let d1sq = 8.0, d2sq = 8.0;

      for (let cj = j0; cj <= j0 + 1; cj++) {
        const ncy = iy + cj;
        for (let ci = i0; ci <= i0 + 1; ci++) {
          const ncx = ix + ci;

          const h  = jh((ncx * 1597 + ncy * 51749) | 0);
          const hy = (h * 7.931) % 1.0;
          const drift = fsin(tAnim + h * TWO_PI) * VW;

          const ox = ci + 0.5 + (h  - 0.5) * 0.3 + drift;
          const oy = cj + 0.5 + (hy - 0.5) * 0.3 + drift * 0.73;

          const ddx = ox - fx, ddy = oy - fy;
          const dsq = ddx * ddx + ddy * ddy;

          if (dsq < d1sq) { d2sq = d1sq; d1sq = dsq; }
          else if (dsq < d2sq) { d2sq = dsq; }
        }
      }

      const crest    = 1.0 - sst(0.0, VE, d2sq - d1sq);
      const cellShade = sst(0.0, VCS, d1sq);

      const caustic = sst(0.3, 0.7,
        fsin(wx * CA1X + wy * CA1Y + tCa1) *
        fsin(wx * CA2X - wy * CA2Y + tCa2) + 0.5);

      const ripple = sst(0.83, 1.0,
        fsin(wx * RFX + wy * RFY + tR) * 0.5 + 0.5);

      const bright = crest * WCR + caustic * WCA + ripple * WRI + cellShade * WCS;

      const a = (BA + bright * RA) * intA * feather;
      px[idx]     = BR + bright * RR;
      px[idx + 1] = BG + bright * RG;
      px[idx + 2] = OB;
      px[idx + 3] = a;
    }
  }

  _ox!.putImageData(_oi!, 0, 0);

  _lastRenderTime = now;
  _lastRenderCw = cw;
  _lastRenderCh = ch;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(_oc!, 0, 0, cw, ch);
  ctx.restore();
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function renderWaterOverlay(
  ctx: CanvasRenderingContext2D,
  cameraX: number, cameraY: number,
  canvasWidth: number, canvasHeight: number,
  _deltaTime: number,
  worldTiles?: Map<string, any>,
  currentTime?: number,
): void {
  if (!worldTiles || worldTiles.size === 0) return;
  renderShader(ctx, cameraX, cameraY, canvasWidth, canvasHeight,
    currentTime ?? performance.now(), worldTiles);
}

export function clearWaterOverlay(): void {
  _oc = null; _ox = null; _oi = null; _op = null; _bw = 0; _bh = 0;
  _lastRenderTime = 0;
  _lastRenderCw = 0;
  _lastRenderCh = 0;
  _glCompCanvas = null; _glCompCtx = null; _glMaskData = null; _glCompW = 0; _glCompH = 0;
  _webglCtx = undefined;
  setWaterOverlayContextLostCallback(null);
  clearWaterOverlayWebGL();
}
export function getWaterLineCount(): number { return _bw * _bh; }
export function getWaterSparkleCount(): number { return 0; }
export function setWaterOverlayIntensity(intensity: number): void {
  _int = Math.max(0, Math.min(1, intensity));
}

import { TILE_SIZE } from '../../config/gameConfig';
import {
  initWaterOverlayWebGL,
  renderWaterOverlayWebGL,
  clearWaterOverlayWebGL,
  setWaterOverlayContextLostCallback,
} from './waterOverlayWebGL';

/**
 * waterOverlayUtils - Water surface overlay (voronoi, caustics, ripples).
 *
 * Renders the water overlay on top of sea/hotspring tiles. WebGL-only—delegates
 * to waterOverlayWebGL for GPU rendering. When WebGL is unavailable, no overlay
 * is drawn (avoids expensive CPU fallback).
 *
 * Responsibilities:
 * 1. TILE SET: rebuildSet extracts water tiles (Sea, HotSpringWater) from
 *    world tiles. Used for overlay compositing.
 *
 * 2. WEBGL PATH: initWaterOverlayWebGL, renderWaterOverlayWebGL. Compositing
 *    canvases for voronoi, caustics, ripple effects. Shader-based.
 *
 * 3. SHORELINE: Feathering for smooth blend at water edges. INV_F, FEATH.
 *
 * 4. CONTEXT LOST: setWaterOverlayContextLostCallback for WebGL recovery.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const PX = 4; // shader texel size — bilinear-scaled up

// --- Shoreline feathering ---
const FEATH = 14;
const INV_F = 1.0 / FEATH;

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
    if (tag === 'Sea' || tag === 'HotSpringWater' || tag === 'DeepSea') _wS.add(tk(t.worldX | 0, t.worldY | 0));
  });
  _wR = wt;
}

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
      console.log('[WaterOverlay] WebGL unavailable, skipping overlay');
      setWaterOverlayContextLostCallback(null);
      return;
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
      return;
    }
    {
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
  _glCompCanvas = null; _glCompCtx = null; _glMaskData = null; _glCompW = 0; _glCompH = 0;
  _webglCtx = undefined;
  setWaterOverlayContextLostCallback(null);
  clearWaterOverlayWebGL();
}
export function getWaterLineCount(): number { return 0; }
export function getWaterSparkleCount(): number { return 0; }
export function setWaterOverlayIntensity(intensity: number): void {
  _int = Math.max(0, Math.min(1, intensity));
}

import { TILE_SIZE } from '../../config/gameConfig';

/**
 * Water Overlay Rendering Utilities
 *
 * High-performance multi-sine cellular shader with bilinear-scaled output
 * and per-tile shoreline feathering.  Targets <5 ms on a 1080p viewport.
 *
 * Architecture:
 *   1. Build a per-tile bitmask encoding water/land + shore adjacency.
 *   2. Evaluate a lightweight sine-interference shader at 1/PX resolution.
 *   3. putImageData → drawImage with bilinear upscale (smooth, not blocky).
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const TWO_PI = 6.283185307179586;

/**
 * Shader texel size in screen pixels.
 * Buffer is 1/PX the viewport resolution, then bilinear-scaled up.
 */
const PX = 4;

// --- Multi-sine crest pattern (cellular approximation — replaces voronoi) ---
const CR1X = 0.032; const CR1Y = 0.018; const CR1S =  0.50;
const CR2X = 0.018; const CR2Y = 0.028; const CR2S = -0.40;
const CR3X = 0.024; const CR3Y = 0.036; const CR3S =  0.35;

// --- Caustic sine-interference ---
const CA1X = 0.031; const CA1Y = 0.013; const CA1S = 1.40;
const CA2X = 0.017; const CA2Y = 0.023; const CA2S = 1.10;

// --- UV distortion ---
const DFX = 0.018; const DSX = 1.50; const DAX = 3.0;
const DFY = 0.014; const DSY = 1.20; const DAY = 2.5;

// --- Ripple band ---
const RF1X = 0.042; const RF1Y = 0.016; const RS1 = 2.00;

// --- Specular sparkle ---
const SPX = 0.089; const SPS1 = 3.20;
const SPY = 0.097; const SPS2 = 2.80;

// --- Layer weights ---
const WC = 0.50;   // crests
const WA = 0.28;   // caustics
const WR = 0.16;   // ripple
const WS = 0.28;   // sparkle

// --- Output colour / alpha ---
const BR = 225; const RR = 30;
const BG = 240; const RG = 15;
const OB = 255;
const BA = 4;    // base alpha
const RA = 85;   // alpha range

// --- Shoreline feathering ---
const FEATH = 14;             // feather distance in world pixels
const INV_F = 1.0 / FEATH;

// ============================================================================
// SINE LUT  (4096 entries ≈ 16 KB — avoids Math.sin in hot loop)
// ============================================================================

const SN   = 4096;
const SMSK = SN - 1;
const SSCL = SN / TWO_PI;
const SLUT = new Float32Array(SN);
for (let i = 0; i < SN; i++) SLUT[i] = Math.sin((i / SN) * TWO_PI);

function fsin(x: number): number {
  let i = (x * SSCL) % SN;
  if (i < 0) i += SN;
  return SLUT[i & SMSK];
}

// ============================================================================
// SMOOTHSTEP
// ============================================================================

function ss(e0: number, e1: number, x: number): number {
  if (x <= e0) return 0;
  if (x >= e1) return 1;
  const t = (x - e0) / (e1 - e0);
  return t * t * (3.0 - 2.0 * t);
}

// ============================================================================
// WATER TILE SET
// ============================================================================

const _wSet = new Set<number>();
let   _wSrc: Map<string, any> | null = null;

function tkey(tx: number, ty: number): number {
  return ((tx + 32768) << 16) | ((ty + 32768) & 0xFFFF);
}

function rebuildSet(wt: Map<string, any>): void {
  _wSet.clear();
  wt.forEach(t => {
    if (t.tileType && t.tileType.tag === 'Sea') _wSet.add(tkey(t.worldX | 0, t.worldY | 0));
  });
  _wSrc = wt;
}

// ============================================================================
// OFFSCREEN CANVAS
// ============================================================================

let _oc: HTMLCanvasElement | null = null;
let _ox: CanvasRenderingContext2D | null = null;
let _oi: ImageData | null = null;
let _op: Uint8ClampedArray | null = null;
let _bw = 0, _bh = 0;

function ensureBuf(w: number, h: number): void {
  if (_oc && _bw === w && _bh === h) return;
  _oc = document.createElement('canvas');
  _oc.width = w; _oc.height = h;
  _ox = _oc.getContext('2d', { willReadFrequently: true })!;
  _oi = _ox.createImageData(w, h);
  _op = _oi.data;
  _bw = w; _bh = h;
}

// ============================================================================
// PER-FRAME TILE GRID
//   0          → land
//   TG_INT     → interior water (no adjacent land)
//   bits 0-3   → which cardinal neighbours are land (for feathering)
// ============================================================================

const TG_INT = 0x80;
let _tg: Uint8Array | null = null;
let _tgC = 0, _tgR = 0, _tgMx = 0, _tgMy = 0;

function buildGrid(
  wt: Map<string, any>,
  ox: number, oy: number, vw: number, vh: number,
): void {
  if (wt !== _wSrc) rebuildSet(wt);

  const mx = Math.floor(ox / TILE_SIZE) - 2;
  const my = Math.floor(oy / TILE_SIZE) - 2;
  const Mx = Math.floor((ox + vw) / TILE_SIZE) + 2;
  const My = Math.floor((oy + vh) / TILE_SIZE) + 2;
  const cols = Mx - mx + 1;
  const rows = My - my + 1;
  const sz   = cols * rows;

  if (!_tg || _tg.length < sz) _tg = new Uint8Array(sz);
  else _tg.fill(0, 0, sz);

  // Pass 1 — mark water
  for (let ty = my; ty <= My; ty++) {
    const ro = (ty - my) * cols;
    for (let tx = mx; tx <= Mx; tx++) {
      if (_wSet.has(tkey(tx, ty))) _tg[ro + (tx - mx)] = TG_INT;
    }
  }

  // Pass 2 — tag shore adjacency
  for (let ty = my; ty <= My; ty++) {
    const r = ty - my, ro = r * cols;
    for (let tx = mx; tx <= Mx; tx++) {
      const c = tx - mx, i = ro + c;
      if (_tg[i] === 0) continue;
      let e = 0;
      if (c === 0        || _tg[ro + c - 1]         === 0) e |= 1;
      if (c === cols - 1  || _tg[ro + c + 1]         === 0) e |= 2;
      if (r === 0        || _tg[(r - 1) * cols + c] === 0) e |= 4;
      if (r === rows - 1  || _tg[(r + 1) * cols + c] === 0) e |= 8;
      if (e) _tg[i] = e;
    }
  }

  _tgC = cols; _tgR = rows; _tgMx = mx; _tgMy = my;
}

// ============================================================================
// INTENSITY
// ============================================================================

let _intMul = 1.0;

// ============================================================================
// MAIN SHADER
// ============================================================================

function renderShader(
  ctx: CanvasRenderingContext2D,
  camX: number, camY: number,
  cw: number, ch: number,
  tMs: number,
  wt: Map<string, any>,
): void {
  const bw = Math.ceil(cw / PX);
  const bh = Math.ceil(ch / PX);
  if (bw <= 0 || bh <= 0) return;
  ensureBuf(bw, bh);

  const px  = _op!;
  const t   = tMs * 0.001;
  const intA = _intMul;

  // Pre-compute time-dependent offsets (constant for the whole frame)
  const tCr1 = t * CR1S, tCr2 = t * CR2S, tCr3 = t * CR3S;
  const tCa1 = t * CA1S, tCa2 = t * CA2S;
  const tDX  = t * DSX,  tDY  = t * DSY;
  const tR1  = t * RS1;
  const tSp1 = t * SPS1, tSp2 = t * SPS2;

  buildGrid(wt, camX, camY, cw, ch);

  const grid = _tg!;
  const gCols = _tgC, gMx = _tgMx, gMy = _tgMy;
  const ts = TILE_SIZE;
  const invTS = 1.0 / ts;

  for (let py = 0; py < bh; py++) {
    const wy     = camY + py * PX;
    const rowOff = py * bw;

    // --- Per-row pre-computation ---
    const tileRowY = Math.floor(wy * invTS);
    const gridRowR = tileRowY - gMy;
    const gridRowO = gridRowR * gCols;
    const lyBase   = wy - tileRowY * ts;           // local Y within tile
    const distRowX = fsin(wy * DFX + tDX) * DAX;   // UV distort X (constant for row)

    for (let ppx = 0; ppx < bw; ppx++) {
      const wx  = camX + ppx * PX;
      const idx = (rowOff + ppx) << 2;

      // ---- Tile grid lookup (inlined for speed) ----
      const tileColX = Math.floor(wx * invTS);
      const gc = tileColX - gMx;
      const gi = gridRowO + gc;
      const v  = grid[gi];

      if (v === 0) { // land — transparent
        px[idx] = 0; px[idx + 1] = 0; px[idx + 2] = 0; px[idx + 3] = 0;
        continue;
      }

      // ---- Feather (only for shore-adjacent tiles) ----
      let feather = 1.0;
      if (v !== TG_INT) {
        const lx = wx - tileColX * ts;
        const ly = lyBase; // same tileRowY → same ly
        if (v & 1) { const d = lx * INV_F; if (d < 1) { feather *= d * d * (3 - 2 * d); } }
        if (v & 2) { const d = (ts - lx) * INV_F; if (d < 1) { feather *= d * d * (3 - 2 * d); } }
        if (v & 4) { const d = ly * INV_F; if (d < 1) { feather *= d * d * (3 - 2 * d); } }
        if (v & 8) { const d = (ts - ly) * INV_F; if (d < 1) { feather *= d * d * (3 - 2 * d); } }
        if (feather <= 0) {
          px[idx] = 0; px[idx + 1] = 0; px[idx + 2] = 0; px[idx + 3] = 0;
          continue;
        }
      }

      // ---- UV distortion ----
      const dX = wx + distRowX;
      const dY = wy + fsin(wx * DFY + tDY) * DAY;

      // ---- Crests (multi-sine cellular approximation) ----
      const cr1 = fsin(dX * CR1X + dY * CR1Y + tCr1);
      const cr2 = fsin(dX * CR2X - dY * CR2Y + tCr2);
      const cr3 = fsin(dX * CR3X + dY * CR3Y + tCr3);
      // abs-sum creates cell-like interference ridges
      const cell = Math.abs(cr1 + cr2) + Math.abs(cr2 + cr3);
      const crest = ss(0.8, 1.6, cell);

      // ---- Caustics ----
      const caustic = ss(0.3, 0.7,
        fsin(wx * CA1X + wy * CA1Y + tCa1) *
        fsin(wx * CA2X - wy * CA2Y + tCa2) + 0.5);

      // ---- Ripple band ----
      const ripple = ss(0.83, 1.0,
        fsin(wx * RF1X + wy * RF1Y + tR1) * 0.5 + 0.5);

      // ---- Specular sparkle ----
      const sparkle = ss(0.85, 1.0,
        fsin(wx * SPX + tSp1) * fsin(wy * SPY + tSp2));

      // ---- Combine ----
      const bright = crest * WC + caustic * WA + ripple * WR + sparkle * WS;

      // ---- Write RGBA ----
      const a = (BA + bright * RA) * intA * feather;
      px[idx]     = BR + bright * RR;
      px[idx + 1] = BG + bright * RG;
      px[idx + 2] = OB;
      px[idx + 3] = a;
    }
  }

  // --- Blit ---
  _ox!.putImageData(_oi!, 0, 0);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Bilinear upscale — smooth, not blocky
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low'; // fastest interpolation
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
}

export function getWaterLineCount(): number { return _bw * _bh; }
export function getWaterSparkleCount(): number { return 0; }

export function setWaterOverlayIntensity(intensity: number): void {
  _intMul = Math.max(0, Math.min(1, intensity));
}

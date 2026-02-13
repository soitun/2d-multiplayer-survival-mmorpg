/**
 * Shoreline Overlay Utilities
 *
 * Renders a thin light-blue shoreline at the beach/sea boundary, plus
 * procedural sine-wave lines that pulse out from the shore and fade.
 *
 * Uses pre-computed shoreline mask (thin edge only, no dots) and draws
 * waves procedurally each frame.
 */

import { TILE_SIZE as AUTOTILE_TILE_SIZE, TILESET_COLS, TILESET_ROWS } from '../dualGridAutotile';

// Import tileset for mask generation
import beachSeaAutotileUrl from '../../assets/tiles/new/tileset_beach_sea_autotile.png';

// =============================================================================
// CONSTANTS
// =============================================================================

const EDGE_THRESHOLD = 22;            // Min warmth difference (stricter = fewer dots)
const WAVE_PULSE_RATE = 4;           // Wave pulse cycles per second
const WAVE_COUNT = 5;                // Number of wave lines (staggered)
const WAVE_PULSE_DURATION = 0.45;    // Fraction of cycle for expand+fade (0-1)
const WAVE_MAX_SCALE = 1.06;         // How far wave expands into water
const WAVE_AMPLITUDE = 0.008;        // Sine wave amplitude (as fraction of tile)
const WAVE_FREQ = 12;                // Sine wave frequency

// Refined blue - clearer, slightly lighter than sea
const SHORE_COLOR = { r: 145, g: 190, b: 225 };
const WAVE_COLOR = 'rgb(160, 205, 240)';

// Warmth: positive = sand (yellow/brown), negative = water (blue)
const getWarmth = (r: number, g: number, b: number): number =>
  (r + g) - b * 1.4;

// =============================================================================
// SHORELINE MASK CACHE
// =============================================================================

interface ShorelineMaskCache {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ready: boolean;
}

let maskCache: ShorelineMaskCache | null = null;
let maskLoadPromise: Promise<ShorelineMaskCache | null> | null = null;

/** 8-neighbor offsets for connectivity check */
const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];

/**
 * Edge-based boundary detection: find pixels where warm (sand) meets cool (water).
 * Strict connectivity removes ALL isolated dots - only continuous edge remains.
 */
function processTileRegion(
  data: Uint8ClampedArray,
  tileW: number,
  tileH: number,
  stride: number
): Uint8Array {
  const edgeMask = new Uint8Array(tileW * tileH * 4);
  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];

  for (let y = 0; y < tileH; y++) {
    for (let x = 0; x < tileW; x++) {
      const idx = y * tileW + x;
      const i = y * stride + x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 64) continue;

      const warmth = getWarmth(r, g, b);

      let maxNeighborWarmth = -999;
      for (let k = 0; k < 4; k++) {
        const nx = x + dx[k];
        const ny = y + dy[k];
        if (nx < 0 || nx >= tileW || ny < 0 || ny >= tileH) continue;
        const ni = ny * stride + nx * 4;
        if (data[ni + 3] < 64) continue;
        const nw = getWarmth(data[ni], data[ni + 1], data[ni + 2]);
        maxNeighborWarmth = Math.max(maxNeighborWarmth, nw);
      }

      const atBoundary = (maxNeighborWarmth - warmth) >= EDGE_THRESHOLD;
      const onWaterSide = warmth < maxNeighborWarmth;

      if (atBoundary && onWaterSide) {
        const base = idx * 4;
        const alpha = Math.min(255, Math.max(0, 220 - Math.abs(warmth) * 2));
        edgeMask[base] = SHORE_COLOR.r;
        edgeMask[base + 1] = SHORE_COLOR.g;
        edgeMask[base + 2] = SHORE_COLOR.b;
        edgeMask[base + 3] = alpha;
      }
    }
  }

  // Remove dots: keep only pixels with 2+ edge neighbors (removes isolated specks, keeps line)
  const cleaned = new Uint8Array(tileW * tileH * 4);
  for (let y = 0; y < tileH; y++) {
    for (let x = 0; x < tileW; x++) {
      const idx = y * tileW + x;
      const base = idx * 4;
      if (edgeMask[base + 3] === 0) continue;
      let edgeNeighbors = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX8[k];
        const ny = y + DY8[k];
        if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
          if (edgeMask[(ny * tileW + nx) * 4 + 3] > 0) edgeNeighbors++;
        }
      }
      if (edgeNeighbors >= 2) {
        cleaned[base] = edgeMask[base];
        cleaned[base + 1] = edgeMask[base + 1];
        cleaned[base + 2] = edgeMask[base + 2];
        cleaned[base + 3] = edgeMask[base + 3];
      }
    }
  }

  // Shoreline: thin line only (1px dilate) - no thick band, no dots
  const shoreline = new Uint8Array(tileW * tileH * 4);
  const expand = 1;
  for (let y = 0; y < tileH; y++) {
    for (let x = 0; x < tileW; x++) {
      const idx = y * tileW + x;
      let maxA = cleaned[idx * 4 + 3];
      for (let dy = -expand; dy <= expand; dy++) {
        for (let dx = -expand; dx <= expand; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
            maxA = Math.max(maxA, cleaned[(ny * tileW + nx) * 4 + 3]);
          }
        }
      }
      if (maxA > 0) {
        const base = idx * 4;
        shoreline[base] = SHORE_COLOR.r;
        shoreline[base + 1] = SHORE_COLOR.g;
        shoreline[base + 2] = SHORE_COLOR.b;
        shoreline[base + 3] = Math.min(255, maxA + 60);
      }
    }
  }

  return shoreline;
}

/**
 * Generate thin shoreline mask from tileset.
 * Same layout as tileset: 4x5 grid of 128x128 tiles.
 */
async function generateShorelineMask(tilesetImg: HTMLImageElement): Promise<HTMLCanvasElement> {
  const fullW = tilesetImg.naturalWidth;
  const fullH = tilesetImg.naturalHeight;

  const off = document.createElement('canvas');
  off.width = fullW;
  off.height = fullH;
  const offCtx = off.getContext('2d')!;
  offCtx.drawImage(tilesetImg, 0, 0);
  const imgData = offCtx.getImageData(0, 0, fullW, fullH);
  const data = imgData.data;
  const stride = fullW * 4;

  const shoreCanvas = document.createElement('canvas');
  shoreCanvas.width = fullW;
  shoreCanvas.height = fullH;
  const shoreCtx = shoreCanvas.getContext('2d')!;
  const shoreData = shoreCtx.createImageData(fullW, fullH);

  for (let row = 0; row < TILESET_ROWS; row++) {
    for (let col = 0; col < TILESET_COLS; col++) {
      const sx = col * AUTOTILE_TILE_SIZE;
      const sy = row * AUTOTILE_TILE_SIZE;

      if (sx + AUTOTILE_TILE_SIZE > fullW || sy + AUTOTILE_TILE_SIZE > fullH) continue;

      const tileData = new Uint8ClampedArray(AUTOTILE_TILE_SIZE * AUTOTILE_TILE_SIZE * 4);
      for (let y = 0; y < AUTOTILE_TILE_SIZE; y++) {
        for (let x = 0; x < AUTOTILE_TILE_SIZE; x++) {
          const srcIdx = (sy + y) * stride + (sx + x) * 4;
          const dstIdx = (y * AUTOTILE_TILE_SIZE + x) * 4;
          tileData[dstIdx] = data[srcIdx];
          tileData[dstIdx + 1] = data[srcIdx + 1];
          tileData[dstIdx + 2] = data[srcIdx + 2];
          tileData[dstIdx + 3] = data[srcIdx + 3];
        }
      }

      const shoreline = processTileRegion(
        tileData,
        AUTOTILE_TILE_SIZE,
        AUTOTILE_TILE_SIZE,
        AUTOTILE_TILE_SIZE * 4
      );

      for (let y = 0; y < AUTOTILE_TILE_SIZE; y++) {
        for (let x = 0; x < AUTOTILE_TILE_SIZE; x++) {
          const srcIdx = (y * AUTOTILE_TILE_SIZE + x) * 4;
          const outIdx = ((sy + y) * fullW + (sx + x)) * 4;
          if (shoreline[srcIdx + 3] > 0) {
            shoreData.data[outIdx] = shoreline[srcIdx];
            shoreData.data[outIdx + 1] = shoreline[srcIdx + 1];
            shoreData.data[outIdx + 2] = shoreline[srcIdx + 2];
            shoreData.data[outIdx + 3] = shoreline[srcIdx + 3];
          }
        }
      }
    }
  }

  shoreCtx.putImageData(shoreData, 0, 0);
  return shoreCanvas;
}

/**
 * Load and initialize the shoreline mask.
 * Pass preloaded Beach_Sea image from tile cache to avoid delay.
 */
export async function initShorelineMask(beachSeaImage?: HTMLImageElement | null): Promise<ShorelineMaskCache | null> {
  if (maskCache?.ready) return maskCache;
  if (maskLoadPromise) return maskLoadPromise;

  maskLoadPromise = (async () => {
    try {
      let img: HTMLImageElement;
      if (beachSeaImage?.complete && beachSeaImage.naturalWidth > 0) {
        img = beachSeaImage;
      } else {
        img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load beach_sea tileset'));
          img.src = beachSeaAutotileUrl;
        });
      }

      const shoreline = await generateShorelineMask(img);
      maskCache = {
        canvas: shoreline,
        ctx: shoreline.getContext('2d')!,
        ready: true,
      };
      return maskCache;
    } catch (e) {
      console.warn('[ShorelineOverlay] Failed to generate mask:', e);
      return null;
    }
  })();

  return maskLoadPromise;
}

/**
 * Render the animated shoreline overlay for a single Beach_Sea tile.
 * Call from ProceduralWorldRenderer when drawing Beach_Sea transitions.
 *
 * @param ctx - Canvas context (already translated and clipped if needed)
 * @param spriteCoords - Source rect in tileset { x, y, width, height }
 * @param destX - Destination X in screen space
 * @param destY - Destination Y in screen space
 * @param destSize - Destination size (pixelSize)
 * @param flipHorizontal - Whether tile was flipped
 * @param flipVertical - Whether tile was flipped
 * @param currentTimeMs - Current time for animation
 */
export function renderShorelineOverlay(
  ctx: CanvasRenderingContext2D,
  spriteCoords: { x: number; y: number; width: number; height: number },
  destX: number,
  destY: number,
  destSize: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
  currentTimeMs: number
): void {
  const t = currentTimeMs * 0.001;

  ctx.save();

  if (flipHorizontal || flipVertical) {
    const centerX = destX + destSize / 2;
    const centerY = destY + destSize / 2;
    ctx.translate(centerX, centerY);
    if (flipHorizontal) ctx.scale(-1, 1);
    if (flipVertical) ctx.scale(1, -1);
    ctx.translate(-centerX, -centerY);
  }

  if (!maskCache?.ready) {
    ctx.restore();
    return;
  }

  const centerX = destX + destSize / 2;
  const centerY = destY + destSize / 2;

  // Layer 1: Shoreline - thin static blue line, no animation
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
  ctx.drawImage(
    maskCache.canvas,
    Math.floor(spriteCoords.x),
    Math.floor(spriteCoords.y),
    Math.floor(spriteCoords.width),
    Math.floor(spriteCoords.height),
    destX,
    destY,
    Math.floor(destSize),
    Math.floor(destSize)
  );

  // Layer 2: Procedural sine wave lines - pulse out from shore, fade quickly
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let w = 0; w < WAVE_COUNT; w++) {
    const phase = (t * WAVE_PULSE_RATE + w / WAVE_COUNT) % 1;
    if (phase >= WAVE_PULSE_DURATION) continue;
    const pulseProgress = phase / WAVE_PULSE_DURATION;
    const waveScale = 1 + pulseProgress * (WAVE_MAX_SCALE - 1);
    const waveAlpha = 0.55 * (1 - pulseProgress);
    const wavePhase = t * 4 + w * 1.2;

    ctx.globalAlpha = waveAlpha;
    ctx.strokeStyle = WAVE_COLOR;
    ctx.lineWidth = Math.max(1, destSize * 0.008);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(waveScale, waveScale);
    ctx.translate(-centerX, -centerY);

    // Draw sine wave lines across the tile
    const baseYs = [0.35, 0.5, 0.65];
    for (const frac of baseYs) {
      const baseY = destY + destSize * frac;
      ctx.beginPath();
      const steps = Math.max(20, Math.floor(destSize / 4));
      for (let i = 0; i <= steps; i++) {
        const x = destX + (destSize * i) / steps;
        const y = baseY + destSize * WAVE_AMPLITUDE * Math.sin((x / destSize) * WAVE_FREQ * Math.PI * 2 + wavePhase);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/**
 * Check if shoreline overlay is ready to render.
 */
export function isShorelineMaskReady(): boolean {
  return maskCache?.ready ?? false;
}

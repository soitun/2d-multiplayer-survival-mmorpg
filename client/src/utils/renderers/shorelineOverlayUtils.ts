/**
 * Shoreline Overlay Utilities
 *
 * Renders a thin light-blue shoreline at the beach/sea boundary. The edge
 * pixels periodically fan out into the water and fade - like water pushing
 * from the shore.
 *
 * Uses pre-computed shoreline mask (thin edge only, no dots).
 */

import { TILE_SIZE as AUTOTILE_TILE_SIZE, TILESET_COLS, TILESET_ROWS } from '../dualGridAutotile';

// Import tilesets for mask generation
import beachSeaAutotileUrl from '../../assets/tiles/new/tileset_beach_sea_autotile.png';
import beachHotSpringWaterAutotileUrl from '../../assets/tiles/new/tileset_beach_hotspringwater_autotile.png';

// =============================================================================
// CONSTANTS
// =============================================================================

const EDGE_THRESHOLD = 33;            // Min warmth difference (stricter = fewer dots)
const WAVE_SPEED = 2.8;               // Wave cycle speed (rad/s)
const WAVE_OFFSET_PX = 2.8;           // Pixels the edge shifts (visible motion)
const WAVE_LAYERS = 3;                  // Fading layers that trail the main edge

// Refined blue - main shoreline edge
const SHORE_COLOR = { r: 145, g: 190, b: 225 };
// Frothy beach water color - wave layers fade toward this
const BEACH_COLOR = { r: 200, g: 225, b: 235 };

// Warmth: positive = sand (yellow/brown), negative = water (blue)
const getWarmth = (r: number, g: number, b: number): number =>
  (r + g) - b * 1.4;

// =============================================================================
// SHORELINE MASK CACHE
// =============================================================================

interface ShorelineMaskCache {
  canvas: HTMLCanvasElement;
  waveCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ready: boolean;
}

let maskCache: ShorelineMaskCache | null = null;
let maskLoadPromise: Promise<ShorelineMaskCache | null> | null = null;

let hotSpringMaskCache: ShorelineMaskCache | null = null;
let hotSpringMaskLoadPromise: Promise<ShorelineMaskCache | null> | null = null;

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

  // Shoreline: thin line, dilate only toward shore (sand) - never into water
  const shoreline = new Uint8Array(tileW * tileH * 4);
  const expand = 1;
  for (let y = 0; y < tileH; y++) {
    for (let x = 0; x < tileW; x++) {
      const idx = y * tileW + x;
      const i = y * stride + x * 4;
      const myWarmth = getWarmth(data[i], data[i + 1], data[i + 2]);
      let maxA = cleaned[idx * 4 + 3];
      let addPixel = maxA > 0;
      if (!addPixel) {
        for (let dy = -expand; dy <= expand; dy++) {
          for (let dx = -expand; dx <= expand; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < tileW && ny >= 0 && ny < tileH) {
              const nIdx = ny * tileW + nx;
              const nA = cleaned[nIdx * 4 + 3];
              if (nA > 0) {
                const ni = ny * stride + nx * 4;
                const nWarmth = getWarmth(data[ni], data[ni + 1], data[ni + 2]);
                if (myWarmth >= nWarmth) {
                  maxA = Math.max(maxA, nA);
                  addPixel = true;
                }
              }
            }
          }
        }
      }
      if (addPixel && maxA > 0) {
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
async function generateShorelineMasks(tilesetImg: HTMLImageElement): Promise<{ shoreCanvas: HTMLCanvasElement; waveCanvas: HTMLCanvasElement }> {
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

  // Wave mask: same shape, beachy color (transitions blue → sand, not white)
  const waveCanvas = document.createElement('canvas');
  waveCanvas.width = fullW;
  waveCanvas.height = fullH;
  const waveCtx = waveCanvas.getContext('2d')!;
  waveCtx.drawImage(shoreCanvas, 0, 0);
  const waveData = waveCtx.getImageData(0, 0, fullW, fullH);
  const wavePixels = waveData.data;
  for (let i = 0; i < wavePixels.length; i += 4) {
    if (wavePixels[i + 3] > 0) {
      wavePixels[i] = BEACH_COLOR.r;
      wavePixels[i + 1] = BEACH_COLOR.g;
      wavePixels[i + 2] = BEACH_COLOR.b;
    }
  }
  waveCtx.putImageData(waveData, 0, 0);

  return { shoreCanvas, waveCanvas };
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

      const { shoreCanvas, waveCanvas } = await generateShorelineMasks(img);
      maskCache = {
        canvas: shoreCanvas,
        waveCanvas,
        ctx: shoreCanvas.getContext('2d')!,
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
 * Load and initialize the shoreline mask for Beach_HotSpringWater transitions.
 * Pass preloaded Beach_HotSpringWater image from tile cache to avoid delay.
 */
export async function initHotSpringShorelineMask(beachHotSpringWaterImage?: HTMLImageElement | null): Promise<ShorelineMaskCache | null> {
  if (hotSpringMaskCache?.ready) return hotSpringMaskCache;
  if (hotSpringMaskLoadPromise) return hotSpringMaskLoadPromise;

  hotSpringMaskLoadPromise = (async () => {
    try {
      let img: HTMLImageElement;
      if (beachHotSpringWaterImage?.complete && beachHotSpringWaterImage.naturalWidth > 0) {
        img = beachHotSpringWaterImage;
      } else {
        img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load beach_hotspringwater tileset'));
          img.src = beachHotSpringWaterAutotileUrl;
        });
      }

      const { shoreCanvas, waveCanvas } = await generateShorelineMasks(img);
      hotSpringMaskCache = {
        canvas: shoreCanvas,
        waveCanvas,
        ctx: shoreCanvas.getContext('2d')!,
        ready: true,
      };
      return hotSpringMaskCache;
    } catch (e) {
      console.warn('[ShorelineOverlay] Failed to generate hotspring mask:', e);
      return null;
    }
  })();

  return hotSpringMaskLoadPromise;
}

/**
 * Render the animated shoreline overlay for Beach_Sea or Beach_HotSpringWater tiles.
 * Call from ProceduralWorldRenderer when drawing beach/water transitions.
 *
 * @param ctx - Canvas context (already translated and clipped if needed)
 * @param spriteCoords - Source rect in tileset { x, y, width, height }
 * @param destX - Destination X in screen space
 * @param destY - Destination Y in screen space
 * @param destSize - Destination size (pixelSize)
 * @param flipHorizontal - Whether tile was flipped
 * @param flipVertical - Whether tile was flipped
 * @param currentTimeMs - Current time for animation
 * @param forHotSpring - If true, use Beach_HotSpringWater mask (subtle wave edges on hotspring sides)
 */
export function renderShorelineOverlay(
  ctx: CanvasRenderingContext2D,
  spriteCoords: { x: number; y: number; width: number; height: number },
  destX: number,
  destY: number,
  destSize: number,
  flipHorizontal: boolean,
  flipVertical: boolean,
  currentTimeMs: number,
  forHotSpring: boolean = false
): void {
  const cache = forHotSpring ? hotSpringMaskCache : maskCache;
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

  if (!cache?.ready) {
    ctx.restore();
    return;
  }

  const centerX = destX + destSize / 2;
  const centerY = destY + destSize / 2;

  // Layer 1: Shoreline - thin static blue edge
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;
  ctx.drawImage(
    cache.canvas,
    Math.floor(spriteCoords.x),
    Math.floor(spriteCoords.y),
    Math.floor(spriteCoords.width),
    Math.floor(spriteCoords.height),
    destX,
    destY,
    Math.floor(destSize),
    Math.floor(destSize)
  );

  // Layer 2: Edge pixels move and fade - use source-over so beach color shows true (lighter adds → white)
  ctx.globalCompositeOperation = 'source-over';
  const tileScale = destSize / AUTOTILE_TILE_SIZE;
  const offsetPx = WAVE_OFFSET_PX * Math.max(0.5, tileScale / 4);
  for (let w = 0; w < WAVE_LAYERS; w++) {
    const phase = t * WAVE_SPEED + w * 0.7;
    const s = Math.sin(phase);
    const dx = s * offsetPx;
    const dy = Math.sin(phase + 0.5) * offsetPx;
    const alpha = 0.75 * (1 - w * 0.35) * (0.5 + 0.5 * s);

    ctx.save();
    ctx.globalAlpha = Math.max(0.2, alpha);
    ctx.translate(dx, dy);
    ctx.drawImage(
      cache.waveCanvas,
      Math.floor(spriteCoords.x),
      Math.floor(spriteCoords.y),
      Math.floor(spriteCoords.width),
      Math.floor(spriteCoords.height),
      destX,
      destY,
      Math.floor(destSize),
      Math.floor(destSize)
    );
    ctx.restore();
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/**
 * Check if shoreline overlay is ready to render (Beach_Sea).
 */
export function isShorelineMaskReady(): boolean {
  return maskCache?.ready ?? false;
}

/**
 * Check if hotspring shoreline overlay is ready to render (Beach_HotSpringWater).
 */
export function isHotSpringShorelineMaskReady(): boolean {
  return hotSpringMaskCache?.ready ?? false;
}

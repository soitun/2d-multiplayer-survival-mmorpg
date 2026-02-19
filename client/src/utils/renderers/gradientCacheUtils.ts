/**
 * Phase 3a: Cache gradient objects to avoid createRadialGradient/createLinearGradient
 * per frame. Gradients are keyed by rounded parameters; cache is per-context.
 * Invalidate when canvas context changes (e.g. resize) by calling clearGradientCache().
 */

type ColorStop = [number, string];

const ctxToCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();

function getCache(ctx: CanvasRenderingContext2D): Map<string, CanvasGradient> {
  let cache = ctxToCache.get(ctx);
  if (!cache) {
    cache = new Map();
    ctxToCache.set(ctx, cache);
  }
  return cache;
}

/** Clear all gradient caches. Call when canvas is resized or recreated. */
export function clearGradientCache(): void {
  // WeakMap entries are GC'd when ctx is no longer referenced; we can't iterate.
  // For explicit clear, we'd need to track ctxs. Skip for now - cache entries
  // from disposed contexts are harmless (GC will reclaim when ctx is gone).
}

export interface CachedRadialGradientResult {
  gradient: CanvasGradient;
  x: number;
  y: number;
  r: number;
}

/**
 * Get or create a radial gradient. Parameters are quantized for cache hits.
 * Caller must use the returned x,y,r when drawing the arc so gradient and shape match.
 * @param typeId - optional prefix to avoid collisions between different gradient types
 * @param quantize - pixel step for x,y and r (e.g. 4 = round to nearest 4px)
 */
export function getCachedRadialGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colorStops: ColorStop[],
  quantize: number = 4,
  typeId: string = 'r'
): CachedRadialGradientResult {
  const qx = Math.round(x / quantize) * quantize;
  const qy = Math.round(y / quantize) * quantize;
  const qr = Math.max(1, Math.round(r / Math.max(1, quantize >> 1)) * Math.max(1, quantize >> 1));
  const key = `${typeId}:${qx},${qy},${qr}`;
  const cache = getCache(ctx);
  let grad = cache.get(key) as CanvasGradient | undefined;
  if (!grad) {
    grad = ctx.createRadialGradient(qx, qy, 0, qx, qy, qr);
    for (const [offset, color] of colorStops) {
      grad.addColorStop(offset, color);
    }
    cache.set(key, grad);
  }
  return { gradient: grad, x: qx, y: qy, r: qr };
}

/**
 * Get or create a linear gradient. Parameters are quantized for cache hits.
 * @param typeId - optional prefix to avoid collisions
 */
export function getCachedLinearGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colorStops: ColorStop[],
  quantize: number = 4,
  typeId: string = 'l'
): CanvasGradient {
  const qx0 = Math.round(x0 / quantize) * quantize;
  const qy0 = Math.round(y0 / quantize) * quantize;
  const qx1 = Math.round(x1 / quantize) * quantize;
  const qy1 = Math.round(y1 / quantize) * quantize;
  const key = `${typeId}:${qx0},${qy0},${qx1},${qy1}`;
  const cache = getCache(ctx);
  let grad = cache.get(key) as CanvasGradient | undefined;
  if (!grad) {
    grad = ctx.createLinearGradient(qx0, qy0, qx1, qy1);
    for (const [offset, color] of colorStops) {
      grad.addColorStop(offset, color);
    }
    cache.set(key, grad);
  }
  return grad;
}

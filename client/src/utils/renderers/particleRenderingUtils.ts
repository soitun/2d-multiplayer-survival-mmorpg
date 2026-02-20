/**
 * Particle rendering utilities - batches particles by type for efficient canvas drawing.
 * AAA pixel art style (Sea of Stars inspired) for fire, ember, spark, smoke.
 * Memory beacon particles use soft radial gradients for ethereal effect.
 */

export interface ParticleBucketState {
  fire: any[];
  ember: any[];
  spark: any[];
  other: any[];
  memory: any[];
  regularSmoke: any[];
}

/** Create reusable bucket arrays (avoids per-frame allocations). */
export function createParticleBuckets(): ParticleBucketState {
  return {
    fire: [],
    ember: [],
    spark: [],
    other: [],
    memory: [],
    regularSmoke: [],
  };
}

/**
 * Optimized particle renderer - batches particles by type to minimize ctx state changes.
 * Uses provided buckets and gradient cache for zero-allocation hot path.
 */
export function renderParticlesToCanvas(
  ctx: CanvasRenderingContext2D,
  particles: any[],
  buckets: ParticleBucketState,
  gradCache: Map<string, CanvasGradient>
): void {
  if (particles.length === 0) return;

  // Clear buckets for reuse
  buckets.fire.length = 0;
  buckets.ember.length = 0;
  buckets.spark.length = 0;
  buckets.other.length = 0;
  buckets.memory.length = 0;
  buckets.regularSmoke.length = 0;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.type === 'fire') {
      buckets.fire.push(p);
    } else if (p.type === 'ember') {
      buckets.ember.push(p);
    } else if (p.type === 'spark') {
      buckets.spark.push(p);
    } else {
      buckets.other.push(p);
    }
  }

  // Render fire particles with AAA pixel art style
  if (buckets.fire.length > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < buckets.fire.length; i++) {
      const particle = buckets.fire[i];
      const isStaticCampfire = particle.id && particle.id.startsWith('fire_static_');

      ctx.globalAlpha = particle.alpha || 1;
      ctx.fillStyle = particle.color || '#ff4500';
      ctx.shadowColor = particle.color || '#ff4500';
      ctx.shadowBlur = isStaticCampfire ? particle.size * 0.3 : particle.size * 0.5;

      const pixelSize = Math.max(1, Math.floor(particle.size));
      const pixelX = Math.floor(particle.x - pixelSize / 2);
      const pixelY = Math.floor(particle.y - pixelSize / 2);
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
    }
    ctx.restore();
  }

  // Render ember particles
  if (buckets.ember.length > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < buckets.ember.length; i++) {
      const particle = buckets.ember[i];
      ctx.globalAlpha = particle.alpha || 1;
      ctx.fillStyle = particle.color || '#FFE066';
      ctx.shadowColor = particle.color || '#FFE066';
      ctx.shadowBlur = particle.size * 2 + Math.sin(Date.now() * 0.01 + i) * 2;

      const pixelSize = Math.max(1, Math.floor(particle.size));
      const pixelX = Math.floor(particle.x - pixelSize / 2);
      const pixelY = Math.floor(particle.y - pixelSize / 2);
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
    }
    ctx.restore();
  }

  // Render spark particles
  if (buckets.spark.length > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < buckets.spark.length; i++) {
      const particle = buckets.spark[i];
      ctx.globalAlpha = particle.alpha || 1;
      ctx.fillStyle = particle.color || '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = particle.size * 4;

      const pixelSize = Math.max(1, Math.floor(particle.size));
      const pixelX = Math.floor(particle.x - pixelSize / 2);
      const pixelY = Math.floor(particle.y - pixelSize / 2);
      ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
    }
    ctx.restore();
  }

  // Render other particles (smoke, memory beacon)
  if (buckets.other.length > 0) {
    ctx.save();

    for (let i = 0; i < buckets.other.length; i++) {
      const p = buckets.other[i];
      if (p.id && (p.id.startsWith('memory_') || p.id.startsWith('memoryfrag_'))) {
        buckets.memory.push(p);
      } else {
        buckets.regularSmoke.push(p);
      }
    }

    // Memory beacon particles - soft glowing circles
    if (buckets.memory.length > 0) {
      ctx.imageSmoothingEnabled = true;
      for (let i = 0; i < buckets.memory.length; i++) {
        const particle = buckets.memory[i];
        const isFragment = particle.id && particle.id.startsWith('memoryfrag_');

        ctx.globalAlpha = particle.alpha || 1;
        const radius = Math.max(2, particle.size * (isFragment ? 1.5 : 1.2));
        const radiusBucket = Math.round(radius);
        const baseColor = particle.color || '#9966FF';
        const cacheKey = `${baseColor}_${radiusBucket}`;

        let gradient = gradCache.get(cacheKey);
        if (!gradient) {
          gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusBucket);
          gradient.addColorStop(0, baseColor);
          gradient.addColorStop(0.4, baseColor);
          gradient.addColorStop(1, 'transparent');
          gradCache.set(cacheKey, gradient);
        }

        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radiusBucket, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (isFragment) {
          ctx.globalAlpha = (particle.alpha || 1) * 0.5;
          const innerRadius = Math.round(radius * 0.5);
          const innerKey = `inner_${innerRadius}`;
          let innerGradient = gradCache.get(innerKey);
          if (!innerGradient) {
            innerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRadius);
            innerGradient.addColorStop(0, '#FFFFFF');
            innerGradient.addColorStop(1, 'transparent');
            gradCache.set(innerKey, innerGradient);
          }
          ctx.save();
          ctx.translate(particle.x, particle.y);
          ctx.fillStyle = innerGradient;
          ctx.beginPath();
          ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Regular smoke particles
    if (buckets.regularSmoke.length > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.shadowBlur = 0;
      for (let i = 0; i < buckets.regularSmoke.length; i++) {
        const particle = buckets.regularSmoke[i];
        ctx.globalAlpha = particle.alpha || 1;
        ctx.fillStyle = particle.color || '#888888';

        const pixelSize = Math.max(1, Math.floor(particle.size));
        const pixelX = Math.floor(particle.x - pixelSize / 2);
        const pixelY = Math.floor(particle.y - pixelSize / 2);
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
    }

    ctx.restore();
  }
}

// PERFORMANCE FIX: Use refs instead of state to avoid React re-render cascades
// Particles are updated via RAF and read directly from ref in the game loop
// This eliminates ~60 React re-renders per second

import { useEffect, useRef, useCallback } from 'react';
import { Furnace } from '../generated';
import { 
  FURNACE_HEIGHT, 
  FURNACE_RENDER_Y_OFFSET,
  LARGE_FURNACE_HEIGHT,
  LARGE_FURNACE_RENDER_Y_OFFSET,
  MONUMENT_LARGE_FURNACE_HEIGHT,
  MONUMENT_LARGE_FURNACE_RENDER_Y_OFFSET,
  FURNACE_TYPE_LARGE
} from '../utils/renderers/furnaceRenderingUtils';

export interface FurnaceParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  type: 'forge_fire' | 'industrial_smoke' | 'metal_spark';
}

// Shared particles ref for external access (game loop reads this directly)
const particlesRef: { current: FurnaceParticle[] } = { current: [] };

export function useFurnaceParticles({ visibleFurnacesMap }: { visibleFurnacesMap: Map<string, Furnace> }) {
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const visibleFurnacesMapRef = useRef(visibleFurnacesMap);
  
  // Keep ref in sync with prop (avoids useEffect dependency on the map)
  visibleFurnacesMapRef.current = visibleFurnacesMap;

  const updateParticles = useCallback(() => {
    const now = performance.now();
    const deltaTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Update existing particles IN PLACE (no new array allocation when possible)
    let writeIndex = 0;
    const currentParticles = particlesRef.current;
    
    for (let i = 0; i < currentParticles.length; i++) {
      const particle = currentParticles[i];
      const newLife = particle.life - deltaTime;
      
      if (newLife > 0) {
        // Update in place
        particle.x += particle.vx * (deltaTime / 16.67);
        particle.y += particle.vy * (deltaTime / 16.67);
        particle.life = newLife;
        particle.alpha = Math.max(0, newLife / particle.maxLife);
        particle.vy = particle.type === 'metal_spark' ? particle.vy + 0.08 : particle.vy - 0.02;
        
        // Compact: move to writeIndex if different
        if (writeIndex !== i) {
          currentParticles[writeIndex] = particle;
        }
        writeIndex++;
      }
    }
    
    // Trim the array to remove dead particles
    currentParticles.length = writeIndex;

    // Add new particles for burning furnaces
    visibleFurnacesMapRef.current.forEach(furnace => {
      if (furnace.isBurning && !furnace.isDestroyed) {
        const isLargeFurnace = furnace.furnaceType === FURNACE_TYPE_LARGE;
        const isMonument = furnace.isMonument;
        
        // Use different dimensions and offsets for large furnace / monument
        const furnaceHeight = isLargeFurnace 
          ? (isMonument ? MONUMENT_LARGE_FURNACE_HEIGHT : LARGE_FURNACE_HEIGHT)
          : FURNACE_HEIGHT;
        const yOffset = isLargeFurnace 
          ? (isMonument ? MONUMENT_LARGE_FURNACE_RENDER_Y_OFFSET : LARGE_FURNACE_RENDER_Y_OFFSET)
          : FURNACE_RENDER_Y_OFFSET;
        
        // Spark origin: monument large furnace shifted further left to align with oven opening
        const centerX = isLargeFurnace 
          ? (isMonument ? furnace.posX - 60 : furnace.posX - 30)
          : furnace.posX - 8;
        const centerY = isLargeFurnace 
          ? furnace.posY - (furnaceHeight / 2) - yOffset - 60  // Much higher for large furnace
          : furnace.posY - (furnaceHeight / 2) - yOffset - 12;
        
        // MAIN FURNACE PARTICLES (sparks + tiny fire)
        // Add tiny fire particles
        if (Math.random() < 0.08) {
          currentParticles.push({
            x: centerX + (Math.random() - 0.5) * (isLargeFurnace ? 10 : 6),
            y: centerY + furnaceHeight * (isLargeFurnace ? 0.45 : 0.55),
            vx: (Math.random() - 0.5) * 0.3,
            vy: -Math.random() * 0.8 - 0.3,
            life: 600 + Math.random() * 400,
            maxLife: 600 + Math.random() * 400,
            size: 2 + Math.random() * 2,
            color: ['#cc4400', '#aa3300', '#dd5500'][Math.floor(Math.random() * 3)],
            alpha: 0.8,
            type: 'forge_fire'
          });
        }

        // Add metal spark particles
        if (Math.random() < 0.05) {
          currentParticles.push({
            x: centerX + (Math.random() - 0.5) * (isLargeFurnace ? 12 : 8),
            y: centerY + furnaceHeight * (isLargeFurnace ? 0.35 : 0.40),
            vx: (Math.random() - 0.5) * 1.5,
            vy: -Math.random() * 1.0 - 0.2,
            life: 300 + Math.random() * 400,
            maxLife: 300 + Math.random() * 400,
            size: 1 + Math.random() * 3,
            color: ['#ffaa00', '#ff8800', '#ffcc22', '#ff9900'][Math.floor(Math.random() * 4)],
            alpha: 1,
            type: 'metal_spark'
          });
        }

        // SEPARATE LAZY SMOKE CHIMNEY - only for normal furnace (no smoke for large furnace)
        if (!isLargeFurnace) {
          const smokeChimneyCenterX = centerX + 10;
          const smokeChimneyCenterY = centerY + 25;

          // Add natural furnace chimney smoke
          if (Math.random() < 0.25) {
            currentParticles.push({
              x: smokeChimneyCenterX + (Math.random() - 0.5) * 6,
              y: smokeChimneyCenterY,
              vx: (Math.random() - 0.5) * 0.05,
              vy: -Math.random() * 0.1 - 0.02,
              life: 2500 + Math.random() * 2000,
              maxLife: 2500 + Math.random() * 2000,
              size: 2 + Math.random() * 4,
              color: ['#888888', '#999999', '#777777', '#aaaaaa'][Math.floor(Math.random() * 4)],
              alpha: 0.3,
              type: 'industrial_smoke'
            });
          }
        }
      }
    });

    animationRef.current = requestAnimationFrame(updateParticles);
  }, []); // No dependencies - uses refs internally

  useEffect(() => {
    // Start the particle animation loop
    animationRef.current = requestAnimationFrame(updateParticles);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      // Clear particles on unmount
      particlesRef.current = [];
    };
  }, [updateParticles]);

  // Return the current particles array (read from ref, no re-render on change)
  // Note: This returns the same array reference - mutations happen in place
  return particlesRef.current;
}

// PERFORMANCE FIX: Use refs instead of state to avoid React re-render cascades
// Particles are updated via RAF and read directly from ref in the game loop
// This eliminates ~60 React re-renders per second

import { useEffect, useRef, useCallback } from 'react';
import { Barbecue } from '../generated';
import { BARBECUE_HEIGHT, BARBECUE_RENDER_Y_OFFSET } from '../utils/renderers/barbecueRenderingUtils';

export interface BarbecueParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  type: 'grill_fire' | 'grill_smoke' | 'ember';
}

// Shared particles ref for external access (game loop reads this directly)
const particlesRef: { current: BarbecueParticle[] } = { current: [] };

export function useBarbecueParticles({ visibleBarbecuesMap }: { visibleBarbecuesMap: Map<string, Barbecue> }) {
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const visibleBarbecuesMapRef = useRef(visibleBarbecuesMap);
  
  // Keep ref in sync with prop (avoids useEffect dependency on the map)
  visibleBarbecuesMapRef.current = visibleBarbecuesMap;

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
        // Embers fall slightly, fire/smoke rise
        particle.vy = particle.type === 'ember' ? particle.vy + 0.05 : particle.vy - 0.015;
        
        // Compact: move to writeIndex if different
        if (writeIndex !== i) {
          currentParticles[writeIndex] = particle;
        }
        writeIndex++;
      }
    }
    
    // Trim the array to remove dead particles
    currentParticles.length = writeIndex;

    // Add new particles for burning barbecues
    visibleBarbecuesMapRef.current.forEach(barbecue => {
      if (barbecue.isBurning && !barbecue.isDestroyed) {
        // Center of the grill area (slightly above the base)
        const centerX = barbecue.posX;
        const centerY = barbecue.posY - (BARBECUE_HEIGHT / 2) - BARBECUE_RENDER_Y_OFFSET;
        
        // GRILL FIRE PARTICLES - small flames from the grill
        if (Math.random() < 0.12) {
          currentParticles.push({
            x: centerX + (Math.random() - 0.5) * 24, // Spread across grill width
            y: centerY + BARBECUE_HEIGHT * 0.25,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -Math.random() * 0.9 - 0.4,
            life: 500 + Math.random() * 400,
            maxLife: 500 + Math.random() * 400,
            size: 2 + Math.random() * 3,
            color: ['#ff6600', '#ff4400', '#ff8800', '#dd5500'][Math.floor(Math.random() * 4)],
            alpha: 0.85,
            type: 'grill_fire'
          });
        }

        // EMBER PARTICLES - tiny sparks that float up and drift
        if (Math.random() < 0.06) {
          currentParticles.push({
            x: centerX + (Math.random() - 0.5) * 20,
            y: centerY + BARBECUE_HEIGHT * 0.20,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -Math.random() * 1.5 - 0.5,
            life: 400 + Math.random() * 500,
            maxLife: 400 + Math.random() * 500,
            size: 1 + Math.random() * 2,
            color: ['#ffaa00', '#ff9900', '#ffcc33', '#ff8800'][Math.floor(Math.random() * 4)],
            alpha: 1,
            type: 'ember'
          });
        }

        // SMOKE PARTICLES - lazy smoke rising from the grill
        if (Math.random() < 0.18) {
          currentParticles.push({
            x: centerX + (Math.random() - 0.5) * 16,
            y: centerY - 10,
            vx: (Math.random() - 0.5) * 0.08,
            vy: -Math.random() * 0.15 - 0.03,
            life: 2000 + Math.random() * 1500,
            maxLife: 2000 + Math.random() * 1500,
            size: 3 + Math.random() * 5,
            color: ['#666666', '#777777', '#555555', '#888888'][Math.floor(Math.random() * 4)],
            alpha: 0.35,
            type: 'grill_smoke'
          });
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

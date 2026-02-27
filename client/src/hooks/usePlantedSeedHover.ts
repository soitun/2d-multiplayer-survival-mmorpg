import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { PlantedSeed } from '../generated/types';

/**
 * Hook to manage planted seed hover states for displaying info tooltips
 */
export function usePlantedSeedHover(
  plantedSeeds: Map<string, PlantedSeed>,
  worldMouseX: number | null,
  worldMouseY: number | null
) {
  // Track which seed is currently being hovered over
  const [hoveredSeedId, setHoveredSeedId] = useState<string | null>(null);
  
  // Track hover timeout to clean it up properly
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Interaction radius for seed hover detection (in world units)
  const SEED_HOVER_RADIUS = 30; // Slightly larger than the visual seed size
  const SEED_HOVER_RADIUS_SQ = SEED_HOVER_RADIUS * SEED_HOVER_RADIUS;
  
  // Cleanup timeout when component unmounts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Find the closest seed to the mouse cursor
  const closestSeed = useMemo(() => {
    if (worldMouseX === null || worldMouseY === null || !plantedSeeds || plantedSeeds.size === 0) {
      return null;
    }
    
    let closestSeedEntry: [string, PlantedSeed] | null = null;
    let closestDistSq = SEED_HOVER_RADIUS_SQ;
    
    plantedSeeds.forEach((seed, seedId) => {
      const dx = worldMouseX - seed.posX;
      const dy = worldMouseY - seed.posY;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestSeedEntry = [seedId, seed];
      }
    });
    
    return closestSeedEntry;
  }, [plantedSeeds, worldMouseX, worldMouseY, SEED_HOVER_RADIUS_SQ]);
  
  // Update hovered seed based on closest seed
  useEffect(() => {
    const [newSeedId] = closestSeed || [null];
    
    // Clear immediately when mouse leaves canvas (worldMouse null) - prevents stuck tooltip
    if (worldMouseX === null || worldMouseY === null) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setHoveredSeedId(null);
      return;
    }
    
    if (newSeedId) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      
      // Set the hovered seed immediately
      setHoveredSeedId(newSeedId);
      
    } else if (hoveredSeedId !== null) {
      // Mouse left seed area - start timeout to clear hover state
      if (!hoverTimeoutRef.current) {
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredSeedId(null);
          hoverTimeoutRef.current = null;
        }, 150); // Reduced from 300ms - faster clear when moving away
      }
    }
  }, [closestSeed, hoveredSeedId, worldMouseX, worldMouseY]);
  
  // Get the currently hovered seed data - clear if seed was harvested/removed
  const hoveredSeed = hoveredSeedId ? plantedSeeds.get(hoveredSeedId) : null;
  
  // Clear hover when seed no longer exists (harvested, etc.) - prevents stuck tooltip
  useEffect(() => {
    if (hoveredSeedId && !hoveredSeed) {
      setHoveredSeedId(null);
    }
  }, [hoveredSeedId, hoveredSeed]);
  
  return {
    hoveredSeed,
    hoveredSeedId
  };
}


import { useState, useRef, useEffect, useMemo } from 'react';
import { WildAnimal } from '../generated/types';

/**
 * Hook to manage tamed animal hover states for displaying info tooltips.
 * Only returns tamed animals (those with tamedBy set).
 */
export function useTamedAnimalHover(
  wildAnimals: Map<string, WildAnimal>,
  worldMouseX: number | null,
  worldMouseY: number | null
) {
  // Track which tamed animal is currently being hovered over
  const [hoveredAnimalId, setHoveredAnimalId] = useState<string | null>(null);
  
  // Track hover timeout to clean it up properly
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Interaction radius for animal hover detection (in world units)
  // Animals are larger than seeds, so use a bigger radius
  const ANIMAL_HOVER_RADIUS = 40;
  const ANIMAL_HOVER_RADIUS_SQ = ANIMAL_HOVER_RADIUS * ANIMAL_HOVER_RADIUS;
  
  // Cleanup timeout when component unmounts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Find the closest TAMED animal to the mouse cursor
  const closestTamedAnimal = useMemo(() => {
    if (worldMouseX === null || worldMouseY === null || !wildAnimals || wildAnimals.size === 0) {
      return null;
    }
    
    let closestAnimalEntry: [string, WildAnimal] | null = null;
    let closestDistSq = ANIMAL_HOVER_RADIUS_SQ;
    
    wildAnimals.forEach((animal, animalId) => {
      // Only consider TAMED animals
      if (!animal.tamedBy) return;
      
      // Skip dead animals
      if (animal.health <= 0) return;
      
      const dx = worldMouseX - animal.posX;
      const dy = worldMouseY - animal.posY;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestAnimalEntry = [animalId, animal];
      }
    });
    
    return closestAnimalEntry;
  }, [wildAnimals, worldMouseX, worldMouseY, ANIMAL_HOVER_RADIUS_SQ]);
  
  // Update hovered animal based on closest tamed animal
  useEffect(() => {
    const [newAnimalId] = closestTamedAnimal || [null];
    
    if (newAnimalId) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      
      // Set the hovered animal immediately
      setHoveredAnimalId(newAnimalId);
      
    } else if (hoveredAnimalId !== null) {
      // Mouse left animal area - start timeout to clear hover state
      if (!hoverTimeoutRef.current) {
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredAnimalId(null);
          hoverTimeoutRef.current = null;
        }, 300); // Keep hover state for 300ms after mouse leaves
      }
    }
  }, [closestTamedAnimal, hoveredAnimalId]);
  
  // Get the currently hovered tamed animal data
  const hoveredTamedAnimal = hoveredAnimalId ? wildAnimals.get(hoveredAnimalId) : null;
  
  return {
    hoveredTamedAnimal,
    hoveredAnimalId
  };
}

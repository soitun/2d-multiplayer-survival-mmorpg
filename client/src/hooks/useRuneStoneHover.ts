import { useState, useRef, useEffect, useMemo } from 'react';
import { RuneStone } from '../generated';

/**
 * Hook to manage rune stone hover states for displaying info tooltips
 */
export function useRuneStoneHover(
  runeStones: Map<string, RuneStone>,
  worldMouseX: number | null,
  worldMouseY: number | null
) {
  // Track which rune stone is currently being hovered over
  const [hoveredRuneStoneId, setHoveredRuneStoneId] = useState<string | null>(null);
  
  // Track hover timeout to clean it up properly
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Interaction radius for rune stone hover detection (in world units)
  // Rune stones are ~150px tall, so use a radius slightly larger than half that
  const RUNE_STONE_HOVER_RADIUS = 80; // Similar to visual size - not too large
  const RUNE_STONE_HOVER_RADIUS_SQ = RUNE_STONE_HOVER_RADIUS * RUNE_STONE_HOVER_RADIUS;
  
  // Cleanup timeout when component unmounts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  // Find the closest rune stone to the mouse cursor
  const closestRuneStone = useMemo(() => {
    if (worldMouseX === null || worldMouseY === null || !runeStones || runeStones.size === 0) {
      return null;
    }
    
    let closestRuneStoneEntry: [string, RuneStone] | null = null;
    let closestDistSq = RUNE_STONE_HOVER_RADIUS_SQ;
    
    runeStones.forEach((runeStone, runeStoneId) => {
      const dx = worldMouseX - runeStone.posX;
      const dy = worldMouseY - runeStone.posY;
      const distSq = dx * dx + dy * dy;
      
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestRuneStoneEntry = [runeStoneId, runeStone];
      }
    });
    
    return closestRuneStoneEntry;
  }, [runeStones, worldMouseX, worldMouseY, RUNE_STONE_HOVER_RADIUS_SQ]);
  
  // Update hovered rune stone based on closest rune stone
  useEffect(() => {
    const [newRuneStoneId] = closestRuneStone || [null];
    
    if (newRuneStoneId) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      
      // Set the hovered rune stone immediately
      setHoveredRuneStoneId(newRuneStoneId);
      
    } else if (hoveredRuneStoneId !== null) {
      // Mouse left rune stone area - start timeout to clear hover state
      if (!hoverTimeoutRef.current) {
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredRuneStoneId(null);
          hoverTimeoutRef.current = null;
        }, 50); // Keep hover state for 50ms after mouse leaves (fast snap off)
      }
    }
  }, [closestRuneStone, hoveredRuneStoneId]);
  
  // Get the currently hovered rune stone data
  const hoveredRuneStone = hoveredRuneStoneId ? runeStones.get(hoveredRuneStoneId) : null;
  
  return {
    hoveredRuneStone,
    hoveredRuneStoneId
  };
}


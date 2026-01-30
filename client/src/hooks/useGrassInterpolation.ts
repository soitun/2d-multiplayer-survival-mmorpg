import { useState, useEffect, useRef, useMemo } from 'react';
import { Grass as SpacetimeDBGrass, GrassState as SpacetimeDBGrassState, GrassAppearanceType } from '../generated';
import { Timestamp as SpacetimeDBTimestamp } from 'spacetimedb';

// ============================================================================
// GRASS INTERPOLATION HOOK - Updated for Split Tables
// ============================================================================
// With table normalization, grass data is split into:
// - Grass: Static geometry (position, appearance, sway params) - rarely changes
// - GrassState: Dynamic state (health, respawn, disturbance) - updates on damage
//
// This hook merges both tables into InterpolatedGrassData for rendering.
// ============================================================================

interface GrassInterpolationState {
  id: string; // Keep id as string (from map key)
  originalId: bigint; // Store original u64 ID from Grass table

  // Server data - base position (from static Grass table)
  serverPosX: number;
  serverPosY: number;

  // For BaseEntity compatibility
  posX: number;
  posY: number;

  // For grass, these are effectively the same as serverPos, as position is static
  lastKnownPosX: number;
  lastKnownPosY: number;
  targetPosX: number;
  targetPosY: number;

  // Animation timing (when this state was last updated from server data)
  lastServerUpdateTimeMs: number;

  // Static properties from Grass table
  appearanceType: GrassAppearanceType;
  chunkIndex: number;
  swayOffsetSeed: number;
  swaySpeed: number;
  
  // Dynamic properties from GrassState table
  health: number;
  lastHitTime: SpacetimeDBTimestamp | null;
  respawnAt: SpacetimeDBTimestamp | null;
  disturbedAt: SpacetimeDBTimestamp | null;
  disturbanceDirectionX: number;
  disturbanceDirectionY: number;
}

// Output structure, including current render position (which is server position for grass)
export interface InterpolatedGrassData extends GrassInterpolationState {
  currentRenderPosX: number;
  currentRenderPosY: number;
}

interface UseGrassInterpolationProps {
  serverGrass: Map<string, SpacetimeDBGrass>; // Static geometry - key is grass.id.toString()
  serverGrassState: Map<string, SpacetimeDBGrassState>; // Dynamic state - key is grassState.grassId.toString()
  deltaTime: number; // Milliseconds since last frame (currently unused for grass pos)
}

export const useGrassInterpolation = ({
  serverGrass,
  serverGrassState,
  deltaTime, // deltaTime is currently unused as grass position is static.
}: UseGrassInterpolationProps): Map<string, InterpolatedGrassData> => {
  const [interpolatedGrassStates, setInterpolatedGrassStates] = useState<Map<string, GrassInterpolationState>>(() => new Map());
  const [renderableGrass, setRenderableGrass] = useState<Map<string, InterpolatedGrassData>>(() => new Map());

  const prevServerGrassRef = useRef<Map<string, SpacetimeDBGrass>>(new Map());
  const prevServerGrassStateRef = useRef<Map<string, SpacetimeDBGrassState>>(new Map());
  
  // Track which grass IDs we've ever seen grassState for
  // This helps distinguish "still loading" (never seen) vs "destroyed" (seen before, now missing)
  const seenGrassStateIdsRef = useRef<Set<string>>(new Set());

  // Effect to update interpolation states when server data changes
  useEffect(() => {
    const newStates = new Map(interpolatedGrassStates);
    const now = performance.now();
    let changed = false;

    // Update the "seen" set with any new grassState entries
    serverGrassState.forEach((_, id) => {
      seenGrassStateIdsRef.current.add(id);
    });

    // Merge grass (static) with grass_state (dynamic) by ID
    serverGrass.forEach((grass, id) => {
      const prevState = newStates.get(id);
      const prevGrass = prevServerGrassRef.current.get(id);
      const grassState = serverGrassState.get(id); // Same ID as grass
      const prevGrassState = prevServerGrassStateRef.current.get(id);

      // Check if static data changed (rarely happens)
      const staticDataChanged = !prevGrass ||
        prevGrass.appearanceType !== grass.appearanceType ||
        prevGrass.chunkIndex !== grass.chunkIndex ||
        prevGrass.swayOffsetSeed !== grass.swayOffsetSeed ||
        prevGrass.swaySpeed !== grass.swaySpeed;

      // Check if dynamic state changed (common during gameplay)
      const dynamicDataChanged = !grassState || !prevGrassState ||
        prevGrassState.health !== grassState.health ||
        !Object.is(prevGrassState.lastHitTime, grassState.lastHitTime) ||
        !Object.is(prevGrassState.respawnAt, grassState.respawnAt) ||
        !Object.is(prevGrassState.disturbedAt, grassState.disturbedAt) ||
        prevGrassState.disturbanceDirectionX !== grassState.disturbanceDirectionX ||
        prevGrassState.disturbanceDirectionY !== grassState.disturbanceDirectionY;

      // Determine effective health:
      // - If grassState exists: use its health
      // - If grassState is missing: don't render (could be dead or still loading)
      // 
      // NOTE: We can't distinguish "still loading" from "dead grass" because:
      // - Dead grass has health=0, which doesn't match subscription `health > 0`
      // - On page refresh, seenGrassStateIdsRef is reset, so we can't track previous session
      // - Defaulting to health=1 would incorrectly render dead grass
      // 
      // The tradeoff: grass won't render until grassState loads (brief delay on chunk load)
      // This is acceptable and prevents dead grass from erroneously appearing.
      let effectiveHealth: number;
      if (grassState) {
        // Grass is confirmed alive by subscription (health > 0)
        effectiveHealth = grassState.health;
      } else if (seenGrassStateIdsRef.current.has(id)) {
        // We've seen this grass's state THIS SESSION but it's now missing = destroyed mid-session
        effectiveHealth = 0;
      } else {
        // Never seen this grass's state this session = don't render
        // Could be: still loading OR dead from previous session
        // Either way, wait for grassState to confirm it's alive
        effectiveHealth = 0;
      }
      
      // Don't add grass that's currently dead/respawning
      if (effectiveHealth <= 0) {
        // If we had this grass before, remove it
        if (prevState) {
          changed = true;
          newStates.delete(id);
        }
        return; // Skip this grass (using return since we're in forEach)
      }
      
      if (!prevState || staticDataChanged || dynamicDataChanged) {
        changed = true;
        
        // Merge static Grass data with dynamic GrassState data
        newStates.set(id, {
          id,
          originalId: grass.id,
          // Position from static Grass table
          serverPosX: grass.posX,
          serverPosY: grass.posY,
          posX: grass.posX,
          posY: grass.posY,
          lastKnownPosX: grass.posX,
          lastKnownPosY: grass.posY,
          targetPosX: grass.posX,
          targetPosY: grass.posY,
          lastServerUpdateTimeMs: now,
          // Static properties from Grass table
          appearanceType: grass.appearanceType,
          chunkIndex: grass.chunkIndex,
          swayOffsetSeed: grass.swayOffsetSeed,
          swaySpeed: grass.swaySpeed,
          // Dynamic properties from GrassState table (with defaults if not found)
          health: effectiveHealth,
          lastHitTime: grassState?.lastHitTime ?? null,
          respawnAt: grassState?.respawnAt ?? null,
          disturbedAt: grassState?.disturbedAt ?? null,
          disturbanceDirectionX: grassState?.disturbanceDirectionX ?? 0,
          disturbanceDirectionY: grassState?.disturbanceDirectionY ?? 0,
        });
      }
    });

    // Remove grass entities that are no longer in serverGrass
    interpolatedGrassStates.forEach((_, id) => {
      if (!serverGrass.has(id)) {
        changed = true;
        newStates.delete(id);
        // Also remove from seen set when grass entity itself is gone (chunk unloaded)
        seenGrassStateIdsRef.current.delete(id);
      }
    });

    if (changed) {
      setInterpolatedGrassStates(newStates);
    }

    // Update refs for next comparison
    prevServerGrassRef.current = new Map(Array.from(serverGrass.entries()).map(([id, g]) => [id, { ...g }]));
    prevServerGrassStateRef.current = new Map(Array.from(serverGrassState.entries()).map(([id, s]) => [id, { ...s }]));

  }, [serverGrass, serverGrassState]);

  // Effect to prepare renderable grass data from interpolated states
  useEffect(() => {
    const newRenderables = new Map<string, InterpolatedGrassData>();

    interpolatedGrassStates.forEach((state, id) => {
      newRenderables.set(id, {
        ...state,
        currentRenderPosX: state.targetPosX,
        currentRenderPosY: state.targetPosY,
      });
    });
    setRenderableGrass(newRenderables);
  }, [interpolatedGrassStates]);

  return renderableGrass;
};

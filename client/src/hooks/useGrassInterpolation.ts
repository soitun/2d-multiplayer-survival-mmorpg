import { useEffect, useRef } from 'react';
import { Grass as SpacetimeDBGrass, GrassState as SpacetimeDBGrassState, GrassAppearanceType } from '../generated';
import { Timestamp as SpacetimeDBTimestamp } from 'spacetimedb';

// ============================================================================
// GRASS INTERPOLATION HOOK - Ref-Based Pattern (matches useCloudInterpolation)
// ============================================================================
// PERFORMANCE FIX: Replaced double useState + double useEffect cascade with
// a single ref-based pattern. Previously, every grass update caused:
//   setInterpolatedGrassStates → re-render → setRenderableGrass → re-render
// That's 2 React re-renders of the entire GameCanvas per grass change.
//
// Now uses shared refs (like useCloudInterpolation) so the game loop reads
// grass data directly without triggering any React re-renders.
//
// With table normalization, grass data is split into:
// - Grass: Static geometry (position, appearance, sway params) - rarely changes
// - GrassState: Dynamic state (health, respawn) - updates on damage
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

// PERFORMANCE FIX: Shared refs for grass data - avoids React re-renders entirely.
// The game loop reads renderableGrassRef.current directly.
const interpolatedStatesRef: { current: Map<string, GrassInterpolationState> } = { current: new Map() };
const renderableGrassRef: { current: Map<string, InterpolatedGrassData> } = { current: new Map() };

export const useGrassInterpolation = ({
  serverGrass,
  serverGrassState,
  deltaTime, // deltaTime is currently unused as grass position is static.
}: UseGrassInterpolationProps): Map<string, InterpolatedGrassData> => {
  const prevServerGrassRef = useRef<Map<string, SpacetimeDBGrass>>(new Map());
  const prevServerGrassStateRef = useRef<Map<string, SpacetimeDBGrassState>>(new Map());
  
  // Track which grass IDs we've ever seen grassState for
  // This helps distinguish "still loading" (never seen) vs "destroyed" (seen before, now missing)
  const seenGrassStateIdsRef = useRef<Set<string>>(new Set());

  // Effect to update interpolation states when server data changes
  // PERFORMANCE FIX: Writes directly to shared refs instead of calling setState twice.
  useEffect(() => {
    const states = interpolatedStatesRef.current;
    const now = performance.now();
    let changed = false;

    // Update the "seen" set with any new grassState entries
    serverGrassState.forEach((_, id) => {
      seenGrassStateIdsRef.current.add(id);
    });

    // Track IDs present in current serverGrass for removal pass
    const currentGrassIds = new Set<string>();

    // Merge grass (static) with grass_state (dynamic) by ID
    serverGrass.forEach((grass, id) => {
      currentGrassIds.add(id);
      const prevState = states.get(id);
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
        prevGrassState.isAlive !== grassState.isAlive ||
        !Object.is(prevGrassState.lastHitTime, grassState.lastHitTime) ||
        !Object.is(prevGrassState.respawnAt, grassState.respawnAt);

      // Determine if grass is alive:
      // - If grassState exists: use its isAlive boolean
      // - If grassState is missing: don't render (could be dead or still loading)
      let isAlive: boolean;
      if (grassState) {
        isAlive = grassState.isAlive;
      } else if (seenGrassStateIdsRef.current.has(id)) {
        isAlive = false;
      } else {
        isAlive = false;
      }
      
      // Don't add grass that's currently dead/respawning
      if (!isAlive) {
        if (prevState) {
          changed = true;
          states.delete(id);
          renderableGrassRef.current.delete(id);
        }
        return;
      }
      
      if (!prevState || staticDataChanged || dynamicDataChanged) {
        changed = true;
        
        const newState: GrassInterpolationState = {
          id,
          originalId: grass.id,
          serverPosX: grass.posX,
          serverPosY: grass.posY,
          posX: grass.posX,
          posY: grass.posY,
          lastKnownPosX: grass.posX,
          lastKnownPosY: grass.posY,
          targetPosX: grass.posX,
          targetPosY: grass.posY,
          lastServerUpdateTimeMs: now,
          appearanceType: grass.appearanceType,
          chunkIndex: grass.chunkIndex,
          swayOffsetSeed: grass.swayOffsetSeed,
          swaySpeed: grass.swaySpeed,
          health: grassState?.health ?? 0,
          lastHitTime: grassState?.lastHitTime ?? null,
          respawnAt: grassState?.respawnAt ?? null,
        };
        states.set(id, newState);
        
        // Update renderable data in the same pass (no second effect needed)
        renderableGrassRef.current.set(id, {
          ...newState,
          currentRenderPosX: newState.targetPosX,
          currentRenderPosY: newState.targetPosY,
        });
      }
    });

    // Remove grass entities that are no longer in serverGrass
    states.forEach((_, id) => {
      if (!currentGrassIds.has(id)) {
        changed = true;
        states.delete(id);
        renderableGrassRef.current.delete(id);
        seenGrassStateIdsRef.current.delete(id);
      }
    });

    // Update refs for next comparison
    // PERFORMANCE FIX: Only shallow-copy the Maps (no per-entry spread needed
    // since we only compare primitive fields in the change detection above)
    prevServerGrassRef.current = new Map(serverGrass);
    prevServerGrassStateRef.current = new Map(serverGrassState);

  }, [serverGrass, serverGrassState]);

  // Return the shared ref's current value - game loop reads this directly
  return renderableGrassRef.current;
};

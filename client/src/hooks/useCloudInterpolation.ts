import { useState, useEffect, useRef } from 'react';
import { Cloud as SpacetimeDBCloud, CloudShapeType } from '../generated'; // Assuming generated types

const SERVER_UPDATE_INTERVAL_MS = 5000; // Cloud position updates from server every 5 seconds

interface CloudInterpolationState {
  id: string; // Keep id for keying
  // Raw server data (or latest processed server data)
  serverPosX: number;
  serverPosY: number;
  // Interpolation points
  lastKnownPosX: number;
  lastKnownPosY: number;
  targetPosX: number;
  targetPosY: number;
  // Animation timing
  lastServerUpdateTimeMs: number; // When the server data for targetPos was received/processed
  // Other rendering properties (pass through from server data)
  width: number;
  height: number;
  rotationDegrees: number;
  baseOpacity: number;
  currentOpacity: number;
  blurStrength: number;
  shape: CloudShapeType;
}

// Output structure, including current render position
export interface InterpolatedCloudData extends CloudInterpolationState {
  currentRenderPosX: number;
  currentRenderPosY: number;
}

interface UseCloudInterpolationProps {
  serverClouds: Map<string, SpacetimeDBCloud>;
  deltaTime: number; // Milliseconds since last frame
}

const lerp = (start: number, end: number, t: number): number => {
  return start * (1 - t) + end * t;
};

// PERFORMANCE FIX: Shared ref for renderable clouds - avoids React re-renders every frame
// The interpolation happens in the game loop, not via React state
const renderableCloudsRef: { current: Map<string, InterpolatedCloudData> } = { current: new Map() };
const interpolatedStatesRef: { current: Map<string, CloudInterpolationState> } = { current: new Map() };

export const useCloudInterpolation = ({
  serverClouds,
  deltaTime,
}: UseCloudInterpolationProps): Map<string, InterpolatedCloudData> => {
  // PERFORMANCE FIX: Use refs instead of state to avoid React re-render cascades
  // The cloud interpolation is read directly in the game loop, not by React components
  const prevServerCloudsRef = useRef<Map<string, SpacetimeDBCloud>>(new Map());

  // Effect to update interpolation targets when server data changes
  useEffect(() => {
    const now = performance.now();

    // Update existing or add new clouds
    serverClouds.forEach((serverCloud, id) => {
      const prevState = interpolatedStatesRef.current.get(id);
      const prevServerCloud = prevServerCloudsRef.current.get(id);

      // Check if the server position for this cloud has actually changed
      // or if it's a new cloud.
      const serverPositionChanged = !prevServerCloud || 
                                    prevServerCloud.posX !== serverCloud.posX || 
                                    prevServerCloud.posY !== serverCloud.posY;

      if (!prevState || serverPositionChanged) { // New cloud or server sent an update
        const currentRenderX = prevState?.targetPosX ?? serverCloud.posX;
        const currentRenderY = prevState?.targetPosY ?? serverCloud.posY;

        interpolatedStatesRef.current.set(id, {
          id,
          serverPosX: serverCloud.posX,
          serverPosY: serverCloud.posY,
          lastKnownPosX: prevState && serverPositionChanged ? currentRenderX : serverCloud.posX,
          lastKnownPosY: prevState && serverPositionChanged ? currentRenderY : serverCloud.posY,
          targetPosX: serverCloud.posX,
          targetPosY: serverCloud.posY,
          lastServerUpdateTimeMs: now,
          // Pass through other rendering properties
          width: serverCloud.width,
          height: serverCloud.height,
          rotationDegrees: serverCloud.rotationDegrees,
          baseOpacity: serverCloud.baseOpacity,
          currentOpacity: serverCloud.currentOpacity,
          blurStrength: serverCloud.blurStrength,
          shape: serverCloud.shape,
        });
      } else if (prevState) {
        // If server position hasn't changed, ensure other visual props are up-to-date
        if (prevState.width !== serverCloud.width ||
            prevState.height !== serverCloud.height ||
            prevState.rotationDegrees !== serverCloud.rotationDegrees ||
            prevState.baseOpacity !== serverCloud.baseOpacity ||
            prevState.currentOpacity !== serverCloud.currentOpacity ||
            prevState.blurStrength !== serverCloud.blurStrength ||
            !Object.is(prevState.shape, serverCloud.shape)
        ) {
            interpolatedStatesRef.current.set(id, {
                ...prevState,
                width: serverCloud.width,
                height: serverCloud.height,
                rotationDegrees: serverCloud.rotationDegrees,
                baseOpacity: serverCloud.baseOpacity,
                currentOpacity: serverCloud.currentOpacity,
                blurStrength: serverCloud.blurStrength,
                shape: serverCloud.shape,
            });
        }
      }
    });

    // Remove clouds that are no longer in serverClouds
    interpolatedStatesRef.current.forEach((_, id) => {
      if (!serverClouds.has(id)) {
        interpolatedStatesRef.current.delete(id);
      }
    });

    // Update the ref for the next comparison
    prevServerCloudsRef.current = new Map(serverClouds.entries());

  }, [serverClouds]); // Only re-run when serverClouds prop itself changes identity

  // PERFORMANCE FIX: Compute interpolated positions directly without triggering React re-renders
  // This function is called by the return value, which is read each frame
  // The interpolation happens lazily when the data is accessed
  const now = performance.now();
  
  // Update renderable clouds with current interpolated positions
  interpolatedStatesRef.current.forEach((state, id) => {
    const timeSinceLastServerUpdate = now - state.lastServerUpdateTimeMs;
    const interpolationFactor = Math.min(1.0, timeSinceLastServerUpdate / SERVER_UPDATE_INTERVAL_MS);
    
    const currentRenderPosX = lerp(state.lastKnownPosX, state.targetPosX, interpolationFactor);
    const currentRenderPosY = lerp(state.lastKnownPosY, state.targetPosY, interpolationFactor);

    renderableCloudsRef.current.set(id, {
      ...state,
      currentRenderPosX,
      currentRenderPosY,
    });
  });
  
  // Clean up clouds that were removed
  renderableCloudsRef.current.forEach((_, id) => {
    if (!interpolatedStatesRef.current.has(id)) {
      renderableCloudsRef.current.delete(id);
    }
  });

  return renderableCloudsRef.current;
}; 
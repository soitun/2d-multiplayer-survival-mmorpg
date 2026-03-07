import { useEffect, type RefObject } from 'react';
import { runtimeEngine } from '../runtimeEngine';

export interface RuntimeFrameVisibility {
  ySortedEntities: unknown;
  buildingClusters: unknown;
  visibleTreesMap: unknown;
  visibleStonesMap: unknown;
  visibleDroppedItemsMap: unknown;
  visibleCampfiresMap: unknown;
  visibleFurnacesMap: unknown;
  visibleBarbecuesMap: unknown;
  visibleLanternsMap: unknown;
  visibleWildAnimalsMap: unknown;
  visibleAnimalCorpsesMap: unknown;
  visibleBarrelsMap: unknown;
  visibleDoorsMap: unknown;
  visibleFencesMap: unknown;
  visibleAlkStationsMap: unknown;
  swimmingPlayersForBottomHalf: unknown;
}

interface UseRuntimeFrameBridgeOptions {
  overlayRgba: string;
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  frameVisibility: RuntimeFrameVisibility;
}

export function useRuntimeFrameBridge({
  overlayRgba,
  maskCanvasRef,
  frameVisibility,
}: UseRuntimeFrameBridgeOptions): void {
  useEffect(() => {
    runtimeEngine.updateFrameState('canvas', {
      maskCanvas: maskCanvasRef.current,
      overlayRgba,
    });
  }, [overlayRgba, maskCanvasRef]);

  useEffect(() => {
    runtimeEngine.updateWorldDerived('frameVisibility', frameVisibility);
    runtimeEngine.updateFrameState('visibleEntities', frameVisibility);
  }, [frameVisibility]);
}

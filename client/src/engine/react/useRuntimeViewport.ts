import { useEffect, useRef } from 'react';
import type { Player } from '../../generated/types';
import { runtimeEngine } from '../runtimeEngine';

const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 800;
const VIEWPORT_BUFFER = 300;
const VIEWPORT_UPDATE_THRESHOLD_SQ = (VIEWPORT_WIDTH / 2) ** 2;

interface UseRuntimeViewportOptions {
  localPlayer: Player | undefined;
  onRespawn?: () => void;
}

export function useRuntimeViewport({
  localPlayer,
  onRespawn,
}: UseRuntimeViewportOptions): void {
  const lastSentViewportCenterRef = useRef<{ x: number; y: number } | null>(null);
  const prevPlayerStateRef = useRef<{ isDead: boolean; positionX: number; positionY: number } | null>(null);

  useEffect(() => {
    if (!localPlayer || localPlayer.isDead) {
      runtimeEngine.setWorldViewport(null);
      prevPlayerStateRef.current = localPlayer
        ? {
            isDead: localPlayer.isDead,
            positionX: localPlayer.positionX,
            positionY: localPlayer.positionY,
          }
        : null;
      return;
    }

    const playerCenterX = localPlayer.positionX;
    const playerCenterY = localPlayer.positionY;

    const prevState = prevPlayerStateRef.current;
    const respawnDetected = Boolean(prevState?.isDead) && !localPlayer.isDead;
    const lastSentCenter = lastSentViewportCenterRef.current;
    const shouldUpdate = !lastSentCenter
      || respawnDetected
      || (playerCenterX - lastSentCenter.x) ** 2 + (playerCenterY - lastSentCenter.y) ** 2 > VIEWPORT_UPDATE_THRESHOLD_SQ;

    if (shouldUpdate) {
      runtimeEngine.setWorldViewport({
        minX: playerCenterX - (VIEWPORT_WIDTH / 2) - VIEWPORT_BUFFER,
        maxX: playerCenterX + (VIEWPORT_WIDTH / 2) + VIEWPORT_BUFFER,
        minY: playerCenterY - (VIEWPORT_HEIGHT / 2) - VIEWPORT_BUFFER,
        maxY: playerCenterY + (VIEWPORT_HEIGHT / 2) + VIEWPORT_BUFFER,
      });
      lastSentViewportCenterRef.current = { x: playerCenterX, y: playerCenterY };

      if (respawnDetected) {
        onRespawn?.();
      }
    }

    prevPlayerStateRef.current = {
      isDead: localPlayer.isDead,
      positionX: playerCenterX,
      positionY: playerCenterY,
    };
  }, [
    localPlayer?.isDead,
    localPlayer?.positionX,
    localPlayer?.positionY,
    onRespawn,
  ]);
}

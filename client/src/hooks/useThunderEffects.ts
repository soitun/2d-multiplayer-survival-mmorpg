import { useEffect, useRef } from 'react';
import { handleServerThunderEvent } from '../utils/renderers/rainRenderingUtils';
import { calculateChunkIndex } from '../utils/chunkUtils';
import { gameConfig } from '../config/gameConfig';

/** Thunder flash and sound only visible/audible within this many chunks of the lightning */
const THUNDER_RANGE_CHUNKS = 4;

interface UseThunderEffectsProps {
  connection: any | null;
  localPlayer: any | undefined;
}

function isWithinThunderRange(playerChunkIndex: number, thunderChunkIndex: number): boolean {
  const { worldWidthChunks } = gameConfig;
  const playerChunkX = playerChunkIndex % worldWidthChunks;
  const playerChunkY = Math.floor(playerChunkIndex / worldWidthChunks);
  const thunderChunkX = thunderChunkIndex % worldWidthChunks;
  const thunderChunkY = Math.floor(thunderChunkIndex / worldWidthChunks);
  const dx = Math.abs(playerChunkX - thunderChunkX);
  const dy = Math.abs(playerChunkY - thunderChunkY);
  return Math.max(dx, dy) <= THUNDER_RANGE_CHUNKS;
}

export function useThunderEffects({ connection, localPlayer }: UseThunderEffectsProps) {
  const processedThunderIds = useRef<Set<string>>(new Set());
  const localPlayerRef = useRef(localPlayer);
  localPlayerRef.current = localPlayer;

  useEffect(() => {
    if (!connection?.db?.thunderEvent) return;

    const handleThunderEvent = (_ctx: any, thunderEvent: any) => {
      const thunderId = thunderEvent.id?.toString();
      if (!thunderId || processedThunderIds.current.has(thunderId)) return;

      const player = localPlayerRef.current;
      const thunderChunkIndex = thunderEvent.chunkIndex ?? thunderEvent.chunk_index ?? 0;
      if (player?.positionX != null && player?.positionY != null) {
        const playerChunkIndex = calculateChunkIndex(player.positionX, player.positionY);
        if (!isWithinThunderRange(playerChunkIndex, thunderChunkIndex)) {
          return; // Too far - no flash, no sound (sound is also positional on server)
        }
      }

      processedThunderIds.current.add(thunderId);
      if (processedThunderIds.current.size > 100) {
        const idsArray = Array.from(processedThunderIds.current);
        processedThunderIds.current = new Set(idsArray.slice(-50));
      }

      handleServerThunderEvent(thunderEvent);
    };

    connection.db.thunder_event.onInsert(handleThunderEvent);

    return () => {
      connection.db.thunder_event?.removeOnInsert?.(handleThunderEvent);
      processedThunderIds.current.clear();
    };
  }, [connection]);
} 
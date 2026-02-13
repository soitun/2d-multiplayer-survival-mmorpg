import { useEffect, useRef } from 'react';
import { handleServerThunderEvent } from '../utils/renderers/rainRenderingUtils';
import { calculateChunkIndex } from '../utils/chunkUtils';

interface UseThunderEffectsProps {
  connection: any | null;
  localPlayer: any | undefined;
}

export function useThunderEffects({ connection, localPlayer }: UseThunderEffectsProps) {
  // Track processed thunder event IDs to prevent duplicate processing
  const processedThunderIds = useRef<Set<string>>(new Set());
  // Ref so handler always reads latest player without re-subscribing on every localPlayer change
  const localPlayerRef = useRef(localPlayer);
  localPlayerRef.current = localPlayer;

  useEffect(() => {
    if (!connection?.db?.thunderEvent) return;

    const handleThunderEvent = (ctx: any, thunderEvent: any) => {
      const thunderId = thunderEvent.id?.toString();
      if (!thunderId || processedThunderIds.current.has(thunderId)) return;

      const player = localPlayerRef.current;
      if (!player) return;

      const playerChunkIndex = calculateChunkIndex(player.positionX, player.positionY);
      if (thunderEvent.chunkIndex !== playerChunkIndex) return;

      processedThunderIds.current.add(thunderId);
      if (processedThunderIds.current.size > 100) {
        const idsArray = Array.from(processedThunderIds.current);
        processedThunderIds.current = new Set(idsArray.slice(-50));
      }

      // Lightning flash happens instantly; thunder sound is delayed on server
      handleServerThunderEvent(thunderEvent);
    };

    connection.db.thunderEvent.onInsert(handleThunderEvent);

    return () => {
      connection.db.thunderEvent?.removeOnInsert?.(handleThunderEvent);
      processedThunderIds.current.clear();
    };
  }, [connection]);
} 
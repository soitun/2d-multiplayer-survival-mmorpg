import { useState, useEffect, useRef, useMemo } from 'react';
import type { WorldChunkData } from '../generated';
import { gameConfig } from '../config/gameConfig';

/**
 * Hook that subscribes to world_chunk_data and provides an O(1) Map lookup
 * by chunk coordinates. Used for efficient water tile detection in fishing,
 * placement, and other systems that need per-tile lookups.
 *
 * Without this: O(n) iteration over all chunks per lookup.
 * With this: O(1) Map.get(chunkKey) per lookup.
 */
export function useWorldChunkDataMap(connection: any): Map<string, WorldChunkData> | undefined {
  const chunkCacheRef = useRef<Map<string, WorldChunkData>>(new Map());
  const chunkSizeRef = useRef<number>(gameConfig.chunkSizeTiles);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!connection) return;

    const syncFromTable = () => {
      chunkCacheRef.current.clear();
      for (const chunk of connection.db.worldChunkData.iter()) {
        const key = `${chunk.chunkX},${chunk.chunkY}`;
        chunkCacheRef.current.set(key, chunk);
        chunkSizeRef.current = chunk.chunkSize || chunkSizeRef.current;
      }
      setVersion(v => v + 1);
    };

    const handleChunkInsert = (_ctx: unknown, row: WorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.set(key, row);
      chunkSizeRef.current = row.chunkSize || chunkSizeRef.current;
      setVersion(v => v + 1);
    };

    const handleChunkUpdate = (_ctx: unknown, _oldRow: WorldChunkData, row: WorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.set(key, row);
      chunkSizeRef.current = row.chunkSize || chunkSizeRef.current;
      setVersion(v => v + 1);
    };

    const handleChunkDelete = (_ctx: unknown, row: WorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.delete(key);
      setVersion(v => v + 1);
    };

    connection.db.worldChunkData.onInsert(handleChunkInsert);
    connection.db.worldChunkData.onUpdate(handleChunkUpdate);
    connection.db.worldChunkData.onDelete(handleChunkDelete);

    // Initial sync from existing data (e.g. if subscription already applied)
    syncFromTable();

    const handle = connection
      .subscriptionBuilder()
      .onApplied(() => syncFromTable())
      .onError((err: unknown) => console.error('[useWorldChunkDataMap] Sub error:', err))
      .subscribe('SELECT * FROM world_chunk_data');

    return () => {
      try {
        handle?.unsubscribe?.();
      } catch {
        /* ignore */
      }
      connection.db.worldChunkData.removeOnInsert(handleChunkInsert);
      connection.db.worldChunkData.removeOnUpdate(handleChunkUpdate);
      connection.db.worldChunkData.removeOnDelete(handleChunkDelete);
    };
  }, [connection]);

  return useMemo(() => {
    if (chunkCacheRef.current.size === 0) return undefined;
    return new Map(chunkCacheRef.current);
  }, [version]);
}

/**
 * Creates an O(1) isWaterTile function using the chunk map.
 * Sea = 3, HotSpringWater = 6 (tile type enum values).
 */
export function createIsWaterTile(
  worldChunkDataMap: Map<string, WorldChunkData> | undefined,
  tileSize: number = 48
): (worldX: number, worldY: number) => boolean {
  const chunkSize = gameConfig.chunkSizeTiles;

  return (worldX: number, worldY: number): boolean => {
    if (!worldChunkDataMap) return false;

    const tileX = Math.floor(worldX / tileSize);
    const tileY = Math.floor(worldY / tileSize);
    const chunkX = Math.floor(tileX / chunkSize);
    const chunkY = Math.floor(tileY / chunkSize);
    const chunkKey = `${chunkX},${chunkY}`;

    const chunk = worldChunkDataMap.get(chunkKey);
    if (!chunk) return false;

    const localX = ((tileX % chunkSize) + chunkSize) % chunkSize;
    const localY = ((tileY % chunkSize) + chunkSize) % chunkSize;
    const tileIndex = localY * (chunk.chunkSize || chunkSize) + localX;

    if (tileIndex < 0 || tileIndex >= chunk.tileTypes.length) return false;

    const tileTypeU8 = chunk.tileTypes[tileIndex];
    return tileTypeU8 === 3 || tileTypeU8 === 6; // Sea, HotSpringWater
  };
}

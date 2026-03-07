import type { DbConnection } from '../../generated';
import type { WorldChunkData } from '../../generated/types';
import { runtimeEngine } from '../runtimeEngine';

class WorldChunkDataRuntime {
  private connection: DbConnection | null = null;
  private chunkCache = new Map<string, WorldChunkData>();
  private handle: { unsubscribe?: () => void } | null = null;
  private readonly handleChunkInsert = (_ctx: unknown, row: WorldChunkData) => {
    this.chunkCache.set(`${row.chunkX},${row.chunkY}`, row);
    this.commit();
  };
  private readonly handleChunkUpdate = (_ctx: unknown, _oldRow: WorldChunkData, row: WorldChunkData) => {
    this.chunkCache.set(`${row.chunkX},${row.chunkY}`, row);
    this.commit();
  };
  private readonly handleChunkDelete = (_ctx: unknown, row: WorldChunkData) => {
    this.chunkCache.delete(`${row.chunkX},${row.chunkY}`);
    this.commit();
  };

  start(connection: DbConnection | null): void {
    if (this.connection === connection) {
      return;
    }

    this.stop();
    if (!connection) {
      return;
    }

    this.connection = connection;
    connection.db.world_chunk_data.onInsert(this.handleChunkInsert);
    connection.db.world_chunk_data.onUpdate(this.handleChunkUpdate);
    connection.db.world_chunk_data.onDelete(this.handleChunkDelete);

    const syncFromTable = () => {
      this.chunkCache.clear();
      for (const chunk of connection.db.world_chunk_data.iter()) {
        this.chunkCache.set(`${chunk.chunkX},${chunk.chunkY}`, chunk);
      }
      this.commit();
    };

    syncFromTable();
    this.handle = connection
      .subscriptionBuilder()
      .onApplied(() => syncFromTable())
      .onError((err: unknown) => console.error('[WorldChunkDataRuntime] Sub error:', err))
      .subscribe('SELECT * FROM world_chunk_data');
  }

  stop(): void {
    if (this.handle?.unsubscribe) {
      try {
        this.handle.unsubscribe();
      } catch {
        // Ignore teardown failures.
      }
    }
    this.handle = null;

    if (this.connection) {
      this.connection.db.world_chunk_data.removeOnInsert(this.handleChunkInsert);
      this.connection.db.world_chunk_data.removeOnUpdate(this.handleChunkUpdate);
      this.connection.db.world_chunk_data.removeOnDelete(this.handleChunkDelete);
    }

    this.connection = null;
    this.chunkCache.clear();
    runtimeEngine.setWorldChunkDataMap(new Map());
  }

  private commit(): void {
    runtimeEngine.setWorldChunkDataMap(new Map(this.chunkCache));
  }
}

export const worldChunkDataRuntime = new WorldChunkDataRuntime();

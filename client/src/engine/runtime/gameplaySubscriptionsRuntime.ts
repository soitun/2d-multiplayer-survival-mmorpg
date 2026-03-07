import type { DbConnection } from '../../generated';
import { getChunkIndicesForViewportWithBuffer } from '../../utils/chunkUtils';

type Viewport = { minX: number; minY: number; maxX: number; maxY: number } | null;
type SubscriptionHandle = { unsubscribe: () => void } | null;

const DISABLE_ALL_SPATIAL_SUBSCRIPTIONS = false;
const CHUNK_BUFFER_SIZE = 1;
const CHUNK_UNSUBSCRIBE_DELAY_MS = 3000;
const CHUNK_UPDATE_THROTTLE_MS = 150;
const CHUNK_SUBSCRIBE_BATCH_SIZE = 1;

interface GameplaySubscriptionsController {
  connection: DbConnection | null;
  viewport: Viewport;
  grassEnabled: boolean;
  ensureConnectionSetup: () => void;
  subscribeToChunk: (chunkIndex: number) => SubscriptionHandle[];
  subscribeGrassForChunk: (chunkIndex: number) => SubscriptionHandle[];
  clearGrassData: () => void;
  resetDataState: () => void;
  setViewport: (viewport: Viewport) => void;
}

class GameplaySubscriptionsRuntime {
  private activeConnection: DbConnection | null = null;
  private previousGrassEnabled = true;
  private connectionSetupComplete = false;
  private nonSpatialHandles: SubscriptionHandle[] = [];
  private spatialSubs = new Map<number, SubscriptionHandle[]>();
  private subscribedChunks = new Set<number>();
  private currentChunks: number[] = [];
  private lastSpatialUpdate = 0;
  private pendingChunkUpdate: { chunks: Set<number>; timestamp: number } | null = null;
  private pendingChunkUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkUnsubscribeTimers = new Map<number, ReturnType<typeof setTimeout>>();

  isConnectionSetupComplete(): boolean {
    return this.connectionSetupComplete;
  }

  markConnectionSetupComplete(): void {
    this.connectionSetupComplete = true;
  }

  replaceNonSpatialHandles(handles: SubscriptionHandle[]): void {
    this.nonSpatialHandles.forEach((sub) => this.safeUnsubscribe(sub));
    this.nonSpatialHandles = handles;
  }

  hasSpatialSubscription(chunkIndex: number): boolean {
    return this.spatialSubs.has(chunkIndex);
  }

  setSpatialSubscriptions(chunkIndex: number, handles: SubscriptionHandle[]): void {
    if (handles.length === 0) {
      return;
    }
    this.spatialSubs.set(chunkIndex, handles);
    this.subscribedChunks.add(chunkIndex);
  }

  appendSpatialSubscriptions(chunkIndex: number, handles: SubscriptionHandle[]): void {
    if (handles.length === 0) {
      return;
    }
    const existingHandles = this.spatialSubs.get(chunkIndex) ?? [];
    existingHandles.push(...handles);
    this.spatialSubs.set(chunkIndex, existingHandles);
    this.subscribedChunks.add(chunkIndex);
  }

  getSubscribedChunks(): number[] {
    return Array.from(this.subscribedChunks);
  }

  getCurrentChunks(): number[] {
    return [...this.currentChunks];
  }

  ensureChunkSubscribed(chunkIndex: number, subscribeToChunk: (chunkIndex: number) => SubscriptionHandle[]): void {
    if (this.spatialSubs.has(chunkIndex)) {
      return;
    }
    const handles = subscribeToChunk(chunkIndex);
    this.setSpatialSubscriptions(chunkIndex, handles);
  }

  sync(controller: GameplaySubscriptionsController): void {
    const connectionChanged = this.activeConnection !== controller.connection;
    const grassChanged = this.previousGrassEnabled !== controller.grassEnabled;

    if (connectionChanged) {
      this.handleConnectionChange(controller);
    }

    if (controller.connection && !this.connectionSetupComplete) {
      controller.ensureConnectionSetup();
    }

    if (controller.connection) {
      this.syncSpatialSubscriptions(controller, controller.viewport);
      if (grassChanged) {
        this.syncGrassSubscriptions(controller, this.previousGrassEnabled, controller.grassEnabled);
      }
    } else {
      this.clearSpatialSubscriptions();
    }

    controller.setViewport(controller.viewport);
    this.previousGrassEnabled = controller.grassEnabled;
  }

  stop(controller: Pick<GameplaySubscriptionsController, 'resetDataState'>): void {
    this.resetInternalState();
    controller.resetDataState();
  }

  private handleConnectionChange(controller: GameplaySubscriptionsController): void {
    if (this.activeConnection) {
      this.resetInternalState();
      controller.resetDataState();
    }

    this.activeConnection = controller.connection;
    this.previousGrassEnabled = controller.grassEnabled;
  }

  private syncSpatialSubscriptions(controller: GameplaySubscriptionsController, nextViewport: Viewport): void {
    if (controller.connection && nextViewport) {
      if (
        Number.isNaN(nextViewport.minX)
        || Number.isNaN(nextViewport.minY)
        || Number.isNaN(nextViewport.maxX)
        || Number.isNaN(nextViewport.maxY)
      ) {
        console.warn('[SPATIAL] Viewport contains NaN values, skipping spatial update.', nextViewport);
        return;
      }

      const viewportWidth = nextViewport.maxX - nextViewport.minX;
      const viewportHeight = nextViewport.maxY - nextViewport.minY;
      if (viewportWidth <= 0 || viewportHeight <= 0) {
        console.warn('[SPATIAL] Viewport has zero or negative size, skipping spatial update.', {
          viewport: nextViewport,
          width: viewportWidth,
          height: viewportHeight,
        });
        return;
      }

      if (DISABLE_ALL_SPATIAL_SUBSCRIPTIONS) {
        this.clearSpatialSubscriptions();
        return;
      }

      const nextChunks = new Set(getChunkIndicesForViewportWithBuffer(nextViewport, CHUNK_BUFFER_SIZE));

      if (!this.subscribedChunks.size) {
        this.clearSpatialSubscriptions();
        nextChunks.forEach((chunkIndex) => {
          this.setSpatialSubscriptions(chunkIndex, controller.subscribeToChunk(chunkIndex));
        });
        this.currentChunks = [...nextChunks];
        this.lastSpatialUpdate = performance.now();
        return;
      }

      this.pendingChunkUpdate = {
        chunks: nextChunks,
        timestamp: performance.now(),
      };

      const timeSinceLastUpdate = performance.now() - this.lastSpatialUpdate;
      if (timeSinceLastUpdate >= CHUNK_UPDATE_THROTTLE_MS) {
        this.processPendingChunkUpdate(controller);
      } else if (!this.pendingChunkUpdateTimer) {
        this.pendingChunkUpdateTimer = setTimeout(() => {
          this.pendingChunkUpdateTimer = null;
          this.processPendingChunkUpdate(controller);
        }, CHUNK_UPDATE_THROTTLE_MS - timeSinceLastUpdate);
      }
      return;
    }

    this.clearSpatialSubscriptions();
  }

  private processPendingChunkUpdate(controller: GameplaySubscriptionsController): void {
    const pending = this.pendingChunkUpdate;
    if (!pending || !controller.connection) {
      return;
    }

    if (DISABLE_ALL_SPATIAL_SUBSCRIPTIONS) {
      this.pendingChunkUpdate = null;
      this.lastSpatialUpdate = performance.now();
      return;
    }

    this.pendingChunkUpdate = null;
    this.lastSpatialUpdate = performance.now();

    const nextChunkSet = pending.chunks;
    const currentChunkSet = new Set(this.currentChunks);

    if (nextChunkSet.size === 0) {
      this.clearSpatialSubscriptions();
      return;
    }

    const addedChunks = [...nextChunkSet].filter((idx) => !currentChunkSet.has(idx));
    const removedChunks = [...currentChunkSet].filter((idx) => !nextChunkSet.has(idx));

    if (addedChunks.length === 0 && removedChunks.length === 0) {
      return;
    }

    if (addedChunks.length > 20) {
      addedChunks.splice(20);
    }

    removedChunks.forEach((chunkIndex) => {
      const existingTimer = this.chunkUnsubscribeTimers.get(chunkIndex);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.chunkUnsubscribeTimers.delete(chunkIndex);
      }

      const unsubscribeTimer = setTimeout(() => {
        const handles = this.spatialSubs.get(chunkIndex);
        if (handles) {
          handles.forEach((sub) => this.safeUnsubscribe(sub));
          this.spatialSubs.delete(chunkIndex);
          this.subscribedChunks.delete(chunkIndex);
        }
        this.chunkUnsubscribeTimers.delete(chunkIndex);
      }, CHUNK_UNSUBSCRIBE_DELAY_MS);

      this.chunkUnsubscribeTimers.set(chunkIndex, unsubscribeTimer);
    });

    let addedIndex = 0;
    const processAddedBatch = () => {
      const batchEnd = Math.min(addedIndex + CHUNK_SUBSCRIBE_BATCH_SIZE, addedChunks.length);
      for (; addedIndex < batchEnd; addedIndex += 1) {
        const chunkIndex = addedChunks[addedIndex];
        const pendingUnsubTimer = this.chunkUnsubscribeTimers.get(chunkIndex);
        if (pendingUnsubTimer) {
          clearTimeout(pendingUnsubTimer);
          this.chunkUnsubscribeTimers.delete(chunkIndex);
          if (this.spatialSubs.has(chunkIndex)) {
            continue;
          }
        }

        if (this.spatialSubs.has(chunkIndex)) {
          continue;
        }

        this.setSpatialSubscriptions(chunkIndex, controller.subscribeToChunk(chunkIndex));
      }

      if (addedIndex < addedChunks.length) {
        setTimeout(processAddedBatch, 0);
        return;
      }

      this.currentChunks = [...nextChunkSet];
    };

    setTimeout(processAddedBatch, 0);
  }

  private syncGrassSubscriptions(
    controller: GameplaySubscriptionsController,
    previousGrassEnabled: boolean,
    nextGrassEnabled: boolean,
  ): void {
    if (previousGrassEnabled && !nextGrassEnabled) {
      controller.clearGrassData();
      return;
    }

    if (!previousGrassEnabled && nextGrassEnabled) {
      this.currentChunks.forEach((chunkIndex) => {
        this.appendSpatialSubscriptions(chunkIndex, controller.subscribeGrassForChunk(chunkIndex));
      });
    }
  }

  private clearSpatialSubscriptions(): void {
    this.spatialSubs.forEach((handles) => {
      handles.forEach((sub) => this.safeUnsubscribe(sub));
    });
    this.spatialSubs.clear();
    this.subscribedChunks.clear();
    this.currentChunks = [];
    this.pendingChunkUpdate = null;

    if (this.pendingChunkUpdateTimer) {
      clearTimeout(this.pendingChunkUpdateTimer);
      this.pendingChunkUpdateTimer = null;
    }

    this.chunkUnsubscribeTimers.forEach((timer) => clearTimeout(timer));
    this.chunkUnsubscribeTimers.clear();
  }

  private resetInternalState(): void {
    this.nonSpatialHandles.forEach((sub) => this.safeUnsubscribe(sub));
    this.nonSpatialHandles = [];
    this.clearSpatialSubscriptions();
    this.connectionSetupComplete = false;
    this.activeConnection = null;
  }

  private safeUnsubscribe(sub: SubscriptionHandle): void {
    if (!sub) {
      return;
    }

    try {
      sub.unsubscribe();
    } catch {
      // Ignore already-closed subscription handles during teardown.
    }
  }
}

export const gameplaySubscriptionsRuntime = new GameplaySubscriptionsRuntime();

import type { DbConnection } from '../../generated';
import type { GrassState, PlayerDiscoveredCairn } from '../../generated/types';
import { playImmediateSound } from '../../hooks/useSoundSystem';
import {
  cleanupCutGrassEffectSystem,
  handleGrassStateDestroyed,
} from '../../effects/cutGrassEffect';

type GrassDeleteListener = (ctx: unknown, grassState: GrassState) => void;
type CairnInsertListener = (ctx: unknown, discovery: PlayerDiscoveredCairn) => void;

class GameplayEventEffectsRuntime {
  private activeConnection: DbConnection | null = null;
  private localPlayerId: string | null = null;
  private playedCairnIds = new Set<string>();
  private grassDeleteListener: GrassDeleteListener | null = null;
  private cairnInsertListener: CairnInsertListener | null = null;

  start(connection: DbConnection | null, localPlayerId: string | null): void {
    const connectionChanged = this.activeConnection !== connection;
    const playerChanged = this.localPlayerId !== localPlayerId;

    if (connectionChanged) {
      this.detachListeners();
      this.activeConnection = connection;
      this.playedCairnIds.clear();
    }

    if (playerChanged) {
      this.localPlayerId = localPlayerId;
      this.playedCairnIds.clear();
    }

    if (!this.activeConnection) {
      cleanupCutGrassEffectSystem();
      return;
    }

    if (!this.grassDeleteListener) {
      this.grassDeleteListener = (_ctx, grassState) => {
        if (!this.activeConnection) {
          return;
        }
        handleGrassStateDestroyed(this.activeConnection, grassState);
      };
      this.activeConnection.db.grass_state.onDelete(this.grassDeleteListener);
    }

    if (!this.cairnInsertListener) {
      this.cairnInsertListener = (_ctx, discovery) => {
        const currentLocalPlayerId = this.localPlayerId;
        if (!currentLocalPlayerId) {
          return;
        }

        const discoveryPlayerId = discovery.playerIdentity?.toHexString() ?? null;
        if (discoveryPlayerId !== currentLocalPlayerId) {
          return;
        }

        const cairnKey = discovery.cairnId.toString();
        if (this.playedCairnIds.has(cairnKey)) {
          return;
        }

        this.playedCairnIds.add(cairnKey);
        playImmediateSound('cairn_unlock');
      };
      this.activeConnection.db.player_discovered_cairn.onInsert(this.cairnInsertListener);
    }
  }

  stop(): void {
    this.detachListeners();
    this.activeConnection = null;
    this.localPlayerId = null;
    this.playedCairnIds.clear();
    cleanupCutGrassEffectSystem();
  }

  private detachListeners(): void {
    if (!this.activeConnection) {
      return;
    }

    if (this.grassDeleteListener) {
      this.activeConnection.db.grass_state.removeOnDelete(this.grassDeleteListener);
      this.grassDeleteListener = null;
    }

    if (this.cairnInsertListener) {
      this.activeConnection.db.player_discovered_cairn.removeOnInsert(this.cairnInsertListener);
      this.cairnInsertListener = null;
    }
  }
}

export const gameplayEventEffectsRuntime = new GameplayEventEffectsRuntime();

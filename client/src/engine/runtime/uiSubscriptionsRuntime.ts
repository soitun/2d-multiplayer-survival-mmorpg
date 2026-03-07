import type { DbConnection } from '../../generated';
import type {
  ActiveConnection,
  BeaconDropEvent,
  DailyQuestDefinition,
  Message,
  PlayerDailyQuest,
  PlayerPin,
  PlayerTutorialProgress,
  QuestCompletionNotification,
  QuestProgressNotification,
  SovaQuestMessage,
  TutorialQuestDefinition,
} from '../../generated/types';
import { subscribeUiQueries } from '../adapters/spacetime/uiSubscriptions';
import { unsubscribeAll } from '../adapters/spacetime/nonSpatialSubscriptions';
import { runtimeEngine } from '../runtimeEngine';

type SubscriptionHandle = { unsubscribe: () => void } | null;
type TableHandlerSet<T> = {
  onInsert?: (ctx: unknown, row: T) => void;
  onUpdate?: (ctx: unknown, oldRow: T, row: T) => void;
  onDelete?: (ctx: unknown, row: T) => void;
};

class UiSubscriptionsRuntime {
  private connection: DbConnection | null = null;
  private subs: SubscriptionHandle[] = [];
  private cleanupCallbacks: Array<() => void> = [];

  start(connection: DbConnection | null): void {
    if (this.connection === connection) {
      return;
    }

    this.stop();
    if (!connection) {
      return;
    }

    this.connection = connection;

    const registerTableCallbacks = <T,>(table: any, handlers: TableHandlerSet<T>) => {
      if (handlers.onInsert) {
        table.onInsert(handlers.onInsert);
        this.cleanupCallbacks.push(() => table.removeOnInsert(handlers.onInsert));
      }
      if (handlers.onUpdate) {
        table.onUpdate(handlers.onUpdate);
        this.cleanupCallbacks.push(() => table.removeOnUpdate(handlers.onUpdate));
      }
      if (handlers.onDelete) {
        table.onDelete(handlers.onDelete);
        this.cleanupCallbacks.push(() => table.removeOnDelete(handlers.onDelete));
      }
    };

    const updateUiMap = <T,>(key: string, updater: (current: Map<string, T>) => Map<string, T>) => {
      runtimeEngine.updateUiTable<Map<string, T>>(key, (current) => updater(current ?? new Map()));
    };

    const bindMapTable = <T,>(
      table: any,
      key: string,
      getRowKey: (row: T) => string,
      options?: { filter?: (row: T) => boolean; updates?: boolean }
    ) => {
      const shouldInclude = options?.filter ?? (() => true);
      registerTableCallbacks<T>(table, {
        onInsert: (_ctx, row) => {
          if (!shouldInclude(row)) {
            return;
          }
          updateUiMap<T>(key, (current) => new Map(current).set(getRowKey(row), row));
        },
        onUpdate: options?.updates === false
          ? undefined
          : (_ctx, _oldRow, row) => {
              if (!shouldInclude(row)) {
                updateUiMap<T>(key, (current) => {
                  if (!current.has(getRowKey(row))) {
                    return current;
                  }
                  const next = new Map(current);
                  next.delete(getRowKey(row));
                  return next;
                });
                return;
              }
              updateUiMap<T>(key, (current) => new Map(current).set(getRowKey(row), row));
            },
        onDelete: (_ctx, row) => {
          updateUiMap<T>(key, (current) => {
            if (!current.has(getRowKey(row))) {
              return current;
            }
            const next = new Map(current);
            next.delete(getRowKey(row));
            return next;
          });
        },
      });
    };

    bindMapTable<Message>(connection.db.message, 'messages', (row) => row.id.toString());
    bindMapTable<PlayerPin>(connection.db.player_pin, 'playerPins', (row) => row.playerId.toHexString());
    bindMapTable<ActiveConnection>(connection.db.active_connection, 'activeConnections', (row) => row.identity.toHexString(), {
      updates: false,
    });
    bindMapTable<any>(connection.db.matronage, 'matronages', (row) => row.id.toString());
    bindMapTable<any>(connection.db.matronage_member, 'matronageMembers', (row) => row.playerId.toHexString());
    bindMapTable<any>(connection.db.matronage_invitation, 'matronageInvitations', (row) => row.id.toString());
    bindMapTable<any>(connection.db.matronage_owed_shards, 'matronageOwedShards', (row) => row.playerId.toHexString());
    bindMapTable<TutorialQuestDefinition>(connection.db.tutorial_quest_definition, 'tutorialQuestDefinitions', (row) => row.id);
    bindMapTable<DailyQuestDefinition>(connection.db.daily_quest_definition, 'dailyQuestDefinitions', (row) => row.id);

    const localIdentityHex = connection.identity?.toHexString() ?? null;
    const isLocalPlayerRow = (row: { playerId: { toHexString(): string } }) =>
      localIdentityHex !== null && row.playerId.toHexString() === localIdentityHex;

    bindMapTable<PlayerTutorialProgress>(
      connection.db.player_tutorial_progress,
      'playerTutorialProgress',
      (row) => row.playerId.toHexString(),
      { filter: isLocalPlayerRow }
    );
    bindMapTable<PlayerDailyQuest>(
      connection.db.player_daily_quest,
      'playerDailyQuests',
      (row) => row.id.toString(),
      { filter: isLocalPlayerRow }
    );
    bindMapTable<QuestCompletionNotification>(
      connection.db.quest_completion_notification,
      'questCompletionNotifications',
      (row) => row.id.toString(),
      { filter: isLocalPlayerRow, updates: false }
    );
    bindMapTable<QuestProgressNotification>(
      connection.db.quest_progress_notification,
      'questProgressNotifications',
      (row) => row.id.toString(),
      { filter: isLocalPlayerRow, updates: false }
    );
    bindMapTable<SovaQuestMessage>(
      connection.db.sova_quest_message,
      'sovaQuestMessages',
      (row) => row.id.toString(),
      { filter: isLocalPlayerRow, updates: false }
    );
    bindMapTable<BeaconDropEvent>(connection.db.beacon_drop_event, 'beaconDropEvents', (row) => row.id.toString());

    this.subs = subscribeUiQueries(connection);
  }

  stop(): void {
    unsubscribeAll(this.subs);
    this.subs = [];
    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup();
      } catch {
        // Ignore detach failures during teardown.
      }
    }
    this.cleanupCallbacks = [];
    this.connection = null;

    const emptyMap = new Map();
    runtimeEngine.updateUiTable('messages', () => emptyMap);
    runtimeEngine.updateUiTable('playerPins', () => new Map());
    runtimeEngine.updateUiTable('activeConnections', () => new Map());
    runtimeEngine.updateUiTable('matronages', () => new Map());
    runtimeEngine.updateUiTable('matronageMembers', () => new Map());
    runtimeEngine.updateUiTable('matronageInvitations', () => new Map());
    runtimeEngine.updateUiTable('matronageOwedShards', () => new Map());
    runtimeEngine.updateUiTable('tutorialQuestDefinitions', () => new Map());
    runtimeEngine.updateUiTable('dailyQuestDefinitions', () => new Map());
    runtimeEngine.updateUiTable('playerTutorialProgress', () => new Map());
    runtimeEngine.updateUiTable('playerDailyQuests', () => new Map());
    runtimeEngine.updateUiTable('questCompletionNotifications', () => new Map());
    runtimeEngine.updateUiTable('questProgressNotifications', () => new Map());
    runtimeEngine.updateUiTable('sovaQuestMessages', () => new Map());
    runtimeEngine.updateUiTable('beaconDropEvents', () => new Map());
  }
}

export const uiSubscriptionsRuntime = new UiSubscriptionsRuntime();

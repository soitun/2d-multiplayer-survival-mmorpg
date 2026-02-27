import type { DbConnection } from '../../../generated';
import type { SubscriptionHandle } from './nonSpatialSubscriptions';
import { subscribeNonSpatialQueries } from './nonSpatialSubscriptions';

const UI_QUERIES = [
  'SELECT * FROM message',
  'SELECT * FROM player_pin',
  'SELECT * FROM active_connection',
  'SELECT * FROM matronage',
  'SELECT * FROM matronage_member',
  'SELECT * FROM matronage_invitation',
  'SELECT * FROM matronage_owed_shards',
  'SELECT * FROM tutorial_quest_definition',
  'SELECT * FROM daily_quest_definition',
  'SELECT * FROM player_tutorial_progress',
  'SELECT * FROM player_daily_quest',
  'SELECT * FROM quest_completion_notification',
  'SELECT * FROM quest_progress_notification',
  'SELECT * FROM sova_quest_message',
  'SELECT * FROM beacon_drop_event',
];

export function subscribeUiQueries(connection: DbConnection): SubscriptionHandle[] {
  return subscribeNonSpatialQueries(
    connection,
    UI_QUERIES.map((query) => ({
      query,
      errorLabel: 'UI',
    }))
  );
}


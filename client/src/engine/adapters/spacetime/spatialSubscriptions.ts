import type { DbConnection } from '../../../generated';
import type { SubscriptionHandle } from './nonSpatialSubscriptions';

const chunkQuery = (tableName: string, chunkIndex: number): string =>
  `SELECT * FROM ${tableName} WHERE chunk_index = ${chunkIndex}`;

const DEFAULT_RESOURCE_TABLES = [
  'tree',
  'stone',
  'rune_stone',
  'cairn',
  'harvestable_resource',
  'campfire',
  'barbecue',
  'furnace',
  'lantern',
  'turret',
  'homestead_hearth',
  'broth_pot',
  'wooden_storage_box',
  'dropped_item',
  'rain_collector',
  'water_patch',
  'fertilizer_patch',
  'fire_patch',
  'placed_explosive',
  'barrel',
  'road_lamppost',
  'planted_seed',
  'sea_stack',
  'foundation_cell',
  'wall_cell',
  'door',
  'fence',
  'fumarole',
  'basalt_column',
  'wild_animal',
  'living_coral',
] as const;

export function getDefaultSpatialResourceTables(): string[] {
  return [...DEFAULT_RESOURCE_TABLES];
}

export function getDefaultEnvironmentalQueries(
  chunkIndex: number,
  options: {
    cloudsEnabled: boolean;
    grassEnabled: boolean;
    grassPerformanceMode: boolean;
  }
): string[] {
  const queries: string[] = [];

  if (options.cloudsEnabled) {
    queries.push(chunkQuery('cloud', chunkIndex));
  }

  if (options.grassEnabled) {
    queries.push(...buildGrassQueries(chunkIndex, options.grassPerformanceMode));
  }

  return queries;
}

export function buildGrassQueries(chunkIndex: number, grassPerformanceMode: boolean): string[] {
  const queries = [chunkQuery('grass', chunkIndex)];
  if (grassPerformanceMode) {
    queries.push(`SELECT * FROM grass_state WHERE chunk_index = ${chunkIndex} AND is_alive = true`);
  } else {
    queries.push(chunkQuery('grass_state', chunkIndex));
  }
  return queries;
}

export function subscribeQueries(
  connection: DbConnection,
  queries: string[],
  errorLabel: string
): SubscriptionHandle {
  return connection
    .subscriptionBuilder()
    .onError((error) => console.error(`[SpatialSubscriptions] ${errorLabel}:`, error))
    .subscribe(queries);
}

export function subscribeChunkBatches(
  connection: DbConnection,
  chunkIndex: number,
  resourceTables: string[],
  environmentalQueries: string[]
): SubscriptionHandle[] {
  const handles: SubscriptionHandle[] = [];
  const resourceQueries = resourceTables.map((tableName) => chunkQuery(tableName, chunkIndex));

  if (resourceQueries.length > 0) {
    handles.push(
      connection
        .subscriptionBuilder()
        .onError((error) => console.error(`[SpatialSubscriptions] Resource batch error for chunk ${chunkIndex}:`, error))
        .subscribe(resourceQueries)
    );
  }

  if (environmentalQueries.length > 0) {
    handles.push(
      connection
        .subscriptionBuilder()
        .onError((error) => console.error(`[SpatialSubscriptions] Environmental batch error for chunk ${chunkIndex}:`, error))
        .subscribe(environmentalQueries)
    );
  }

  return handles;
}

export function subscribeChunkIndividually(
  connection: DbConnection,
  chunkIndex: number,
  resourceTables: string[],
  environmentalQueries: string[]
): SubscriptionHandle[] {
  const handles: SubscriptionHandle[] = [];

  for (const tableName of resourceTables) {
    handles.push(
      subscribeQueries(
        connection,
        [chunkQuery(tableName, chunkIndex)],
        `${tableName} error for chunk ${chunkIndex}`
      )
    );
  }

  environmentalQueries.forEach((query, index) => {
    handles.push(
      subscribeQueries(
        connection,
        [query],
        `Environmental query ${index + 1} error for chunk ${chunkIndex}`
      )
    );
  });

  return handles;
}

export function subscribeGrassChunk(
  connection: DbConnection,
  chunkIndex: number,
  grassPerformanceMode: boolean
): SubscriptionHandle[] {
  return [
    subscribeQueries(
      connection,
      buildGrassQueries(chunkIndex, grassPerformanceMode),
      `Grass batch error for chunk ${chunkIndex}`
    ),
  ];
}


import type { DbConnection } from '../../../generated';
import type { SubscriptionHandle } from './nonSpatialSubscriptions';

const chunkQuery = (tableName: string, chunkIndex: number): string =>
  `SELECT * FROM ${tableName} WHERE chunk_index = ${chunkIndex}`;

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


import type { DbConnection } from '../../../generated';

export type SubscriptionHandle = { unsubscribe: () => void } | null;

export interface NonSpatialSubscriptionSpec {
  query: string;
  onError?: (error: unknown) => void;
  errorLabel?: string;
}

export function subscribeNonSpatialQueries(
  connection: DbConnection,
  specs: NonSpatialSubscriptionSpec[]
): SubscriptionHandle[] {
  return specs.map((spec) => {
    const builder = connection.subscriptionBuilder();
    builder.onError((error) => {
      if (spec.onError) {
        spec.onError(error);
        return;
      }
      if (spec.errorLabel) {
        console.error(`[${spec.errorLabel} Sub Error]:`, error);
        return;
      }
      console.error('[NonSpatialSubscriptions] Subscription error:', spec.query, error);
    });
    return builder.subscribe(spec.query);
  });
}

export function unsubscribeAll(handles: SubscriptionHandle[]): void {
  for (const handle of handles) {
    try {
      handle?.unsubscribe();
    } catch {
      // no-op best-effort unsubscribe
    }
  }
}


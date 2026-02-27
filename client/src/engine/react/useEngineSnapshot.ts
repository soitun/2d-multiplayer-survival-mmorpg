import { useSyncExternalStore } from 'react';
import { runtimeEngine } from '../runtimeEngine';
import type { EngineRuntimeSnapshot } from '../types';

const selectIdentity = <T,>(value: T): T => value;

export function useEngineSnapshot<T = EngineRuntimeSnapshot>(
  selector: (snapshot: EngineRuntimeSnapshot) => T = selectIdentity as (snapshot: EngineRuntimeSnapshot) => T
): T {
  return useSyncExternalStore(
    runtimeEngine.subscribe,
    () => selector(runtimeEngine.getSnapshot()),
    () => selector(runtimeEngine.getSnapshot())
  );
}


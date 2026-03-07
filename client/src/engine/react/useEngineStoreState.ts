import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { runtimeEngine } from '../runtimeEngine';
import { useEngineSnapshot } from './useEngineSnapshot';

function resolveStateAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function'
    ? (action as (value: T) => T)(current)
    : action;
}

export function useEngineWorldTableState<T>(
  key: string,
  createInitialValue: () => T
): [T, Dispatch<SetStateAction<T>>] {
  const initialValueRef = useRef<T | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = createInitialValue();
  }

  useEffect(() => {
    runtimeEngine.ensureWorldTable(key, initialValueRef.current as T);
  }, [key]);

  const value = useEngineSnapshot(
    (snapshot) => (snapshot.world.tables[key] as T | undefined) ?? (initialValueRef.current as T)
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    runtimeEngine.updateWorldTable<T>(key, (current) =>
      resolveStateAction(action, current ?? (initialValueRef.current as T))
    );
  }, [key]);

  return [value, setValue];
}

export function useEngineUiTableState<T>(
  key: string,
  createInitialValue: () => T
): [T, Dispatch<SetStateAction<T>>] {
  const initialValueRef = useRef<T | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = createInitialValue();
  }

  useEffect(() => {
    runtimeEngine.ensureUiTable(key, initialValueRef.current as T);
  }, [key]);

  const value = useEngineSnapshot(
    (snapshot) => (snapshot.ui.uiTables[key] as T | undefined) ?? (initialValueRef.current as T)
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    runtimeEngine.updateUiTable<T>(key, (current) =>
      resolveStateAction(action, current ?? (initialValueRef.current as T))
    );
  }, [key]);

  return [value, setValue];
}

export function useEngineWorldRuntimeState<T>(
  key: string,
  createInitialValue: () => T
): [T, Dispatch<SetStateAction<T>>] {
  const initialValueRef = useRef<T | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = createInitialValue();
  }

  const value = useEngineSnapshot(
    (snapshot) => (snapshot.world.runtimeState[key] as T | undefined) ?? (initialValueRef.current as T)
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    runtimeEngine.updateWorldState<T>(key, (current) =>
      resolveStateAction(action, current ?? (initialValueRef.current as T))
    );
  }, [key]);

  return [value, setValue];
}

export function useEngineWorldDerivedState<T>(
  key: string,
  createInitialValue: () => T
): [T, Dispatch<SetStateAction<T>>] {
  const initialValueRef = useRef<T | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = createInitialValue();
  }

  const value = useEngineSnapshot(
    (snapshot) => (snapshot.world.derived[key] as T | undefined) ?? (initialValueRef.current as T)
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    runtimeEngine.updateWorldDerived<T>(key, (current) =>
      resolveStateAction(action, current ?? (initialValueRef.current as T))
    );
  }, [key]);

  return [value, setValue];
}

export function useEngineInputState<T>(
  key: keyof ReturnType<typeof runtimeEngine.getSnapshot>['input'],
  createInitialValue: () => T
): [T, Dispatch<SetStateAction<T>>] {
  const initialValueRef = useRef<T | null>(null);
  if (initialValueRef.current === null) {
    initialValueRef.current = createInitialValue();
  }

  const value = useEngineSnapshot(
    (snapshot) => (snapshot.input[key] as T | undefined) ?? (initialValueRef.current as T)
  );

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    runtimeEngine.updateInputState<T>(key, (current) =>
      resolveStateAction(action, current ?? (initialValueRef.current as T))
    );
  }, [key]);

  return [value, setValue];
}

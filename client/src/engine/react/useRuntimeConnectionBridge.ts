import { useEffect } from 'react';
import type { DbConnection } from '../../generated';
import { runtimeEngine } from '../runtimeEngine';

interface UseRuntimeConnectionBridgeOptions {
  connection: DbConnection | null;
  identityHex: string | null;
  connected: boolean;
  loading: boolean;
}

export function useRuntimeConnectionBridge({
  connection,
  identityHex,
  connected,
  loading,
}: UseRuntimeConnectionBridgeOptions): void {
  useEffect(() => {
    runtimeEngine.dispatch({
      type: 'runtime/setConnectionState',
      connected,
      loading,
    });
    runtimeEngine.setConnection(connection, identityHex);
  }, [connection, identityHex, connected, loading]);
}

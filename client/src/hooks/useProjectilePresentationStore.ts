import { useEffect, useMemo, useRef, useState } from 'react';
import { DbConnection } from '../generated';
import { Projectile, ProjectileResolvedEvent } from '../generated/types';
import { recordProjectileDebugEvent } from '../utils/projectileDebug';

interface UseProjectilePresentationStoreProps {
  connection: DbConnection | null;
  authoritativeProjectiles: Map<string, Projectile>;
  optimisticProjectiles: Map<string, Projectile>;
  localPlayerId?: string;
}

const RESOLVED_RETENTION_MS = 1500;

function getPresentationKey(projectile: Projectile, fallbackId: string): string {
  const clientShotId = projectile.clientShotId?.trim?.() ?? '';
  return clientShotId.length > 0 ? clientShotId : fallbackId;
}

export function useProjectilePresentationStore({
  connection,
  authoritativeProjectiles,
  optimisticProjectiles,
  localPlayerId,
}: UseProjectilePresentationStoreProps): Map<string, Projectile> {
  const [resolvedProjectileIds, setResolvedProjectileIds] = useState<Set<string>>(() => new Set());
  const [resolvedClientShotIds, setResolvedClientShotIds] = useState<Set<string>>(() => new Set());
  const cleanupTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!connection) return;

    const scheduleCleanup = (
      key: string,
      cleanup: () => void,
    ) => {
      const existingTimer = cleanupTimersRef.current.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        cleanup();
        cleanupTimersRef.current.delete(key);
      }, RESOLVED_RETENTION_MS);
      cleanupTimersRef.current.set(key, timer);
    };

    const handleProjectileResolvedInsert = (ctx: any, event: ProjectileResolvedEvent) => {
      if (ctx?.event?.type === 'SubscribeApplied') return;

      const projectileId = event.projectileId.toString();
      setResolvedProjectileIds(prev => {
        const next = new Set(prev);
        next.add(projectileId);
        return next;
      });
      scheduleCleanup(`projectile:${projectileId}`, () => {
        setResolvedProjectileIds(prev => {
          const next = new Set(prev);
          next.delete(projectileId);
          return next;
        });
      });

      const clientShotId = event.clientShotId?.trim?.() ?? '';
      if (clientShotId.length > 0) {
        setResolvedClientShotIds(prev => {
          const next = new Set(prev);
          next.add(clientShotId);
          return next;
        });
        scheduleCleanup(`shot:${clientShotId}`, () => {
          setResolvedClientShotIds(prev => {
            const next = new Set(prev);
            next.delete(clientShotId);
            return next;
          });
        });
      }
    };

    connection.db.projectile_resolved_event.onInsert(handleProjectileResolvedInsert);

    return () => {
      connection.db.projectile_resolved_event.removeOnInsert(handleProjectileResolvedInsert);
      cleanupTimersRef.current.forEach(timer => clearTimeout(timer));
      cleanupTimersRef.current.clear();
    };
  }, [connection]);

  const renderableProjectiles = useMemo(() => {
    const merged = new Map<string, Projectile>();
    const authoritativeClientShotIds = new Set<string>();

    authoritativeProjectiles.forEach((projectile, id) => {
      const clientShotId = projectile.clientShotId?.trim?.() ?? '';
      if (resolvedProjectileIds.has(id)) return;
      if (clientShotId && resolvedClientShotIds.has(clientShotId)) return;
      if (clientShotId) authoritativeClientShotIds.add(clientShotId);
      merged.set(getPresentationKey(projectile, id), projectile);
    });

    optimisticProjectiles.forEach((projectile, id) => {
      const clientShotId = projectile.clientShotId?.trim?.() ?? '';
      if (resolvedProjectileIds.has(id)) return;
      if (clientShotId && (resolvedClientShotIds.has(clientShotId) || authoritativeClientShotIds.has(clientShotId))) {
        return;
      }
      const presentationKey = getPresentationKey(projectile, id);
      if (!merged.has(presentationKey)) {
        merged.set(presentationKey, projectile);
      }
    });

    return merged;
  }, [authoritativeProjectiles, optimisticProjectiles, resolvedClientShotIds, resolvedProjectileIds]);

  useEffect(() => {
    if (!localPlayerId) return;

    const localRenderable = Array.from(renderableProjectiles.values())
      .filter((projectile) => projectile.ownerId?.toHexString?.() === localPlayerId && projectile.sourceType === 0)
      .map((projectile) => ({
        id: projectile.id.toString(),
        clientShotId: projectile.clientShotId?.trim?.() ?? '',
        trackingKey: getPresentationKey(projectile, projectile.id.toString()),
      }));

    if (localRenderable.length > 0) {
      recordProjectileDebugEvent('presentation-local-renderables', {
        count: localRenderable.length,
        renderables: localRenderable,
      });
    }
  }, [localPlayerId, renderableProjectiles]);

  return renderableProjectiles;
}

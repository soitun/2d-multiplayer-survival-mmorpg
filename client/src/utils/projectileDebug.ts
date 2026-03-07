type ProjectileDebugPayload = Record<string, unknown>;

declare global {
  interface Window {
    __projectileDebugEvents?: Array<{
      atMs: number;
      stage: string;
      payload: ProjectileDebugPayload;
    }>;
    __projectileDebugEnabled?: boolean;
  }
}

const MAX_PROJECTILE_DEBUG_EVENTS = 250;

export function recordProjectileDebugEvent(stage: string, payload: ProjectileDebugPayload): void {
  if (typeof window === 'undefined') return;

  const isEnabled = window.__projectileDebugEnabled ?? true;
  if (!isEnabled) return;

  const entry = {
    atMs: performance.now(),
    stage,
    payload,
  };

  if (!window.__projectileDebugEvents) {
    window.__projectileDebugEvents = [];
  }

  window.__projectileDebugEvents.push(entry);
  if (window.__projectileDebugEvents.length > MAX_PROJECTILE_DEBUG_EVENTS) {
    window.__projectileDebugEvents.splice(0, window.__projectileDebugEvents.length - MAX_PROJECTILE_DEBUG_EVENTS);
  }

  console.log('[ProjectileDebug]', stage, payload);
}

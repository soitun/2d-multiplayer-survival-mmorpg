/**
 * Game debug utilities - gated logging to avoid console spam in production.
 * Set ENABLE_DEBUG to true when investigating issues.
 */

export const ENABLE_DEBUG = false;

/** Truncate long error messages for display (reducer error handlers, etc.). */
export function trimErrorForDisplay(msg: string): string {
  return msg.length > 80 ? msg.slice(0, 77) + '…' : msg;
}

/** Log only when ENABLE_DEBUG is true. */
export function logDebug(...args: unknown[]): void {
  if (ENABLE_DEBUG) {
    console.log(...args);
  }
}

/** Log reducer/event status (gated). */
export function logReducer(tag: string, ...args: unknown[]): void {
  if (ENABLE_DEBUG) {
    console.log(`[${tag}]`, ...args);
  }
}

/** Lag diagnostic report - logs performance metrics when ENABLE_LAG_DIAGNOSTICS is true. */
export interface LagDiagnosticData {
  frameCount: number;
  totalFrameTime: number;
  maxFrameTime: number;
  slowFrames: number;
  verySlowFrames: number;
  lastServerUpdateTime: number;
  serverUpdateCount: number;
  maxServerLatency: number;
  totalServerLatency: number;
}

export function logLagDiagnostic(
  p: LagDiagnosticData,
  entityCounts: { players: number; trees: number; stones: number; ySorted: number; campfires: number; boxes: number; resources: number; items: number; grass: number; seaStacks: number }
): void {
  const avgFrameTime = p.frameCount > 0 ? p.totalFrameTime / p.frameCount : 0;
  const avgServerLatency = p.serverUpdateCount > 0 ? p.totalServerLatency / p.serverUpdateCount : 0;
  const fps = p.frameCount > 0 ? 1000 / avgFrameTime : 0;
  const slowFramePct = p.frameCount > 0 ? ((p.slowFrames / p.frameCount) * 100).toFixed(1) : '0';
  const verySlowFramePct = p.frameCount > 0 ? ((p.verySlowFrames / p.frameCount) * 100).toFixed(1) : '0';
  const isReactBottleneck = avgFrameTime > 16 || parseFloat(slowFramePct) > 10;
  const isNetworkBottleneck = avgServerLatency > 100;

  console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');
  console.log('%c                    🎮 LAG DIAGNOSTIC REPORT                    ', 'color: #00ff00; font-weight: bold; font-size: 14px');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');
  if (isReactBottleneck && isNetworkBottleneck) {
    console.log('%c⚠️  VERDICT: BOTH React AND Network are causing lag!', 'color: #ff6600; font-weight: bold');
  } else if (isReactBottleneck) {
    console.log('%c🔴 VERDICT: REACT/RENDERING is the primary bottleneck', 'color: #ff0000; font-weight: bold');
  } else if (isNetworkBottleneck) {
    console.log('%c🔵 VERDICT: NETWORK LATENCY is the primary bottleneck', 'color: #0088ff; font-weight: bold');
  } else {
    console.log('%c✅ VERDICT: Performance is GOOD - no major bottleneck detected', 'color: #00ff00; font-weight: bold');
  }
  console.log('');
  console.log('%c📊 RENDER PERFORMANCE (React/Canvas)', 'color: #ffaa00; font-weight: bold');
  console.log(`   FPS: ${fps.toFixed(1)} | Avg Frame: ${avgFrameTime.toFixed(2)}ms | Max Frame: ${p.maxFrameTime.toFixed(2)}ms`);
  console.log(`   Slow Frames (>16ms): ${p.slowFrames}/${p.frameCount} (${slowFramePct}%)`);
  console.log(`   Very Slow (>33ms): ${p.verySlowFrames}/${p.frameCount} (${verySlowFramePct}%)`);
  if (avgFrameTime > 16) {
    console.log('%c   ⚠️  Average frame time exceeds 60fps budget!', 'color: #ff6600');
  }
  console.log('');
  console.log('%c🌐 NETWORK PERFORMANCE (SpacetimeDB)', 'color: #00aaff; font-weight: bold');
  console.log(`   Server Updates: ${p.serverUpdateCount} | Avg Interval: ${avgServerLatency.toFixed(0)}ms | Max: ${p.maxServerLatency.toFixed(0)}ms`);
  if (avgServerLatency > 100) {
    console.log('%c   ⚠️  High server update latency - check network/maincloud RTT', 'color: #ff6600');
  } else if (p.serverUpdateCount < 10) {
    console.log('%c   ℹ️  Low update count - player may be stationary', 'color: #888888');
  }
  console.log('');
  console.log('%c📦 ENTITY COUNTS (data volume)', 'color: #aa88ff; font-weight: bold');
  console.log(`   Players: ${entityCounts.players} | Trees: ${entityCounts.trees} | Stones: ${entityCounts.stones}`);
  console.log(`   Y-Sorted Entities: ${entityCounts.ySorted}`);
  console.log(`   Visible - Campfires: ${entityCounts.campfires} | Boxes: ${entityCounts.boxes} | Resources: ${entityCounts.resources}`);
  console.log(`   Visible - Items: ${entityCounts.items} | Grass: ${entityCounts.grass} | SeaStacks: ${entityCounts.seaStacks}`);
  console.log('');
  console.log('%c💡 RECOMMENDATIONS', 'color: #ffff00; font-weight: bold');
  if (isReactBottleneck) {
    if (entityCounts.ySorted > 500) console.log('   - Y-sorted entities are high - consider reducing view distance');
    if (entityCounts.grass > 200) console.log('   - Grass count is high - consider disabling grass in settings');
    if (p.verySlowFrames > 5) console.log('   - Many frames below 30fps - check for GC pressure or heavy useMemo');
    console.log('   - Try disabling weather overlay, tree shadows, or reducing particle effects');
  }
  if (isNetworkBottleneck) {
    console.log('   - Consider testing with local SpacetimeDB instance');
    console.log('   - Check if you are far from maincloud servers');
    console.log('   - Reduce movement input frequency if possible');
  }
  console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');
}

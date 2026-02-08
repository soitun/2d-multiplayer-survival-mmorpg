// Production Logger - Silences console output in production mode
// Also filters known-harmless SpacetimeDB SDK noise in development mode
// Import this at the very top of main.tsx to take effect early
//
// NOTE: This is a RUNTIME fallback. The primary mechanism is esbuild's 
// `drop: ['console', 'debugger']` in vite.config.ts which strips all 
// console calls at BUILD TIME for production builds.

const isProduction = import.meta.env.PROD;

if (isProduction) {
  // Store original methods for emergency debugging in production
  const originalConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };

  // No-op function
  const noop = () => {};

  // Override ALL console methods in production for complete silence
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;

  // Expose original console for emergency debugging in production
  // Access via: (window as any).__console.log("debug message")
  (window as any).__console = originalConsole;
} else {
  // Development mode: suppress known-harmless SpacetimeDB SDK cache noise.
  // The SDK uses console.log for ALL log levels (including errors) with %c styling.
  // Spatial chunk subscriptions cause harmless "row not in cache" messages when
  // entities move between subscribed/unsubscribed chunks - the SDK handles this
  // gracefully by treating the update as an insert, but logs noisy errors.
  const originalLog = console.log.bind(console);
  let sdkCacheWarningCount = 0;

  console.log = (...args: any[]) => {
    // SpacetimeDB SDK formats all messages as: console.log("%c❌ ERROR%c message", style1, style2)
    // The first arg is always a string with %c markers when coming from stdbLogger
    if (typeof args[0] === 'string' && args[0].includes('not present in the cache')) {
      sdkCacheWarningCount++;
      // Log a summary periodically instead of every occurrence
      if (sdkCacheWarningCount === 1 || sdkCacheWarningCount % 100 === 0) {
        originalLog(`[SDK] Suppressed ${sdkCacheWarningCount} harmless cache miss warning(s) from spatial subscriptions`);
      }
      return;
    }
    originalLog(...args);
  };
}

export {};


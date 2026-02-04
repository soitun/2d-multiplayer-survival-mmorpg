// Production Logger - Silences console output in production mode
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
}

export {};


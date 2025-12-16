// Production Logger - Silences console output in production mode
// Import this at the very top of main.tsx to take effect early

const isProduction = import.meta.env.PROD;

if (isProduction) {
  // Store original methods for potential debugging
  const originalConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
  };

  // No-op function
  const noop = () => {};

  // Override console methods in production
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  
  // Keep warn and error for important issues
  // Uncomment these to silence warnings too:
  // console.warn = noop;

  // Expose original console for emergency debugging in production
  // Access via: (window as any).__console.log("debug message")
  (window as any).__console = originalConsole;
}

export {};


// Silence console.log in production - MUST be first import
import './utils/productionLogger';

import ReactDOM from 'react-dom/client';
import App from './App';

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const errorMessage = error?.message || String(error);
  
  // Check if this is a SpacetimeDB deserialization error
  if (errorMessage.includes('Tried to read') && errorMessage.includes('byte(s)')) {
    console.error('[CRITICAL] SpacetimeDB deserialization error detected:', errorMessage);
    console.error('[CRITICAL] This usually indicates:', {
      possibleCauses: [
        'Schema mismatch between client and server',
        'Corrupted data in the database',
        'Version mismatch between SDK versions',
        'Network corruption during data transmission'
      ],
      error: error,
      stack: error?.stack
    });
    
    // Prevent the error from crashing the app
    event.preventDefault();
    
    // Try to recover by reloading the page after a delay
    // This will force a fresh connection and regenerate bindings if needed
    console.warn('[RECOVERY] Attempting to recover by reloading page in 3 seconds...');
    setTimeout(() => {
      window.location.reload();
    }, 3000);
    
    return;
  }
  
  // Log other unhandled rejections but don't prevent them
  console.error('[Unhandled Promise Rejection]:', error);
});

// Global error handler for regular errors
window.addEventListener('error', (event) => {
  const error = event.error;
  const errorMessage = error?.message || event.message || String(event);
  
  // Check if this is a SpacetimeDB deserialization error
  if (errorMessage.includes('Tried to read') && errorMessage.includes('byte(s)')) {
    console.error('[CRITICAL] SpacetimeDB deserialization error detected:', errorMessage);
    event.preventDefault();
    
    // Try to recover by reloading the page
    console.warn('[RECOVERY] Attempting to recover by reloading page in 3 seconds...');
    setTimeout(() => {
      window.location.reload();
    }, 3000);
    
    return;
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

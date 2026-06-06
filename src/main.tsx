import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite WebSocket / HMR connection errors so they do not show Unhandled Rejection overlays.
if (typeof window !== 'undefined') {
  const ignorePatterns = [
    'websocket',
    'vite',
    'hmr',
    'failed to connect',
    'closed without opened'
  ];

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = event.reason ? String(event.reason) : '';
    const messageStr = event.reason?.message ? String(event.reason.message) : '';
    const errorStr = event.reason?.stack ? String(event.reason.stack) : '';
    
    if (
      ignorePatterns.some(pattern => 
        reasonStr.toLowerCase().includes(pattern) || 
        messageStr.toLowerCase().includes(pattern) ||
        errorStr.toLowerCase().includes(pattern)
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message ? String(event.message) : '';
    const errorStr = event.error ? String(event.error) : '';
    
    if (
      ignorePatterns.some(pattern => 
        msg.toLowerCase().includes(pattern) || 
        errorStr.toLowerCase().includes(pattern)
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

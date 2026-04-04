import { useState, useEffect } from 'react';
import { flushQueue, startOfflineSyncLoop } from '../offline';
import { isOnline } from '../offline';

export default function SyncToast() {
  const [syncState, setSyncState] = useState({ show: false, message: '', type: 'info' });

  useEffect(() => {
    // Start the sync loop with progress callback
    startOfflineSyncLoop({
      onFlush: (result) => {
        if (!result) return;
        if (result.done > 0) {
          setSyncState({
            show: true,
            message: `Synced ${result.done} item${result.done > 1 ? 's' : ''}${result.left > 0 ? `, ${result.left} remaining` : ''}`,
            type: result.left > 0 ? 'warning' : 'success'
          });
        } else if (result.left > 0) {
          setSyncState({
            show: true,
            message: `${result.left} item${result.left > 1 ? 's' : ''} waiting to sync`,
            type: 'warning'
          });
        }
      }
    });

    // Listen for online/offline events
    const handleOnline = () => {
      setSyncState({
        show: true,
        message: 'Back online! Syncing data...',
        type: 'info'
      });
    };

    const handleOffline = () => {
      setSyncState({
        show: true,
        message: 'You are offline. Changes will sync when reconnected.',
        type: 'warning'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-hide after 4 seconds for success messages
  useEffect(() => {
    if (syncState.show && syncState.type === 'success') {
      const timer = setTimeout(() => {
        setSyncState(s => ({ ...s, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [syncState]);

  if (!syncState.show) return null;

  const bgColor = {
    success: '#d4edda',
    warning: '#fff3cd',
    info: '#cce5ff',
    error: '#f8d7da'
  }[syncState.type] || '#cce5ff';

  const textColor = {
    success: '#155724',
    warning: '#856404',
    info: '#004085',
    error: '#721c24'
  }[syncState.type] || '#004085';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        padding: '12px 16px',
        background: bgColor,
        color: textColor,
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 320,
        animation: 'slideIn 0.3s ease'
      }}
      role="status"
      aria-live="polite"
    >
      <span>{syncState.message}</span>
      <button
        onClick={() => setSyncState(s => ({ ...s, show: false }))}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 6px',
          fontSize: 16,
          opacity: 0.7
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

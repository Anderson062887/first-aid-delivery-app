import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isOnline, flushQueue, getQueue, removeFromQueue, clearQueue } from '../offline';

export default function OfflineQueue() {
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const navigate = useNavigate();

  // Load queue on mount
  useEffect(() => {
    setQueue(getQueue());
  }, []);

  // Listen for online/offline
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function handleSync() {
    if (!online) return;
    setSyncing(true);
    try {
      const result = await flushQueue();
      setQueue(getQueue());
      if (result.done > 0) {
        // Show success
      }
    } finally {
      setSyncing(false);
    }
  }

  function handleRemove(id) {
    if (confirm('Remove this item from queue? Data will be lost.')) {
      removeFromQueue(id);
      setQueue(getQueue());
    }
  }

  function handleClearAll() {
    if (confirm('Clear entire queue? All pending data will be lost.')) {
      clearQueue();
      setQueue([]);
    }
  }

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString();
  }

  function getActionLabel(item) {
    const method = item.method || 'POST';
    const path = item.path || '';
    if (path.includes('/deliveries')) return 'Delivery';
    if (path.includes('/visits') && path.includes('/submit')) return 'Visit Submit';
    if (path.includes('/visits')) return 'Visit';
    return `${method} request`;
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <h2>Offline Queue</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: online ? '#28a745' : '#dc3545'
          }} />
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>

        <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
          {queue.length === 0
            ? 'No pending items in the queue.'
            : `${queue.length} item${queue.length > 1 ? 's' : ''} waiting to sync.`}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn primary"
            onClick={handleSync}
            disabled={!online || syncing || queue.length === 0}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          {queue.length > 0 && (
            <button className="btn" onClick={handleClearAll} style={{ color: '#dc3545' }}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pending Items</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {queue.map(item => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{getActionLabel(item)}</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    Queued: {formatTimestamp(item.ts)}
                  </div>
                  {item.body?.lines?.length && (
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {item.body.lines.length} line item{item.body.lines.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <button
                  className="btn"
                  onClick={() => handleRemove(item.id)}
                  style={{ padding: '4px 8px', fontSize: 12 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

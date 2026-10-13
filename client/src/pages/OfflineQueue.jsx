import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  isOnline, flushQueue, getQueue, removeFromQueue, clearQueue,
  getFailed, removeFailed, retryFailed, onSyncResult
} from '../offline';

export default function OfflineQueue() {
  const [queue, setQueue] = useState([]);
  const [failed, setFailed] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(isOnline());
  const navigate = useNavigate();

  function reload() {
    setQueue(getQueue());
    setFailed(getFailed());
  }

  // Load on mount, and again after every sync (including background ones)
  useEffect(() => {
    reload();
    return onSyncResult(reload);
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
    setMessage('');
    try {
      const result = await flushQueue();
      reload();
      if (result.authRequired) setMessage('Your session has expired. Log in again to sync.');
      else if (result.failed > 0) setMessage(`${result.failed} item${result.failed > 1 ? 's were' : ' was'} rejected by the server. See below.`);
      else if (result.left > 0) setMessage(`Sent ${result.done}. ${result.left} will be retried.`);
      else if (result.done > 0) setMessage(`Synced ${result.done} item${result.done > 1 ? 's' : ''}.`);
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

  async function handleRetry(id) {
    retryFailed(id);
    reload();
    if (online) await handleSync();
  }

  function handleRemoveFailed(id) {
    if (confirm('Remove this item? Data will be lost.')) {
      removeFailed(id);
      reload();
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

        {message && <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{message}</p>}

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

      {failed.length > 0 && (
        <div className="card" style={{ marginTop: 16, borderColor: '#ffa39e' }}>
          <h3 style={{ marginTop: 0 }}>Couldn't be saved</h3>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            The server rejected these, so they won't sync on their own. Fix the cause
            (for example, ask an admin to reopen the visit), then retry, or remove them.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {failed.map(item => (
              <div
                key={item.id}
                style={{
                  border: '1px solid #ffccc7',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{getActionLabel(item)}</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    Queued: {formatTimestamp(item.ts)}
                  </div>
                  <div style={{ fontSize: 13, color: '#a8071a', marginTop: 4 }}>
                    {item.error || `Rejected (HTTP ${item.status})`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => handleRetry(item.id)} disabled={syncing}
                    style={{ padding: '4px 8px', fontSize: 12 }}>
                    Retry
                  </button>
                  <button className="btn" onClick={() => handleRemoveFailed(item.id)}
                    style={{ padding: '4px 8px', fontSize: 12 }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

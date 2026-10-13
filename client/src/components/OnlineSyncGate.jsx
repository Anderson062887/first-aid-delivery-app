import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { startOfflineSyncLoop, flushQueue, isOnline, getQueueCount, getFailedCount } from '../offline';
import { useAuth } from '../auth/AuthContext.jsx';

const banner = (bg, border) => ({ background: bg, borderColor: border, margin: '12px auto', maxWidth: 1100 });

export default function OnlineSyncGate(){
  const { user, refresh } = useAuth();
  const [last, setLast] = useState(null);
  const [failed, setFailed] = useState(getFailedCount());
  const [sessionExpired, setSessionExpired] = useState(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Keep syncing whenever the browser comes back online
  useEffect(() => startOfflineSyncLoop({
    onFlush: (r) => {
      setLast(r || null);
      setFailed(getFailedCount());
      if (r?.authRequired) {
        setSessionExpired(true);
        refreshRef.current(); // the session is gone: show the login page
      }
    }
  }), []);

  // Sync as soon as someone is logged in (also right after logging back in)
  useEffect(() => {
    if (!user) return;
    setSessionExpired(false);
    flushQueue().catch(() => {});
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = getQueueCount();

  if (sessionExpired && waiting > 0) {
    return (
      <div className="card no-print" style={banner('#fff1f0', '#ffa39e')}>
        <strong>Your session has expired.</strong> {waiting} change{waiting === 1 ? ' is' : 's are'} waiting
        on this device. Log in again to sync {waiting === 1 ? 'it' : 'them'}.
      </div>
    );
  }

  if (failed > 0 && user) {
    return (
      <div className="card no-print" style={banner('#fff1f0', '#ffa39e')}>
        <strong>{failed} change{failed === 1 ? '' : 's'} couldn't be saved.</strong> The server rejected
        {failed === 1 ? ' it' : ' them'}. <Link to="/offline-queue">Review and retry</Link>
      </div>
    );
  }

  if (!last) return null;

  // Show “queued” message while offline with pending jobs
  if (!isOnline() && last.left > 0) {
    return (
      <div className="card no-print" style={banner('#fffbe6', '#ffe58f')}>
        Offline: {last.left} change(s) queued. They’ll sync when you’re back online.
      </div>
    );
  }

  // Briefly show a “synced” message after coming online
  if (isOnline() && last.done > 0) {
    return (
      <div className="card no-print" style={banner('#f6ffed', '#b7eb8f')}>
        Synced {last.done} queued change(s).
      </div>
    );
  }

  return null;
}

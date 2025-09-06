import { useEffect, useState } from 'react';
import { startOfflineSyncLoop, flushQueue, isOnline } from '../offline';

export default function OnlineSyncGate(){
  const [last, setLast] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Try to flush once on mount
    flushQueue().then(r => { if (mounted) setLast(r) }).catch(()=>{});

    // Keep flushing when the browser goes back online
    startOfflineSyncLoop({
      onFlush: (r) => setLast(r || null)
    });

    return () => { mounted = false; };
  }, []);

  if (!last) return null;

  // Show “queued” message while offline with pending jobs
  if (!isOnline() && last.left > 0) {
    return (
      <div className="card no-print" style={{background:'#fffbe6', borderColor:'#ffe58f', margin:'12px auto', maxWidth:1100}}>
        Offline: {last.left} change(s) queued. They’ll sync when you’re back online.
      </div>
    );
  }

  // Briefly show a “synced” message after coming online
  if (isOnline() && last.done > 0) {
    return (
      <div className="card no-print" style={{background:'#f6ffed', borderColor:'#b7eb8f', margin:'12px auto', maxWidth:1100}}>
        Synced {last.done} queued change(s).
      </div>
    );
  }

  return null;
}

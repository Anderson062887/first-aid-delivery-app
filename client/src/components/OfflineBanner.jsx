import { useEffect, useState } from 'react';
import { startOfflineSyncLoop, isOnline } from '../offline';

export default function OfflineBanner(){
  const [online, setOnline] = useState(isOnline());
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const unsubscribe = startOfflineSyncLoop({
      onFlush: (res) => {
        if (res && typeof res.done === 'number') {
          setLastSync({ at: new Date(), pushed: res.done, left: res.left });
        }
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) {
    if (!lastSync || !lastSync.pushed) return null; // nothing was sent: nothing to report
    return (
      <div className="card notice ok">
        <strong>Synced.</strong> Pushed {lastSync.pushed} queued change(s). {lastSync.left>0 ? `Remaining: ${lastSync.left}` : ''}
      </div>
    );
  }

  return (
    <div className="card notice warn">
      <strong>Offline.</strong> Changes will be saved locally and synced when you reconnect.
    </div>
  );
}

// client/src/offline.js

const KEY = 'offlineQueue:v1';

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function enqueue(req) {
  const q = loadQueue();
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() :
             `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  q.push({ id, ts: Date.now(), ...req });
  saveQueue(q);
}

export async function flushQueue() {
  let q = loadQueue();
  if (q.length === 0) return { done: 0, left: 0 };

  const remaining = [];
  let done = 0;

  for (const job of q) {
    try {
      const res = await fetch(job.path, {
        method: job.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job.body),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      done++;
    } catch {
      remaining.push(job); // keep for next time
    }
  }
  saveQueue(remaining);
  return { done, left: remaining.length };
}

let started = false;
export function startOfflineSyncLoop({ onFlush } = {}) {
  if (started) return;
  started = true;

  // try immediately if online
  if (isOnline()) {
    flushQueue().then(onFlush).catch(()=>{});
  }

  window.addEventListener('online', async () => {
    const result = await flushQueue().catch(()=> null);
    onFlush && onFlush(result);
  });
}

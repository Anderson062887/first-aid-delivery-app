import { clear as clearIdb } from 'idb-keyval';
// client/src/offline.js

const KEY = 'offlineQueue:v1';
const FAILED_KEY = 'offlineFailed:v1'; // jobs the server rejected (see below)

// Read the CSRF token the server sets in the csrf_token cookie
export function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// The csrf_token cookie expires after 24h, which can happen during a long
// offline stretch. Any API request makes the server issue a fresh one.
async function ensureCsrfToken() {
  if (getCsrfToken()) return getCsrfToken();
  try {
    await fetch('/api/auth/me', { credentials: 'include' });
  } catch {
    // still offline / unreachable; the jobs below will fail and stay queued
  }
  return getCsrfToken();
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
// Fired whenever the queue or the rejected list changes (e.g. for the menu count)
export const QUEUE_CHANGED = 'offlinequeue:change';
function notifyChange() {
  try { window.dispatchEvent(new Event(QUEUE_CHANGED)); } catch {}
}

function saveQueue(q) {
  localStorage.setItem(KEY, JSON.stringify(q));
  notifyChange();
}

// Get queue for display
export function getQueue() {
  return loadQueue();
}

// Remove item from queue
export function removeFromQueue(id) {
  const q = loadQueue();
  const filtered = q.filter(item => item.id !== id);
  saveQueue(filtered);
}

// Clear entire queue
export function clearQueue() {
  saveQueue([]);
}

// Remove everything this app stored for the signed-in user, so the next person
// on a shared device can't see it and doesn't replay it under their own login:
// the offline queue, cached lists, drafts and the service worker's API caches.
export async function clearUserData() {
  try {
    clearQueue();
    localStorage.removeItem(FAILED_KEY);
    notifyChange();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('cache:') || key === 'selectedRepId') localStorage.removeItem(key);
    }
  } catch {}
  try { sessionStorage.clear(); } catch {}
  try { await clearIdb(); } catch {}
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.filter(n => n.startsWith('api-')).map(n => caches.delete(n)));
    }
  } catch {}
}

// Get queue count
export function getQueueCount() {
  return loadQueue().length;
}

export function enqueue(req) {
  const q = loadQueue();
  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() :
             `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  q.push({ id, ts: Date.now(), ...req });
  saveQueue(q);
}

// Boxes with a delivery for this visit that's still waiting in the queue
export function queuedBoxIdsForVisit(visitId) {
  return new Set(
    loadQueue()
      .filter(j => j.path === '/api/deliveries' && (j.method || 'POST') === 'POST'
        && String(j.body?.visit) === String(visitId) && j.body?.box)
      .map(j => String(j.body.box))
  );
}

// ---- Jobs the server rejected -------------------------------------------
// A job the server refuses (e.g. 400 bad data, 403 not allowed, 409 visit
// already submitted) will never succeed by retrying, so it leaves the queue.
// It is kept here with the server's reason so the user can see it, fix the
// cause and retry, or remove it. Nothing is thrown away silently.
function loadFailed() {
  try { return JSON.parse(localStorage.getItem(FAILED_KEY) || '[]'); }
  catch { return []; }
}
function saveFailed(list) {
  localStorage.setItem(FAILED_KEY, JSON.stringify(list));
  notifyChange();
}

export function getFailed() {
  return loadFailed();
}
export function getFailedCount() {
  return loadFailed().length;
}
export function removeFailed(id) {
  saveFailed(loadFailed().filter(j => j.id !== id));
}
// Put a rejected job back in the queue (after fixing the cause)
export function retryFailed(id) {
  const list = loadFailed();
  const job = list.find(j => j.id === id);
  if (!job) return;
  saveFailed(list.filter(j => j.id !== id));
  // eslint-disable-next-line no-unused-vars
  const { status, error, failedAt, ...original } = job;
  saveQueue([...loadQueue(), original]);
}

// ---- Sync -------------------------------------------------------------------
async function readError(res) {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {}
  return `HTTP ${res.status}`;
}

const isTransient = (status) => status === 408 || status === 429 || status >= 500;

const listeners = new Set();
// Subscribe to the result of every sync run. Returns an unsubscribe function.
export function onSyncResult(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let inFlight = null;

/**
 * Send queued jobs in order. Resolves with
 *   { done, left, failed, authRequired }
 * - done: sent successfully          - left: still queued (will retry)
 * - failed: rejected by the server this run (moved to getFailed())
 * - authRequired: the session expired; nothing more is sent until login
 * Only one run happens at a time; concurrent callers share it, so a job is
 * never sent twice.
 */
export function flushQueue() {
  if (!inFlight) {
    inFlight = runFlush().finally(() => { inFlight = null; });
    inFlight.then(result => listeners.forEach(fn => { try { fn(result); } catch {} }));
  }
  return inFlight;
}

async function runFlush() {
  const q = loadQueue();
  if (q.length === 0) return { done: 0, left: 0, failed: 0, authRequired: false };

  const handled = new Set();  // ids that left the queue (sent or rejected)
  const rejected = [];
  let done = 0;
  let authRequired = false;
  const csrfToken = await ensureCsrfToken();

  for (const job of q) {
    let res;
    try {
      res = await fetch(job.path, {
        method: job.method || 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(job.body),
        credentials: 'include'
      });
    } catch {
      break; // no connection: keep this job and the rest, in order
    }

    if (res.ok) {
      done++;
      handled.add(job.id);
      continue;
    }
    if (res.status === 401) {
      authRequired = true; // logged out / session expired: retry after login
      break;
    }
    const error = await readError(res);
    if (res.status === 403 && /csrf/i.test(error)) break; // token problem: retry later
    if (isTransient(res.status)) continue;                 // server trouble: retry later

    rejected.push({ ...job, status: res.status, error, failedAt: Date.now() });
    handled.add(job.id);
  }

  // Remove handled jobs from the *current* queue, so anything queued while
  // this run was sending is kept.
  const remaining = loadQueue().filter(j => !handled.has(j.id));
  saveQueue(remaining);
  if (rejected.length) saveFailed([...loadFailed(), ...rejected]);

  return { done, left: remaining.length, failed: rejected.length, authRequired };
}

let started = false;
/**
 * Sync now (if online) and whenever the browser comes back online.
 * Safe to call from several components: the listeners are set up once, and
 * every caller's onFlush receives every result. Returns an unsubscribe function.
 */
export function startOfflineSyncLoop({ onFlush } = {}) {
  const unsubscribe = onFlush ? onSyncResult(onFlush) : () => {};
  if (!started) {
    started = true;
    if (isOnline()) flushQueue().catch(() => {});
    window.addEventListener('online', () => { flushQueue().catch(() => {}); });
  }
  return unsubscribe;
}

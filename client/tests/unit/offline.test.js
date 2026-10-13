import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOnline, enqueue, flushQueue, clearUserData, getQueueCount,
  getFailed, retryFailed, onSyncResult, startOfflineSyncLoop
} from '../../src/offline.js';
import { clear as clearIdb } from 'idb-keyval';

describe('offline.js', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('isOnline', () => {
    it('should return true when navigator.onLine is true', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      expect(isOnline()).toBe(true);
    });

    it('should return false when navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      expect(isOnline()).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should add request to localStorage queue', () => {
      const request = { path: '/api/test', method: 'POST', body: { foo: 'bar' } };

      enqueue(request);

      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].path).toBe('/api/test');
      expect(queue[0].method).toBe('POST');
      expect(queue[0].body).toEqual({ foo: 'bar' });
      expect(queue[0]).toHaveProperty('id');
      expect(queue[0]).toHaveProperty('ts');
    });

    it('should append to existing queue', () => {
      enqueue({ path: '/api/first', method: 'POST', body: {} });
      enqueue({ path: '/api/second', method: 'POST', body: {} });

      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue).toHaveLength(2);
      expect(queue[0].path).toBe('/api/first');
      expect(queue[1].path).toBe('/api/second');
    });

    it('should generate unique IDs for each request', () => {
      enqueue({ path: '/api/test1', method: 'POST', body: {} });
      enqueue({ path: '/api/test2', method: 'POST', body: {} });

      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue[0].id).not.toBe(queue[1].id);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      enqueue({ path: '/api/test', method: 'POST', body: {} });
      const after = Date.now();

      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue[0].ts).toBeGreaterThanOrEqual(before);
      expect(queue[0].ts).toBeLessThanOrEqual(after);
    });
  });

  describe('flushQueue', () => {
    const clearCsrfCookie = () => {
      document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    };

    beforeEach(() => {
      document.cookie = 'csrf_token=tok123; path=/';
    });

    afterEach(clearCsrfCookie);

    it('should send the CSRF token header with queued requests', async () => {
      global.fetch.mockResolvedValue({ ok: true });

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', path: '/api/deliveries', method: 'POST', body: {} }
      ]));

      await flushQueue();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith('/api/deliveries', expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'tok123' })
      }));
    });

    it('should fetch a fresh CSRF cookie first when it has expired', async () => {
      clearCsrfCookie();
      global.fetch
        .mockImplementationOnce(async () => {
          // server sets a new csrf_token cookie on any request
          document.cookie = 'csrf_token=fresh456; path=/';
          return { ok: true };
        })
        .mockResolvedValueOnce({ ok: true });

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', path: '/api/deliveries', method: 'POST', body: {} }
      ]));

      const result = await flushQueue();

      expect(result).toEqual({ done: 1, left: 0, failed: 0, authRequired: false });
      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/auth/me', expect.objectContaining({
        credentials: 'include'
      }));
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/deliveries', expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'fresh456' })
      }));
    });

    it('should return immediately if queue is empty', async () => {
      const result = await flushQueue();

      expect(result).toEqual({ done: 0, left: 0, failed: 0, authRequired: false });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should process and remove successful requests', async () => {
      global.fetch.mockResolvedValue({ ok: true });

      // Add request to queue
      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', ts: Date.now(), path: '/api/test', method: 'POST', body: { data: 1 } }
      ]));

      const result = await flushQueue();

      expect(result.done).toBe(1);
      expect(result.left).toBe(0);
      expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ data: 1 }),
        credentials: 'include'
      }));

      // Queue should be empty
      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue).toHaveLength(0);
    });

    it('should keep failed requests in queue', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', ts: Date.now(), path: '/api/test', method: 'POST', body: {} }
      ]));

      const result = await flushQueue();

      expect(result.done).toBe(0);
      expect(result.left).toBe(1);

      // Request should still be in queue
      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue).toHaveLength(1);
    });

    it('should handle network errors and keep requests', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', ts: Date.now(), path: '/api/test', method: 'POST', body: {} }
      ]));

      const result = await flushQueue();

      expect(result.done).toBe(0);
      expect(result.left).toBe(1);
    });

    it('should process multiple requests and track partial success', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true });

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', path: '/api/a', method: 'POST', body: {} },
        { id: '2', path: '/api/b', method: 'POST', body: {} },
        { id: '3', path: '/api/c', method: 'POST', body: {} }
      ]));

      const result = await flushQueue();

      expect(result.done).toBe(2);
      expect(result.left).toBe(1);

      // Only the failed request should remain
      const queue = JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('2');
    });

    it('should use correct method from request', async () => {
      global.fetch.mockResolvedValue({ ok: true });

      localStorage.setItem('offlineQueue:v1', JSON.stringify([
        { id: '1', path: '/api/test', method: 'PATCH', body: { update: true } }
      ]));

      await flushQueue();

      expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
        method: 'PATCH'
      }));
    });
  });

  describe('flushQueue: rejected jobs, expired login, overlapping runs', () => {
    beforeEach(() => { document.cookie = 'csrf_token=tok123; path=/'; });

    const queue = (...ids) => localStorage.setItem('offlineQueue:v1', JSON.stringify(
      ids.map(id => ({ id, ts: 1, path: `/api/${id}`, method: 'POST', body: {} }))
    ));
    const queued = () => JSON.parse(localStorage.getItem('offlineQueue:v1') || '[]').map(j => j.id);
    const reply = (status, error) => ({ ok: status < 300, status, json: async () => (error ? { error } : {}) });

    it('moves a job the server rejects out of the queue, with the reason', async () => {
      queue('a', 'b');
      global.fetch
        .mockResolvedValueOnce(reply(409, 'This visit was already submitted'))
        .mockResolvedValueOnce(reply(201));

      const result = await flushQueue();

      expect(result).toEqual({ done: 1, left: 0, failed: 1, authRequired: false });
      expect(queued()).toEqual([]);
      expect(getFailed()).toEqual([expect.objectContaining({
        id: 'a', status: 409, error: 'This visit was already submitted'
      })]);
    });

    it('a retried job goes back in the queue', async () => {
      queue('a');
      global.fetch.mockResolvedValueOnce(reply(400, 'Bad data'));
      await flushQueue();

      retryFailed('a');
      expect(getFailed()).toEqual([]);
      expect(queued()).toEqual(['a']);
      expect(JSON.parse(localStorage.getItem('offlineQueue:v1'))[0]).not.toHaveProperty('error');
    });

    it('stops on an expired login and keeps every job for after login', async () => {
      queue('a', 'b');
      global.fetch.mockResolvedValue(reply(401, 'Session expired'));

      const result = await flushQueue();

      expect(result).toMatchObject({ authRequired: true, left: 2, failed: 0 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(queued()).toEqual(['a', 'b']);
    });

    it('keeps jobs on a CSRF error or server trouble, but rejects other 403s', async () => {
      queue('csrf');
      global.fetch.mockResolvedValueOnce(reply(403, 'CSRF token invalid'));
      await flushQueue();
      expect(queued()).toEqual(['csrf']);

      global.fetch.mockResolvedValueOnce(reply(503));
      await flushQueue();
      expect(queued()).toEqual(['csrf']);

      global.fetch.mockResolvedValueOnce(reply(403, "Only the visit's rep can do this"));
      await flushQueue();
      expect(queued()).toEqual([]);
      expect(getFailed().map(j => j.id)).toEqual(['csrf']);
    });

    it('stops at the first network error, keeping order', async () => {
      queue('a', 'b');
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const result = await flushQueue();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.left).toBe(2);
      expect(queued()).toEqual(['a', 'b']);
    });

    it('overlapping calls share one run, so nothing is sent twice', async () => {
      queue('a');
      global.fetch.mockResolvedValue(reply(201));
      const [r1, r2] = await Promise.all([flushQueue(), flushQueue()]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(r1).toBe(r2);
    });

    it('keeps a job queued while a run is sending', async () => {
      queue('a');
      global.fetch.mockImplementationOnce(async () => {
        enqueue({ path: '/api/late', method: 'POST', body: {} });
        return reply(201);
      });
      const result = await flushQueue();
      expect(result).toMatchObject({ done: 1, left: 1 });
      expect(JSON.parse(localStorage.getItem('offlineQueue:v1')).map(j => j.path)).toEqual(['/api/late']);
    });

    it('tells every subscriber about each run', async () => {
      const a = vi.fn(); const b = vi.fn();
      const offA = startOfflineSyncLoop({ onFlush: a });
      const offB = onSyncResult(b);
      queue('x');
      global.fetch.mockResolvedValue(reply(201));
      await flushQueue();
      await Promise.resolve();
      expect(a).toHaveBeenCalledWith(expect.objectContaining({ done: 1 }));
      expect(b).toHaveBeenCalledWith(expect.objectContaining({ done: 1 }));
      offA(); offB();
    });
  });

  describe('clearUserData (logout)', () => {
    it("removes the queue, cached lists, drafts and the service worker's API caches", async () => {
      enqueue({ path: '/api/deliveries', method: 'POST', body: {} });
      localStorage.setItem('offlineFailed:v1', '[{"id":"f"}]');
      localStorage.setItem('cache:items:v1', '[]');
      localStorage.setItem('cache:boxes:l1:v1', '[]');
      localStorage.setItem('selectedRepId', 'u1');
      localStorage.setItem('unrelated', 'keep');
      sessionStorage.setItem('delivery_draft', '{}');
      const deleted = [];
      globalThis.caches = {
        keys: vi.fn().mockResolvedValue(['api-items', 'api-visit', 'workbox-precache-v2']),
        delete: vi.fn(async (n) => { deleted.push(n); return true; })
      };

      await clearUserData();

      expect(getQueueCount()).toBe(0);
      expect(getFailed()).toEqual([]);
      expect(Object.keys(localStorage.store).sort()).toEqual(['offlineQueue:v1', 'unrelated']);
      expect(sessionStorage.getItem('delivery_draft')).toBeNull();
      expect(clearIdb).toHaveBeenCalled();
      expect(deleted).toEqual(['api-items', 'api-visit']); // app shell cache stays
      delete globalThis.caches;
    });
  });
});

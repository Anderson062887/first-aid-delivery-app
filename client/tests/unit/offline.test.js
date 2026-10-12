import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isOnline, enqueue, flushQueue, clearUserData, getQueueCount } from '../../src/offline.js';
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

      expect(result).toEqual({ done: 1, left: 0 });
      expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/auth/me', expect.objectContaining({
        credentials: 'include'
      }));
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/deliveries', expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'fresh456' })
      }));
    });

    it('should return immediately if queue is empty', async () => {
      const result = await flushQueue();

      expect(result).toEqual({ done: 0, left: 0 });
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

  describe('clearUserData (logout)', () => {
    it("removes the queue, cached lists, drafts and the service worker's API caches", async () => {
      enqueue({ path: '/api/deliveries', method: 'POST', body: {} });
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
      expect(Object.keys(localStorage.store).sort()).toEqual(['offlineQueue:v1', 'unrelated']);
      expect(sessionStorage.getItem('delivery_draft')).toBeNull();
      expect(clearIdb).toHaveBeenCalled();
      expect(deleted).toEqual(['api-items', 'api-visit']); // app shell cache stays
      delete globalThis.caches;
    });
  });
});

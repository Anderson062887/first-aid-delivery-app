import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the offline module before importing api
vi.mock('../../src/offline.js', () => ({
  isOnline: vi.fn(() => true),
  enqueue: vi.fn(),
  getCsrfToken: vi.fn(() => 'test-csrf')
}));

import { api, visitApi, authApi, usersApi, locationsApi, reportsApi } from '../../src/api.js';
import { isOnline, enqueue } from '../../src/offline.js';

describe('api.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    isOnline.mockReturnValue(true);
  });

  describe('api.items', () => {
    describe('list', () => {
      it('should fetch items and cache them', async () => {
        const items = [{ _id: '1', name: 'Item 1' }, { _id: '2', name: 'Item 2' }];
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(items)
        });

        const result = await api.items.list();

        expect(result).toEqual(items);
        expect(global.fetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
          credentials: 'include'
        }));
        // Should cache the items
        expect(localStorage.setItem).toHaveBeenCalled();
      });

      it('should return cached items on fetch failure', async () => {
        const cachedItems = [{ _id: '1', name: 'Cached Item' }];
        localStorage.store['cache:items:v1'] = JSON.stringify(cachedItems);
        localStorage.getItem.mockReturnValue(JSON.stringify(cachedItems));
        global.fetch.mockRejectedValue(new Error('Network error'));

        const result = await api.items.list();

        expect(result).toEqual(cachedItems);
      });

      it('should return empty array when fetch fails and no cache', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));
        localStorage.getItem.mockReturnValue(null);

        const result = await api.items.list();

        expect(result).toEqual([]);
      });
    });
  });

  describe('api.locations', () => {
    describe('list', () => {
      it('should fetch locations without query', async () => {
        const locations = [{ _id: 'loc1', name: 'Location 1' }];
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(locations)
        });

        const result = await api.locations.list();

        expect(result).toEqual(locations);
        expect(global.fetch).toHaveBeenCalledWith('/api/locations?', expect.any(Object));
      });

      it('should fetch locations with search query', async () => {
        const locations = [{ _id: 'loc1', name: 'Test' }];
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(locations)
        });

        await api.locations.list('test');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('q=test'),
          expect.any(Object)
        );
      });

      it('should cache unfiltered location list', async () => {
        const locations = [{ _id: 'loc1', name: 'Location 1' }];
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(locations)
        });

        await api.locations.list(); // No query

        expect(localStorage.setItem).toHaveBeenCalled();
      });

      it('should NOT cache filtered location list', async () => {
        const locations = [{ _id: 'loc1', name: 'Test' }];
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(locations)
        });
        localStorage.setItem.mockClear();

        await api.locations.list('search');

        // setItem should not have been called for caching
        expect(localStorage.setItem).not.toHaveBeenCalled();
      });
    });
  });

  describe('api.deliveries', () => {
    describe('list', () => {
      it('should fetch deliveries with filters', async () => {
        const deliveries = { data: [], pageInfo: { total: 0 } };
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(deliveries)
        });

        await api.deliveries.list({
          location: 'loc1',
          from: '2024-01-01',
          to: '2024-01-31',
          page: 1,
          limit: 25
        });

        const calledUrl = global.fetch.mock.calls[0][0];
        expect(calledUrl).toContain('location=loc1');
        expect(calledUrl).toContain('from=2024-01-01');
        expect(calledUrl).toContain('to=2024-01-31');
        expect(calledUrl).toContain('page=1');
        expect(calledUrl).toContain('limit=25');
      });
    });

    describe('create (offline-aware)', () => {
      it('should POST when online', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ _id: '123', total: 50 })
        });

        const result = await api.deliveries.create({
          location: 'loc1',
          box: 'box1',
          lines: [{ item: 'item1', quantity: 2 }]
        });

        expect(result._id).toBe('123');
        expect(global.fetch).toHaveBeenCalledWith('/api/deliveries', expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        }));
        expect(enqueue).not.toHaveBeenCalled();
      });

      it('should queue when offline', async () => {
        isOnline.mockReturnValue(false);

        const result = await api.deliveries.create({
          location: 'loc1',
          box: 'box1',
          lines: []
        });

        expect(result._offlineQueued).toBe(true);
        expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
          path: '/api/deliveries',
          method: 'POST'
        }));
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('should queue when the request fails at the network level while "online"', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

        const payload = { location: 'loc1', box: 'box1', lines: [{ item: 'item1', quantity: 1 }] };
        const result = await api.deliveries.create(payload);

        expect(result._offlineQueued).toBe(true);
        expect(enqueue).toHaveBeenCalledWith({ path: '/api/deliveries', method: 'POST', body: payload });
      });

      it('should reject with the server error and NOT queue when the server rejects it', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'line.quantity must be > 0' })
        });

        await expect(api.deliveries.create({ location: 'loc1', box: 'box1', lines: [] }))
          .rejects.toMatchObject({ message: 'line.quantity must be > 0', status: 400 });
        expect(enqueue).not.toHaveBeenCalled();
      });
    });

    describe('update (offline-aware)', () => {
      it('should PATCH when online', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ _id: '123', total: 100 })
        });

        const result = await api.deliveries.update('123', {
          lines: [{ item: 'item1', quantity: 4 }]
        });

        expect(result._id).toBe('123');
        expect(global.fetch).toHaveBeenCalledWith('/api/deliveries/123', expect.objectContaining({
          method: 'PATCH'
        }));
      });

      it('should queue PATCH when offline', async () => {
        isOnline.mockReturnValue(false);

        const result = await api.deliveries.update('123', { lines: [] });

        expect(result._offlineQueued).toBe(true);
        expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
          path: '/api/deliveries/123',
          method: 'PATCH'
        }));
      });
    });
  });

  describe('visitApi', () => {
    describe('start', () => {
      it('should start visit when online', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ _id: 'visit1', status: 'open' })
        });

        const result = await visitApi.start('location1');

        expect(result._id).toBe('visit1');
        expect(global.fetch).toHaveBeenCalledWith('/api/visits', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ location: 'location1' })
        }));
      });

      it('should fail (not queue) visit start when offline', async () => {
        isOnline.mockReturnValue(false);

        await expect(visitApi.start('location1')).rejects.toThrow(/offline/i);
        expect(enqueue).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('should fail (not queue) visit start on a network error', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(visitApi.start('location1')).rejects.toThrow(/no connection/i);
        expect(enqueue).not.toHaveBeenCalled();
      });
    });

    describe('submit', () => {
      it('should submit visit with outcome and note when online', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'submitted', outcome: 'completed' })
        });

        await visitApi.submit('visit1', { outcome: 'completed', note: 'Done' });

        expect(global.fetch).toHaveBeenCalledWith('/api/visits/visit1/submit', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ outcome: 'completed', note: 'Done' })
        }));
      });

      it('should queue visit submit when offline', async () => {
        isOnline.mockReturnValue(false);

        const result = await visitApi.submit('visit1', { outcome: 'partial' });

        expect(result._offlineQueued).toBe(true);
        expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
          path: '/api/visits/visit1/submit',
          body: { outcome: 'partial' }
        }));
      });
    });

    describe('setNote', () => {
      it('should update note when online', async () => {
        isOnline.mockReturnValue(true);
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: true })
        });

        await visitApi.setNote('visit1', 'Test note');

        expect(global.fetch).toHaveBeenCalledWith('/api/visits/visit1/note', expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ note: 'Test note' })
        }));
      });
    });
  });

  describe('authApi', () => {
    describe('login', () => {
      it('should send login request', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ _id: '1', email: 'test@example.com' })
        });

        const result = await authApi.login('test@example.com', 'password');

        expect(result.email).toBe('test@example.com');
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', password: 'password' })
        }));
      });
    });

    describe('logout', () => {
      it('should send logout request', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: true })
        });

        await authApi.logout();

        expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
          method: 'POST'
        }));
      });
    });

    describe('me', () => {
      it('should fetch current user', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ _id: '1', name: 'Test User' })
        });

        const result = await authApi.me();

        expect(result.name).toBe('Test User');
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
          method: 'GET'
        }));
      });
    });
  });

  // The server rejects any write without a matching x-csrf-token header
  // (403 in production; CSRF is skipped in server tests, so check it here).
  describe('CSRF header on writes', () => {
    const writes = [
      ['usersApi.create', () => usersApi.create({ name: 'A', email: 'a@x.com', password: 'Passw0rd!' })],
      ['usersApi.patch', () => usersApi.patch('u1', { active: false })],
      ['usersApi.delete', () => usersApi.delete('u1')],
      ['locationsApi.create', () => locationsApi.create({ name: 'Loc' })],
      ['locationsApi.update', () => locationsApi.update('l1', { name: 'Loc' })],
      ['locationsApi.delete', () => locationsApi.delete('l1')],
      ['api.items.create', () => api.items.create({ name: 'I', pricePerPack: 1 })],
      ['api.items.update', () => api.items.update('i1', { name: 'I' })],
      ['api.items.delete', () => api.items.delete('i1')],
      ['api.locations.create', () => api.locations.create({ name: 'Loc' })],
      ['api.deliveries.create', () => api.deliveries.create({ location: 'l', box: 'b', lines: [] })],
      ['api.deliveries.update', () => api.deliveries.update('d1', { lines: [] })],
      ['visitApi.start', () => visitApi.start('l1')],
      ['visitApi.submit', () => visitApi.submit('v1', { outcome: 'partial' })],
      ['visitApi.update', () => visitApi.update('v1', { note: 'x' })],
      ['api.boxes.create', () => api.boxes.create({ location: 'l1', size: 'M' })],
      ['api.boxes.update', () => api.boxes.update('b1', { active: false })],
      ['api.boxes.remove', () => api.boxes.remove('b1', 'l1')],
    ];

    it.each(writes)('%s sends x-csrf-token', async (_name, call) => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ _id: 'x' })
      });

      await call();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, opts] = global.fetch.mock.calls[0];
      expect(opts.headers['x-csrf-token']).toBe('test-csrf');
    });
  });

  // The server needs the user's timezone to turn YYYY-MM-DD into the right day
  describe('timezone on date filters', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    it.each([
      ['api.deliveries.list', () => api.deliveries.list({ from: '2026-10-01', to: '2026-10-11' })],
      ['reportsApi.itemsUsage', () => reportsApi.itemsUsage({ from: '2026-10-01' })],
      ['reportsApi.repProductivity', () => reportsApi.repProductivity({ to: '2026-10-11' })],
      ['reportsApi.outcomes', () => reportsApi.outcomes({ from: '2026-10-01', to: '2026-10-11' })],
    ])('%s sends tz', async (_name, call) => {
      global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await call();
      const url = new URL(global.fetch.mock.calls[0][0], 'http://x');
      expect(url.searchParams.get('tz')).toBe(tz);
    });

    it('omits tz when there is no date filter', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await reportsApi.outcomes({ location: 'l1' });
      const url = new URL(global.fetch.mock.calls[0][0], 'http://x');
      expect(url.searchParams.has('tz')).toBe(false);
    });
  });

  describe('api.boxes.list', () => {
    it('returns the list on success', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([{ _id: 'b1' }]) });
      await expect(api.boxes.list('l1')).resolves.toEqual([{ _id: 'b1' }]);
      expect(global.fetch.mock.calls[0][0]).toBe('/api/boxes?location=l1');
    });

    it('throws on an error response instead of returning it as the box list', async () => {
      // Callers fall back to their offline copy only when this throws
      global.fetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Session expired' }) });
      await expect(api.boxes.list('l1')).rejects.toThrow('Session expired');
    });

    it('asks for retired boxes only when requested', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
      await api.boxes.list('l1', { all: true });
      expect(global.fetch.mock.calls[0][0]).toBe('/api/boxes?location=l1&all=1');
    });
  });

  describe('api.deliveries.listByVisit', () => {
    it('calls the grouped endpoint with the same filters', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [], pageInfo: {} }) });
      await api.deliveries.listByVisit({ location: 'l1', repName: 'Ann', page: 2, limit: 10 });
      const url = new URL(global.fetch.mock.calls[0][0], 'http://x');
      expect(url.pathname).toBe('/api/deliveries/by-visit');
      expect(Object.fromEntries(url.searchParams)).toEqual({ location: 'l1', repName: 'Ann', page: '2', limit: '10' });
    });
  });

  describe('visitApi.recentByLocation', () => {
    it('loads every location\'s recent visits in one request', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ l1: [] }) });
      await expect(visitApi.recentByLocation(2)).resolves.toEqual({ l1: [] });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch.mock.calls[0][0]).toBe('/api/visits/recent-by-location?per=2');
    });
  });
});

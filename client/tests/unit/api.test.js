import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the offline module before importing api
vi.mock('../../src/offline.js', () => ({
  isOnline: vi.fn(() => true),
  enqueue: vi.fn()
}));

import { api, visitApi, authApi } from '../../src/api.js';
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

      it('should queue visit start when offline', async () => {
        isOnline.mockReturnValue(false);

        const result = await visitApi.start('location1');

        expect(result._offlineQueued).toBe(true);
        expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
          path: '/api/visits',
          method: 'POST',
          body: { location: 'location1' }
        }));
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
});

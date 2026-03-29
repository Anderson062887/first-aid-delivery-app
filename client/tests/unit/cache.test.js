import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, set } from 'idb-keyval';
import {
  cacheItems, getItems,
  cacheLocations, getLocations,
  cacheBoxes, getBoxes,
  cacheVisit, getVisit,
  offlineReady
} from '../../src/cache.js';

describe('cache.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cacheItems / getItems', () => {
    it('should store items in IndexedDB', async () => {
      const items = [{ _id: '1', name: 'Item 1' }, { _id: '2', name: 'Item 2' }];

      await cacheItems(items);

      expect(set).toHaveBeenCalledWith('cache.items', items);
    });

    it('should retrieve items from IndexedDB', async () => {
      const items = [{ _id: '1', name: 'Item 1' }];
      get.mockResolvedValue(items);

      const result = await getItems();

      expect(get).toHaveBeenCalledWith('cache.items');
      expect(result).toEqual(items);
    });

    it('should return empty array if no cached items', async () => {
      get.mockResolvedValue(undefined);

      const result = await getItems();

      expect(result).toEqual([]);
    });
  });

  describe('cacheLocations / getLocations', () => {
    it('should store locations in IndexedDB', async () => {
      const locations = [{ _id: 'loc1', name: 'Location 1' }];

      await cacheLocations(locations);

      expect(set).toHaveBeenCalledWith('cache.locations', locations);
    });

    it('should retrieve locations from IndexedDB', async () => {
      const locations = [{ _id: 'loc1', name: 'Location 1' }];
      get.mockResolvedValue(locations);

      const result = await getLocations();

      expect(get).toHaveBeenCalledWith('cache.locations');
      expect(result).toEqual(locations);
    });

    it('should return empty array if no cached locations', async () => {
      get.mockResolvedValue(undefined);

      const result = await getLocations();

      expect(result).toEqual([]);
    });
  });

  describe('cacheBoxes / getBoxes', () => {
    it('should store boxes by location ID', async () => {
      const boxes = [{ _id: 'b1', label: 'Box A' }, { _id: 'b2', label: 'Box B' }];

      await cacheBoxes('loc123', boxes);

      expect(set).toHaveBeenCalledWith('cache.boxes.loc123', boxes);
    });

    it('should retrieve boxes for specific location', async () => {
      const boxes = [{ _id: 'b1', label: 'Box A' }];
      get.mockResolvedValue(boxes);

      const result = await getBoxes('loc123');

      expect(get).toHaveBeenCalledWith('cache.boxes.loc123');
      expect(result).toEqual(boxes);
    });

    it('should return empty array if no cached boxes for location', async () => {
      get.mockResolvedValue(undefined);

      const result = await getBoxes('loc456');

      expect(result).toEqual([]);
    });
  });

  describe('cacheVisit / getVisit', () => {
    it('should store visit by ID', async () => {
      const visit = { _id: 'v1', status: 'open', location: 'loc1' };

      await cacheVisit('v1', visit);

      expect(set).toHaveBeenCalledWith('cache.visit.v1', visit);
    });

    it('should retrieve visit by ID', async () => {
      const visit = { _id: 'v1', status: 'open' };
      get.mockResolvedValue(visit);

      const result = await getVisit('v1');

      expect(get).toHaveBeenCalledWith('cache.visit.v1');
      expect(result).toEqual(visit);
    });

    it('should return null if visit not cached', async () => {
      get.mockResolvedValue(undefined);

      const result = await getVisit('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('offlineReady', () => {
    it('should return true when both items and locations are cached', async () => {
      get.mockImplementation((key) => {
        if (key === 'cache.items') return Promise.resolve([{ _id: '1' }]);
        if (key === 'cache.locations') return Promise.resolve([{ _id: 'loc1' }]);
        return Promise.resolve(null);
      });

      const ready = await offlineReady();

      expect(ready).toBe(true);
    });

    it('should return false when items cache is empty', async () => {
      get.mockImplementation((key) => {
        if (key === 'cache.items') return Promise.resolve([]);
        if (key === 'cache.locations') return Promise.resolve([{ _id: 'loc1' }]);
        return Promise.resolve(null);
      });

      const ready = await offlineReady();

      expect(ready).toBe(false);
    });

    it('should return false when locations cache is empty', async () => {
      get.mockImplementation((key) => {
        if (key === 'cache.items') return Promise.resolve([{ _id: '1' }]);
        if (key === 'cache.locations') return Promise.resolve([]);
        return Promise.resolve(null);
      });

      const ready = await offlineReady();

      expect(ready).toBe(false);
    });

    it('should return false when both caches are empty', async () => {
      get.mockImplementation(() => Promise.resolve([]));

      const ready = await offlineReady();

      expect(ready).toBe(false);
    });
  });
});

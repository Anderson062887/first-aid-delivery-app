import { isOnline, enqueue, getCsrfToken } from './offline';

const API = '/api';

// The user's IANA timezone, so the server treats "from/to" dates as the user's
// calendar days (e.g. "America/New_York").
export function userTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
  catch { return ''; }
}

// Get headers with CSRF token for state-changing requests
function getHeaders(method = 'GET') {
  const headers = { 'Content-Type': 'application/json' };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }
  }
  return headers;
}

function cacheGet(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function cacheSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
const CACHE = {
  items: 'cache:items:v1',
  locations: 'cache:locations:v1',
  boxesFor: (locId) => `cache:boxes:${locId}:v1`,
};

// Cache invalidation helpers
function invalidateCache(key) {
  try { localStorage.removeItem(key); } catch {}
}

function invalidateItemsCache() {
  invalidateCache(CACHE.items);
}

function invalidateLocationsCache() {
  invalidateCache(CACHE.locations);
}

function invalidateBoxesCache(locationId) {
  if (locationId) {
    invalidateCache(CACHE.boxesFor(locationId));
  }
}


// Sends the request, or queues it for later when there is no connection.
// Resolves with { _offlineQueued: true } only when the request was actually
// queued. Server errors (4xx/5xx) are NOT queued: they reject with the
// server's error message so the caller can show it.
async function sendWithOffline(method, path, body) {
  if (!isOnline()) {
    enqueue({ path, method, body });
    return { _offlineQueued: true };
  }

  let r;
  try {
    r = await fetch(path, {
      method,
      headers: getHeaders(method),
      credentials: 'include',
      body: JSON.stringify(body)
    });
  } catch {
    // Network failure while the browser still reports "online" (flaky signal)
    enqueue({ path, method, body });
    return { _offlineQueued: true };
  }

  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const j = await r.json(); if (j?.error) msg = j.error; } catch {}
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.json().catch(() => ({}));
}

const postWithOffline = (path, body) => sendWithOffline('POST', path, body);
const patchWithOffline = (path, body) => sendWithOffline('PATCH', path, body);



async function http(path, opts = {}) {
  const method = opts.method || 'GET';
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: getHeaders(method),
    ...opts
  });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---- NEW: Auth endpoints ----
export const authApi = {
  me: () => http('/auth/me', { method: 'GET' }),
  login: (email, password) =>
    http('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => http('/auth/logout', { method: 'POST' }),
  register: (data) =>
    http('/auth/register', { method: 'POST', body: JSON.stringify(data) }) // admin only
};

// ---- Existing API ----
async function fetchDeliveryList(path, filters) {
  const params = new URLSearchParams();

  if (filters.location) params.set('location', filters.location);
  if (filters.from)     params.set('from', filters.from); // YYYY-MM-DD
  if (filters.to)       params.set('to', filters.to);
  if (filters.from || filters.to) params.set('tz', userTimeZone());
  if (filters.repId)    params.set('repId', filters.repId);
  else if (filters.repName) params.set('repName', filters.repName);

  params.set('page',  filters.page  ?? 1);
  params.set('limit', filters.limit ?? 25);

  const res = await fetch(`${path}?${params.toString()}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to fetch deliveries');
  return res.json(); // { data, pageInfo }
}

function newClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export const api = {
  health: () => http('/health'),
  items: {
    // GET /api/items (tries network, falls back to cache)
    list: async () => {
      try {
        const res = await fetch('/api/items', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load items');
        const data = await res.json();
        cacheSet(CACHE.items, data);           // refresh cache
        return data;
      } catch {
        const cached = cacheGet(CACHE.items, []);
        return Array.isArray(cached) ? cached : [];
      }
    },
    create: async (data) => {
      const result = await http('/items', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      invalidateItemsCache();
      return result;
    },
    get: (id) => http(`/items/${id}`),
    update: async (id, data) => {
      const result = await http(`/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
      invalidateItemsCache();
      return result;
    },
    delete: async (id) => {
      const result = await http(`/items/${id}`, { method: 'DELETE' });
      invalidateItemsCache();
      return result;
    },
  },
  create: (data) => http('/items', { method: 'POST', body: JSON.stringify(data) }),  
  locations: {
  list: async (q = '') => {
    // Only the "all locations" call is cached; filtered queries require network.
    const params = new URLSearchParams();
    const hasQuery = !!(q && q.trim());
    if (hasQuery) params.set('q', q.trim());

    try {
      const res = await fetch(`/api/locations?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load locations');
      const data = await res.json();
      // Only cache the unfiltered list (best for dropdowns)
      if (!hasQuery) cacheSet(CACHE.locations, data);
      return data;
    } catch {
      if (!hasQuery) {
        const cached = cacheGet(CACHE.locations, []);
        return Array.isArray(cached) ? cached : [];
      }
      // filtered + offline => no cached filtered results
      return [];
    }
  },
    create: async (data) => {
      const result = await http('/locations', { method: 'POST', body: JSON.stringify(data) });
      invalidateLocationsCache();
      return result;
    },
  },
  boxes: {
    // Throws on any failure so callers fall back to their offline copy instead
    // of treating an error response as "this location has no boxes".
    list: async (locationId, { all = false } = {}) => {
      const params = new URLSearchParams();
      if (locationId) params.set('location', locationId);
      if (all) params.set('all', '1');
      const qs = params.toString();
      const list = await http(`/boxes${qs ? `?${qs}` : ''}`);
      if (!Array.isArray(list)) throw new Error('Failed to load boxes');
      return list;
    },
    one: (id) => http(`/boxes/${id}`),
    create: async (data) => {
      const result = await http('/boxes', { method: 'POST', body: JSON.stringify(data) });
      invalidateBoxesCache(data.location);
      return result;
    },
    update: async (id, data) => {
      const result = await http(`/boxes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      invalidateBoxesCache(result?.location);
      return result;
    },
    remove: async (id, locationId) => {
      await http(`/boxes/${id}`, { method: 'DELETE' });
      invalidateBoxesCache(locationId);
    },
  },
  deliveries: {
  list: (filters = {}) => fetchDeliveryList('/api/deliveries', filters),

  // One row per visit (deliveries without a visit are one row each), paged by row
  listByVisit: (filters = {}) => fetchDeliveryList('/api/deliveries/by-visit', filters),

  // OFFLINE-AWARE create
  // The clientId travels with the request (and with its offline-queue copy),
  // so if it's ever sent twice the server keeps only one delivery.
  create: (payload) => postWithOffline('/api/deliveries', { clientId: newClientId(), ...payload }),

  one: async (id) => {
    const res = await fetch(`/api/deliveries/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load delivery');
    return res.json();
  },

  // OFFLINE-AWARE update
  update: (id, payload) => patchWithOffline(`/api/deliveries/${id}`, payload)
}
};

export const usersApi = {
   list: async () => {
    try {
      const r = await fetch('/api/users', { credentials: 'include' });
      if (!r.ok) return [];                         // <- no access? return empty
      const data = await r.json().catch(() => []);
      return Array.isArray(data) ? data : [];       // <- ensure array
    } catch {
      return [];                                     // <- network/parse issues
    }
  },

  create: (data) => fetch('/api/users', {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders('POST'),
    body: JSON.stringify(data)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error || 'User create failed');
    return r.json();
  }),

  patch: async (id, data) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: getHeaders('PATCH'),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `User update failed (${res.status})`);
    }
    return res.json().catch(() => ({}));
  },

  delete: async (id) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getHeaders('DELETE')
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete user failed');
    }
    return res.json().catch(() => ({ ok: true }));
  },
};

export const locationsApi = {
  list: async (q = '') => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/locations?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load locations');
    return res.json();
  },
  get: async (id) => {
    const res = await fetch(`/api/locations/${id}`, { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load location');
    }
    return res.json();
  },
  update: async (id, data) => {
    const res = await fetch(`/api/locations/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: getHeaders('PUT'),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Update location failed');
    }
    invalidateLocationsCache();
    return res.json();
  },
  create: (data) => fetch('/api/locations', {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders('POST'),
    body: JSON.stringify(data)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error || 'Location create failed');
    return r.json();
  }),
  delete: async (id) => {
    const res = await fetch(`/api/locations/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getHeaders('DELETE')
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete location failed');
    }
    invalidateLocationsCache();
    return { ok: true };
  }
};


//////////////////////

export const visitApi = {
  // Start a visit (only needs location; rep is inferred from logged-in user).
  // Not queued offline: callers need the new visit's _id to open it.
  start: async (locationId) => {
    if (!isOnline()) throw new Error('You are offline. Starting a visit needs a connection.');
    try {
      return await http('/visits', { method: 'POST', body: JSON.stringify({ location: locationId }) });
    } catch (e) {
      if (e instanceof TypeError) throw new Error('No connection. Starting a visit needs a connection.');
      throw e;
    }
  },

  // Latest visits of every location in one request: { [locationId]: [visit] }
  recentByLocation: (per = 2) => http(`/visits/recent-by-location?per=${per}`),

  // Fetch a visit
  get: (id) => fetch(`/api/visits/${id}?t=${Date.now()}`, {
    credentials: 'include',
    headers: { 'Cache-Control': 'no-cache' },
    cache: 'no-store'
  }).then(async r => {
    if (!r.ok) throw new Error('not found');
    return r.json();
  }),

  // Submit outcome + note
  submit: (id, body = {}) =>
    postWithOffline(`/api/visits/${id}/submit`, body),

  // Update note
  setNote: (id, note = '') =>
    patchWithOffline(`/api/visits/${id}/note`, { note }),

  // General update
  update: (id, payload) =>
    patchWithOffline(`/api/visits/${id}`, payload)
};

// ///////////////////////////////////

function reportParams({ from, to, location }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (from || to) params.set('tz', userTimeZone());
  if (location) params.set('location', location);
  return params.toString();
}

async function errorText(res, fallback) {
  try { return (await res.json()).error || fallback; } catch { return fallback; }
}

export const reportsApi = {
  itemsUsage: async ({ from='', to='', location='', limit=10 } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (from || to) params.set('tz', userTimeZone());
    if (location) params.set('location', location);
    params.set('limit', String(limit));
    const r = await fetch(`/api/reports/items-usage?${params.toString()}`, { credentials:'include' });
    if (!r.ok) throw new Error('Failed to load items usage');
    return r.json();
  },
  repProductivity: async ({ from='', to='', location='' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (from || to) params.set('tz', userTimeZone());
    if (location) params.set('location', location);
    const r = await fetch(`/api/reports/rep-productivity?${params.toString()}`, { credentials:'include' });
    if (!r.ok) throw new Error('Failed to load rep productivity');
    return r.json();
  },
  // Every item delivered in range, with cases/single units/total units and totals
  itemsSummary: async ({ from='', to='', location='' } = {}) => {
    const r = await fetch(`/api/reports/items-summary?${reportParams({ from, to, location })}`, { credentials:'include' });
    if (!r.ok) throw new Error(await errorText(r, 'Failed to load the items report'));
    return r.json();
  },
  // One row per visit at a location
  locationHistory: async ({ from='', to='', location } = {}) => {
    const r = await fetch(`/api/reports/location-history?${reportParams({ from, to, location })}`, { credentials:'include' });
    if (!r.ok) throw new Error(await errorText(r, 'Failed to load the location history'));
    return r.json();
  },
  outcomes: async ({ from='', to='', location='' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (from || to) params.set('tz', userTimeZone());
    if (location) params.set('location', location);
    const r = await fetch(`/api/reports/outcomes?${params.toString()}`, { credentials:'include' });
    if (!r.ok) throw new Error('Failed to load outcomes data');
    return r.json();
  }
};



// Convenience exports
export async function listItems() { return api.items.list(); }
export async function createItem(d) { return api.items.create(d); }



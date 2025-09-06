import { isOnline, enqueue } from './offline';

const API = '/api';

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


async function postWithOffline(path, body) {
  if (isOnline()) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      throw new Error(`Request failed (${r.status}): ${txt.slice(0,160)}`);
    }
    return r.json();
  } else {
    enqueue({ path, method:'POST', body });
    return { _offlineQueued: true };
  }
}

async function patchWithOffline(path, body) {
  if (isOnline()) {
    const r = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      throw new Error(`Request failed (${r.status}): ${txt.slice(0,160)}`);
    }
    return r.json().catch(()=> ({}));
  } else {
    enqueue({ path, method:'PATCH', body });
    return { _offlineQueued: true };
  }
}

// async function postWithOffline(path, body) {
//   if (isOnline()) {
//     const r = await fetch(path, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(body),
//       credentials: 'include'
//     });
//     if (!r.ok) {
//       const txt = await r.text().catch(()=> '');
//       throw new Error(`Request failed (${r.status}): ${txt.slice(0,160)}`);
//     }
//     return r.json();
//   } else {
//     enqueue({ path, method:'POST', body });
//     return { _offlineQueued: true };
//   }
// }

// async function patchWithOffline(path, body) {
//   if (isOnline()) {
//     const r = await fetch(path, {
//       method: 'PATCH',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(body),
//       credentials: 'include'
//     });
//     if (!r.ok) {
//       const txt = await r.text().catch(()=> '');
//       throw new Error(`Request failed (${r.status}): ${txt.slice(0,160)}`);
//     }
//     return r.json().catch(()=> ({}));
//   } else {
//     enqueue({ path, method:'PATCH', body });
//     return { _offlineQueued: true };
//   }
// }



async function http(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include', // send/receive cookies
    headers: { 'Content-Type': 'application/json' },
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
        create: (data) =>
      http('/items', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
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
    create: (data) => http('/locations', { method: 'POST', body: JSON.stringify(data) }),
  },
  boxes: {
    list: (locationId) =>
      fetch(`/api/boxes${locationId ? `?location=${locationId}` : ''}`, { credentials: 'include' }).then(r => r.json()),
    one: (id) => fetch(`/api/boxes/${id}`, { credentials: 'include' }).then(r => r.json()),
    create: (data) =>
      fetch('/api/boxes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => r.json()),
  },
  deliveries: {
  list: async (filters = {}) => {
    const params = new URLSearchParams();

    if (filters.location) params.set('location', filters.location);
    if (filters.from)     params.set('from', filters.from); // YYYY-MM-DD
    if (filters.to)       params.set('to', filters.to);
    if (filters.repId)    params.set('repId', filters.repId);
    else if (filters.repName) params.set('repName', filters.repName);

    params.set('page',  filters.page  ?? 1);
    params.set('limit', filters.limit ?? 25);

    const res = await fetch(`/api/deliveries?${params.toString()}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json(); // { data, pageInfo, filters }
  },

  // OFFLINE-AWARE create
  create: (payload) => postWithOffline('/api/deliveries', payload),

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error || 'User create failed');
    return r.json();
  }),

  patch: async (id, data) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`User update failed (${res.status}): ${text.slice(0, 120)}`);
    }
    return res.json().catch(() => ({}));
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
  create: (data) => fetch('/api/locations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error || 'Location create failed');
    return r.json();
  })
};


//////////////////////

export const visitApi = {
  // Start a visit (only needs location; rep is inferred from logged-in user)
  start: (locationId) =>
    postWithOffline('/api/visits', { location: locationId }),

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

export const reportsApi = {
  itemsUsage: async ({ from='', to='', location='', limit=10 } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
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
    if (location) params.set('location', location);
    const r = await fetch(`/api/reports/rep-productivity?${params.toString()}`, { credentials:'include' });
    if (!r.ok) throw new Error('Failed to load rep productivity');
    return r.json();
  },
  outcomes: async ({ from='', to='', location='' } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (location) params.set('location', location);
    const r = await fetch(`/api/reports/outcomes?${params.toString()}`, { credentials:'include' });
    if (!r.ok) throw new Error('Failed to load outcomes data');
    return r.json();
  }
};



// Convenience exports
export async function listItems() { return api.items.list(); }
export async function createItem(d) { return api.items.create(d); }



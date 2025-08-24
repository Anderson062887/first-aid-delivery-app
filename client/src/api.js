const API = '/api';

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
    list: async () => {
      const res = await fetch('/api/items', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load items');
      return res.json();
    },
    create: (data) => http('/items', { method: 'POST', body: JSON.stringify(data) }),
  },
  locations: {
    list: async (q = '') => {
      const params = new URLSearchParams();
      if (q && q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/locations?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load locations');
      return res.json();
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
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.repId) params.set('repId', filters.repId);
      else if (filters.repName) params.set('repName', filters.repName);

      params.set('page', filters.page ?? 1);
      params.set('limit', filters.limit ?? 25);

      const res = await fetch(`/api/deliveries?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch deliveries');
      return res.json();
    },
    create: (payload) => http('/deliveries', { method: 'POST', body: JSON.stringify(payload) }),
    one: async (id) => {
      const res = await fetch(`/api/deliveries/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load delivery');
      return res.json();
    },
    update: async (id, payload) => {
      const r = await fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to update delivery');
      return r.json();
    }
  }
};

export const usersApi = {
  list: () => fetch('/api/users', { credentials: 'include' }).then(r => r.json()),

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

export const visitApi = {
  start: (rep, location) => fetch('/api/visits', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rep, location })
  }).then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'start failed'); return r.json(); }),
  
  get: (id) => fetch(`/api/visits/${id}?t=${Date.now()}`, {
    credentials: 'include',
    headers: { 'Cache-Control': 'no-cache' },
    cache: 'no-store'
  }).then(async r => {
    if (!r.ok) throw new Error('not found');
    return r.json();
  }),
  // get: (id) => fetch(`/api/visits/${id}`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('not found'); return r.json(); }),

  submit: (id, body = {}) => fetch(`/api/visits/${id}/submit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'submit failed'); return r.json(); }),

  setNote: async (id, note = '') => {
    const res = await fetch(`/api/visits/${id}/note`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Note save failed (${res.status}): ${text.slice(0, 120)}`);
    }
    return res.json().catch(() => ({ ok: true }));
  },
  update: async (id, payload) => {
    const r = await fetch(`/api/visits/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error((await r.json()).error || 'Failed to update visit');
    return r.json();
  }
};

// Convenience exports
export async function listItems() { return api.items.list(); }
export async function createItem(d) { return api.items.create(d); }



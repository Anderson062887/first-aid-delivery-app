const API = '/api';

async function http(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => http('/health'),
  items: {
  list: async () => {
    const res = await fetch('/api/items');
    if (!res.ok) throw new Error('Failed to load items');
    return res.json();
  },
    create: (data) => http('/items', { method: 'POST', body: JSON.stringify(data) }),
  },
  locations: {
    list: async (q = '') => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/locations?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load locations');
    return res.json();
  },
    create: (data) => http('/locations', { method: 'POST', body: JSON.stringify(data) }),
  },
  boxes: {
    list: (locationId) => fetch(`/api/boxes${locationId ? `?location=${locationId}` : ''}`).then(r=>r.json()),
    one:  (id) => fetch(`/api/boxes/${id}`).then(r=>r.json()),   // <-- make sure this exists
    create: (data) => fetch('/api/boxes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r=>r.json()),
  },
  deliveries: {
    list: async (filters = {}) => {
    const params = new URLSearchParams();

    if (filters.location) params.set('location', filters.location);
    if (filters.from)     params.set('from', filters.from);       // YYYY-MM-DD
    if (filters.to)       params.set('to', filters.to);           // YYYY-MM-DD
    if (filters.repId)    params.set('repId', filters.repId);
    else if (filters.repName) params.set('repName', filters.repName);

    params.set('page',  filters.page  ?? 1);
    params.set('limit', filters.limit ?? 25);

    const res = await fetch(`/api/deliveries?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch deliveries');
    return res.json(); // { data, pageInfo, filters }
  },
    create: (payload) => http('/deliveries', { method: 'POST', body: JSON.stringify(payload) }),
    one: async (id) => {
      const res = await fetch(`/api/deliveries/${id}`);
      if (!res.ok) throw new Error('Failed to load delivery');
      return res.json();
    }
  }
};

export const usersApi = {
  list: () => fetch('/api/users').then(r => r.json()),

  create: (data) => fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error || 'User create failed');
    return r.json();
  }),

patch: async (id, data) => {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    throw new Error(`User update failed (${res.status}): ${text.slice(0,120)}`);
  }
  return res.json().catch(()=> ({}));
},
};

export const locationsApi = {
   list: async (q = '') => {
    const params = new URLSearchParams();
    if (q && q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/locations?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load locations');
    return res.json();
  },create: (data) => fetch('/api/locations', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  }).then(async r => {
    if(!r.ok) throw new Error((await r.json()).error || 'Location create failed');
    return r.json();
  })
};

export const visitApi = {
  start: (rep, location) => fetch('/api/visits', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ rep, location })
  }).then(async r => { if(!r.ok) throw new Error((await r.json()).error||'start failed'); return r.json(); }),

  get: (id) => fetch(`/api/visits/${id}`).then(async r => { if(!r.ok) throw new Error('not found'); return r.json(); }),

  submit: (id, body = {}) => fetch(`/api/visits/${id}/submit`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body) // <-- sends { outcome, note }
  }).then(async r => { if(!r.ok) throw new Error((await r.json()).error || 'submit failed'); return r.json(); }),

 setNote: async (id, note = '') => {
    const res = await fetch(`/api/visits/${id}/note`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Note save failed (${res.status}): ${text.slice(0, 120)}`);
    }
    return res.json().catch(() => ({ ok: true })); // be lenient
  },
};


// Convenience exports used by your Items pages:
export async function listItems(){ return api.items.list(); }
export async function createItem(d){ return api.items.create(d); }


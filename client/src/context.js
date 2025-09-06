// client/src/offline/context.js
// Minimal context cache so NewDelivery can recover visit/location/rep/box offline.

const VISIT_KEY = (visitId) => `ctx:visit:${visitId}:v1`;
const BOX_HINT_KEY = (boxId) => `ctx:box:${boxId}:v1`;

function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function safeGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function safeDel(key) {
  try { localStorage.removeItem(key); } catch {}
}

/**
 * Save minimal visit context for offline header:
 *  { _id, repName?, rep?{_id,name}, location?{ _id, name, address }, cachedAt }
 */
export function saveVisitContext(visitDoc) {
  if (!visitDoc?._id) return;
  const ctx = {
    _id: visitDoc._id,
    repName: visitDoc.rep?.name || visitDoc.repName || null,
    rep: visitDoc.rep ? { _id: visitDoc.rep._id, name: visitDoc.rep.name } : null,
    location: visitDoc.location ? {
      _id: visitDoc.location._id,
      name: visitDoc.location.name,
      address: visitDoc.location.address || null
    } : null,
    cachedAt: Date.now(),
  };
  safeSet(VISIT_KEY(visitDoc._id), ctx);
}

export function loadVisitContext(visitId) {
  return visitId ? safeGet(VISIT_KEY(visitId)) : null;
}

export function clearVisitContext(visitId) {
  if (visitId) safeDel(VISIT_KEY(visitId));
}

/**
 * Save a tiny hint for a box so NewDelivery can show label/size if API is unavailable.
 * Accepts either a full Box doc or the fields you render next to the Refill button.
 */
export function saveBoxHint(box) {
  if (!box?._id) return;
  const hint = {
    _id: box._id,
    label: box.label || null,
    size: box.size || null,
    location: box.location?._id || box.location || null,
    cachedAt: Date.now(),
  };
  safeSet(BOX_HINT_KEY(box._id), hint);
}

export function loadBoxHint(boxId) {
  return boxId ? safeGet(BOX_HINT_KEY(boxId)) : null;
}

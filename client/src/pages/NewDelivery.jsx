// client/src/pages/NewDelivery.jsx
import { useEffect, useState, useCallback } from 'react'
import { api, visitApi } from '../api'
import ItemPicker from '../components/ItemPicker.jsx'
import Cart from '../components/Cart.jsx'
import { useNavigate, useLocation } from 'react-router-dom'
import { getVisit, getBoxes, getLocations } from '../cache.js'
import { useToast } from '../components/Toast.jsx'
import Breadcrumbs from '../components/Breadcrumbs.jsx'

const DRAFT_KEY = 'delivery_draft';

function useQuery(){ return new URLSearchParams(useLocation().search); }

// Load draft from sessionStorage
function loadDraft() {
  try {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

// Save draft to sessionStorage
function saveDraft(data) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {}
}

// Clear draft from sessionStorage
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function NewDelivery(){
  const q = useQuery();
  const visitId = q.get('visit') || '';
  const rawBox = q.get('box');
  const boxFixed = rawBox && rawBox !== 'undefined' && rawBox !== 'null' ? rawBox : '';
  const toast = useToast();

  // Check for saved draft on mount
  const draft = loadDraft();
  const hasDraft = draft && !visitId && !boxFixed && draft.lines?.length > 0;

  const [repName, setRepName] = useState(hasDraft ? draft.repName || '' : '');
  const [locations, setLocations] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [locationId, setLocationId] = useState(hasDraft ? draft.locationId || '' : '');
  const [boxId, setBoxId] = useState(hasDraft ? draft.boxId || '' : '');
  const [lines, setLines] = useState(hasDraft ? draft.lines || [] : []);
  const [items, setItems] = useState([]);
  const [repLocked, setRepLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [showDraftBanner, setShowDraftBanner] = useState(hasDraft);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const nav = useNavigate();

  // Save draft when form changes (debounced effect)
  const saveCurrentDraft = useCallback(() => {
    if (visitId || boxFixed) return; // Don't save drafts for visit-linked deliveries
    saveDraft({ repName, locationId, boxId, lines });
  }, [repName, locationId, boxId, lines, visitId, boxFixed]);

  useEffect(() => {
    const timer = setTimeout(saveCurrentDraft, 500);
    return () => clearTimeout(timer);
  }, [saveCurrentDraft]);

  // 1) Load locations (network → cache fallback)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.locations.list();
        if (!cancelled) setLocations(Array.isArray(list) ? list : []);
      } catch {
        const cached = await getLocations().catch(()=>[]);
        if (!cancelled) setLocations(Array.isArray(cached) ? cached : []);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Load items (your api.items.list already falls back to cache)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.items.list();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 3) If we have a visitId, prefill REP + LOCATION from visit (network → cache)
  useEffect(() => {
    if (!visitId) return;
    let cancelled = false;
    (async () => {
      try {
        // try network first
        const { visit } = await visitApi.get(visitId);
        if (cancelled) return;
        if (visit?.rep?.name) { setRepName(visit.rep.name); setRepLocked(true); }
        if (visit?.location?._id) setLocationId(visit.location._id);
      } catch {
        // offline: use cached visit
        const v = await getVisit(visitId).catch(()=>null);
        if (cancelled || !v) return;
        if (v?.rep?.name) { setRepName(v.rep.name); setRepLocked(true); }
        if (v?.location?._id) setLocationId(v.location._id);
      }
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  // 4) When LOCATION is set, load BOXES for that location (network → cache)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!locationId) { setBoxes([]); return; }
      setLoadingBoxes(true);
      try {
        const b = await api.boxes.list(locationId);
        if (!cancelled) setBoxes(Array.isArray(b) ? b : []);
      } catch {
        const b = await getBoxes(locationId).catch(()=>[]);
        if (!cancelled) setBoxes(Array.isArray(b) ? b : []);
      } finally {
        if (!cancelled) setLoadingBoxes(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locationId]);

  // 5) If a specific box is in the URL, try to preselect it (network → cache)
  useEffect(() => {
    if (!boxFixed) return;
    let cancelled = false;
    (async () => {
      // If we already have a matching box in state, just select it
      const fromState = boxes.find(b => b._id === boxFixed);
      if (fromState) { setBoxId(boxFixed); return; }

      // Otherwise, try network
      try {
        const b = await api.boxes.one(boxFixed);
        if (cancelled || !b || !b._id) return;
        if (b.location?._id) setLocationId(prev => prev || b.location._id);
        setBoxes(prev => prev.length ? prev : [b]);
        setBoxId(b._id);
        return;
      } catch {
        // Offline: try to find box in cached boxes (requires locationId)
        // If locationId not set yet, try to read visit from cache to get it
        let locId = locationId;
        if (!locId && visitId) {
          const v = await getVisit(visitId).catch(()=>null);
          if (v?.location?._id) locId = v.location._id;
        }
        if (locId) {
          const cachedBoxes = await getBoxes(locId).catch(()=>[]);
          const match = (cachedBoxes || []).find(b => b._id === boxFixed);
          if (match) {
            if (!cancelled) {
              setBoxes(prev => prev.length ? prev : cachedBoxes);
              setLocationId(locId);
              setBoxId(match._id);
            }
            return;
          }
        }
        // Last resort: we at least set the id so the <select> shows a value
        if (!cancelled) setBoxId(boxFixed);
      }
    })();
    return () => { cancelled = true; };
  }, [boxFixed, boxes, locationId, visitId]);

  // 6) Add/remove lines
  function addLine(l){ setLines(prev => [...prev, l]) }
  function removeLine(idx){ setLines(prev => prev.filter((_, i) => i !== idx)) }

  // Clear draft and restore defaults
  function discardDraft() {
    if (!window.confirm('Discard this draft? All unsaved items will be lost.')) {
      return;
    }
    clearDraft();
    setRepName('');
    setLocationId('');
    setBoxId('');
    setLines([]);
    setShowDraftBanner(false);
  }

  // 7) Submit delivery (online -> normal; offline -> queued by SW or manual queue)
  async function submit() {
    setErr('');

    if (!locationId) { setErr('Please select a location'); return; }
    if (!boxId)      { setErr('Please select a box'); return; }
    if (lines.length === 0) { setErr('Add at least one item'); return; }

    const payload = {
      repName,
      location: locationId,
      box: boxId,
      lines: lines.map(l => ({
        item: l.itemId || l.item,
        quantity: Number(l.quantity),
        packaging: l.packaging
      })),
      ...(visitId ? { visit: visitId } : {})
    };

    setSubmitting(true);
    try {
      await api.deliveries.create(payload);
      clearDraft(); // Clear draft on successful submission
      toast.success('Delivery recorded successfully');
      if (visitId) nav(`/visits/${visitId}?done=delivery`);
      else nav(`/?done=delivery`);
    } catch {
      // Treat as queued/temporary failure
      setErr('No connection. Saved locally and will sync when back online.');
      toast.info('Saved offline - will sync when back online');
      clearDraft();
      setTimeout(() => {
        if (visitId) nav(`/visits/${visitId}?queued=1`);
        else nav(`/?queued=1`);
      }, 1500);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Deliveries', to: '/deliveries' },
        { label: 'New Delivery' }
      ]} />
      <h2>New Delivery {visitId && <small>(Visit)</small>}</h2>

      {showDraftBanner && (
        <div className="card" style={{ background: '#e3f2fd', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Restored previous draft ({lines.length} items)</span>
          <button className="btn" onClick={discardDraft} style={{ marginLeft: 8 }}>Discard</button>
        </div>
      )}

      <div className="card row responsive-3">
        <div>
          <label htmlFor="rep-name">Rep</label>
          <input
            id="rep-name"
            className="input"
            value={repName}
            onChange={e=>setRepName(e.target.value)}
            placeholder="Your name"
            readOnly={repLocked}
            aria-label="Representative name"
          />
        </div>
        <div>
          <label htmlFor="location-select">Location</label>
          <select
            id="location-select"
            className="input"
            value={locationId}
            onChange={e=>{ setLocationId(e.target.value); setBoxId(''); setErr(''); }}
            disabled={!!boxFixed && !!locationId}
            aria-label="Select location"
          >
            <option value="">Select location…</option>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="box-select">Box {loadingBoxes && <span style={{ opacity: 0.7 }}>(Loading…)</span>}</label>
          <select
            id="box-select"
            className="input"
            value={boxId}
            onChange={e=>{ setBoxId(e.target.value); setErr(''); }}
            disabled={(!!boxFixed && !!boxId) || !locationId || loadingBoxes}
            aria-label="Select box"
            aria-busy={loadingBoxes}
          >
            <option value="">{loadingBoxes ? 'Loading boxes…' : 'Select box…'}</option>
            {boxes.map(b => <option key={b._id} value={b._id}>{b.label} (Size: {b.size})</option>)}
          </select>
        </div>
      </div>

      <ItemPicker onAdd={(l) => { addLine(l); setErr(''); }} />
      <Cart lines={lines} items={items} onRemove={removeLine} />

      {err && <div style={{ color: 'red', marginBottom: 12 }}>{err}</div>}

      <button className="btn primary" onClick={submit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit box'}
      </button>
    </div>
  )
}

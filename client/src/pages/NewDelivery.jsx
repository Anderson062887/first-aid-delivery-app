import { useEffect, useState } from 'react'
import { api } from '../api'
import { visitApi } from '../api' // <-- make sure visitApi is exported in api.js
import ItemPicker from '../components/ItemPicker.jsx'
import Cart from '../components/Cart.jsx'
import { useNavigate, useLocation } from 'react-router-dom'

function useQuery(){ return new URLSearchParams(useLocation().search); }

export default function NewDelivery(){
  const q = useQuery();
  const visitId = q.get('visit') || '';
  const rawBox = q.get('box');
  const boxFixed = rawBox && rawBox !== 'undefined' && rawBox !== 'null' ? rawBox : '';

  const [repName, setRepName] = useState('');
  const [locations, setLocations] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [boxId, setBoxId] = useState('');
  const [lines, setLines] = useState([]);
  const [repLocked, setRepLocked] = useState(false); // lock rep when coming from a Visit
  const nav = useNavigate();

  // Load all locations
  useEffect(() => { api.locations.list().then(setLocations) }, []);

  // Load boxes when a location is selected (unless we preload a fixed box)
  useEffect(() => { locationId ? api.boxes.list(locationId).then(setBoxes) : setBoxes([]) }, [locationId]);

  // If a specific box id is provided, preload it (and lock the selects only if preload succeeds)
  useEffect(() => {
    if (!boxFixed) return;
    (async () => {
      try {
        const b = await api.boxes.one(boxFixed);
        if (!b || !b._id || !b.location?._id) return;
        setLocationId(b.location._id);
        setBoxId(b._id);
        setBoxes([b]);
      } catch (err) {
        console.error('Failed to load box', err);
      }
    })();
  }, [boxFixed]);

  // If we have a visitId, load the visit and prefill rep name from the visit's rep
  useEffect(() => {
    if (!visitId) return;
    (async () => {
      try {
        const { visit } = await visitApi.get(visitId);
        if (visit?.rep?.name) {
          setRepName(visit.rep.name);
          setRepLocked(true); // lock the field so it matches the visit's rep
        }
        // If visit also implies a fixed box via query, the other effect will handle it.
      } catch (e) {
        console.warn('Could not load visit to prefill rep name', e);
        // keep rep editable if visit load fails
        setRepLocked(false);
      }
    })();
  }, [visitId]);

  function addLine(l){ setLines(prev => [...prev, l]) }
  function removeLine(idx){ setLines(prev => prev.filter((_, i) => i !== idx)) }

  async function submit(){
    if (!locationId) { alert('Pick a location'); return; }
    if (!boxId)      { alert('Pick a box'); return; }
    if (lines.length === 0) { alert('Add at least one item'); return; }

    const payload = {
      repName,
      location: locationId,
      box: boxId,
      lines: lines.map(l => ({ item: l.itemId, quantity: l.quantity, packaging: l.packaging })),
      ...(visitId ? { visit: visitId } : {})
    };
    await api.deliveries.create(payload);

    // After submit: back to the visit with a success banner, or to dashboard if standalone
    if (visitId) {
      nav(`/visits/${visitId}?done=delivery`);
    } else {
      nav(`/?done=delivery`);
    }
  }

  return (
    <div>
      <h2>New Delivery {visitId && <small>(Visit)</small>}</h2>

      <div className="card row">
        <div>
          <label>Rep</label>
          <input
            className="input"
            value={repName}
            onChange={e=>setRepName(e.target.value)}
            placeholder="Your name"
            readOnly={repLocked}
          />
        </div>
        <div>
          <label>Location</label>
          <select
            className="input"
            value={locationId}
            onChange={e=>{ setLocationId(e.target.value); setBoxId(''); }}
            disabled={!!boxFixed && !!locationId}
          >
            <option value="">Select…</option>
            {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label>Box</label>
          <select
            className="input"
            value={boxId}
            onChange={e=>setBoxId(e.target.value)}
            disabled={(!!boxFixed && !!boxId) || !locationId}
          >
            <option value="">Select…</option>
            {boxes.map(b => <option key={b._id} value={b._id}>{b.label} (Size: {b.size})</option>)}
          </select>
        </div>
      </div>

      <ItemPicker onAdd={addLine} />
      <Cart lines={lines} onRemove={removeLine} />

      <div className="flex" style={{justifyContent:'flex-end'}}>
        <button className="btn primary" onClick={submit}>Submit Delivery</button>
      </div>
    </div>
  )
}




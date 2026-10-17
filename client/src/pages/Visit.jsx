// client/src/pages/Visit.jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, visitApi } from '../api';
import Badge from '../components/Badge.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { useConfirm } from '../components/ConfirmContext.jsx';
import { useToast } from '../components/ToastContext.jsx';
import { cacheVisit, cacheBoxes, cacheItems, getBoxes } from '../cache.js';
import { queuedBoxIdsForVisit, onSyncResult } from '../offline';

const outcomeKind = (o) =>
  o === 'completed' ? 'completed' :
  o === 'partial'   ? 'partial'   :
  o === 'no_access' ? 'no_access' :
  o === 'skipped'   ? 'skipped'   : 'default';

const OUTCOMES = ['completed', 'partial', 'no_access', 'skipped'];

// Normalize any box object into a stable id
function getBoxId(b) {
  return b?._id || b?.boxId || b?.id || null;
}

export default function Visit(){
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const [visit, setVisit] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [deliveredIds, setDeliveredIds] = useState(new Set());
  // Boxes refilled on this device but not synced yet: they count as refilled,
  // so the rep doesn't refill them twice and can still complete the visit offline
  const [queuedIds, setQueuedIds] = useState(() => queuedBoxIdsForVisit(id));
  const [syncCount, setSyncCount] = useState(0);

  // After each sync, queued deliveries become server deliveries: reload both
  useEffect(() => onSyncResult(() => setSyncCount(n => n + 1)), []);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [loadErr, setLoadErr] = useState(''); // visit could not be loaded: nothing to show
  const [err, setErr] = useState('');         // submit/validation problem: shown inline
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const readonly = !!visit?.submittedAt;

  // Load visit + prefetch (items/boxes) for offline
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setLoadErr('');

        const data = await visitApi.get(id);
        const v = data?.visit || data;
        if (!v?._id) throw new Error('Visit not found');

        if (cancelled) return;
        setVisit(v);
        setOutcome(v.outcome || '');
        setNote(v.note || '');

        cacheVisit(v._id, v).catch(()=>{});

        // Boxes for the location
        if (v.location?._id) {
          try {
            const list = await api.boxes.list(v.location._id);
            if (!cancelled) setBoxes(Array.isArray(list) ? list : []);
            cacheBoxes(v.location._id, Array.isArray(list) ? list : []).catch(()=>{});
          } catch {
            const cached = await getBoxes(v.location._id);
            if (!cancelled) setBoxes(Array.isArray(cached) ? cached : []);
          }
        } else {
          setBoxes([]);
        }

        // Items for picker (offline)
        api.items.list()
          .then(list => cacheItems(Array.isArray(list) ? list : []))
          .catch(()=>{});
      } catch (e) {
        if (!cancelled) setLoadErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Load deliveries and only count those from THIS visit
  useEffect(() => {
    let cancelled = false;
    setQueuedIds(queuedBoxIdsForVisit(id));
    (async () => {
      try {
        const r = await fetch(`/api/deliveries?visit=${encodeURIComponent(id)}&limit=200&page=1`, {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) throw new Error('Failed to load visit deliveries');
        const j = await r.json();
        const list = Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []);

        const onlyThisVisit = list.filter(d => String(d?.visit?._id || d?.visit) === String(id));

        const ids = new Set(
          onlyThisVisit
            .map(d => d?.box?._id || d?.box)
            .filter(Boolean)
            .map(String)
        );
        if (!cancelled) setDeliveredIds(ids);
      } catch {
        // Offline: keep what we last knew; queued deliveries still count
      }
    })();
    return () => { cancelled = true; };
  }, [id, syncCount]);

  const isCovered = (bid) => deliveredIds.has(bid) || queuedIds.has(bid);
  // All boxes covered only if each location box was refilled (saved or queued)
  const allCovered = boxes.length > 0 && boxes.every(b => isCovered(String(getBoxId(b))));

  const anyCovered = boxes.some(b => isCovered(String(getBoxId(b))));

  // Suggest the outcome from the boxes: all refilled -> completed, some -> partial.
  // Once the rep picks one themselves, leave it alone.
  const pickedByRep = useRef(false);
  const suggested = allCovered ? 'completed' : anyCovered ? 'partial' : '';
  useEffect(() => {
    if (readonly || pickedByRep.current || !suggested) return;
    if (visit?.outcome) return; // a saved outcome wins
    setOutcome(suggested);
  }, [suggested, readonly, visit?.outcome]);

  // Started by mistake: nothing refilled (or waiting to sync) yet, so it can just go away
  const canCancel = !readonly && visit?.status === 'open' && !anyCovered;
  async function cancelVisit() {
    if (!await confirm({
      title: 'Cancel this visit?',
      message: "Nothing has been refilled yet, so the visit will be removed as if it never started.",
      confirmLabel: 'Cancel visit', cancelLabel: 'Keep visit', danger: true
    })) return;
    try {
      await visitApi.cancel(id);
      toast.success('Visit cancelled');
      navigate('/locations');
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  function handleSubmitClick() {
    setErr('');
    if (outcome === 'completed' && !allCovered) {
      setErr('To submit as completed, you must refill all boxes.')
      return;
    }
    setShowConfirm(true);
  }

  async function submitVisit(){
    setShowConfirm(false);
    try{
      setSaving(true);
      const payload = { outcome: outcome || undefined, note };
      const result = await visitApi.submit(id, payload);

      setVisit(v => v ? { ...v, outcome: payload.outcome || v.outcome, note, submittedAt: new Date().toISOString() } : v);

      navigate(result?._offlineQueued ? '/?queued=1' : '/?done=visit');
    }catch(e){
      console.error('Submit visit failed:', e);
      // Show the server's reason (e.g. which boxes are missing); stays until the next attempt
      setErr(`Visit was not submitted: ${e?.message || 'please try again.'}`);
    }finally{
      setSaving(false);
    }
  }

  if (loadErr) return <div className="card error">{loadErr}</div>;
  if (loading || !visit) return <div className="card">Loading…</div>;

  const repName   = visit.rep?.name || visit.repName || '—';
  const locName   = visit.location?.name || '—';
  const started   = visit.startedAt ? new Date(visit.startedAt).toLocaleString() : '—';
  const submitted = visit.submittedAt ? new Date(visit.submittedAt).toLocaleString() : null;

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Locations', to: '/locations' },
        { label: `Visit — ${locName}` }
      ]} />

      <div className="card stack-sm">
        <h2 className="m0">Visit</h2>
        <div><strong>Location:</strong> {locName}</div>
        <div><strong>Rep:</strong> {repName}</div>
        <div><strong>Started:</strong> {started}</div>
        {submitted && <div><strong>Submitted:</strong> {submitted}</div>}
        <div>
          <strong>Outcome:</strong>{' '}
          {visit.outcome
            ? <Badge kind={outcomeKind(visit.outcome)}>{visit.outcome.replace('_',' ')}</Badge>
            : '—'}
        </div>
        {visit.note && <div><strong>Note:</strong> {visit.note}</div>}
        {canCancel && (
          <div className="between mt">
            <span className="hint">Started by mistake? Nothing has been refilled yet.</span>
            <button className="btn danger" onClick={cancelVisit}>Cancel visit</button>
          </div>
        )}
      </div>

      <div className="card stack">
        <h3 className="m0">Boxes at this location</h3>

        {boxes.length === 0 && (
          <div className="dim">No boxes found for this location.</div>
        )}

        {boxes.length > 0 && (
          <div className="stack-sm">
            {boxes.map(b => {
              const bid = String(getBoxId(b));
              const covered = isCovered(bid);
              const waiting = !deliveredIds.has(bid) && queuedIds.has(bid);
              return (
                <div key={bid} className="list-row">
                  <div style={{ flex:'1 1 180px', minWidth:0 }}>
                    <div className="strong">{b.label}</div>
                    {b.size && <div className="dim">Size: {b.size}</div>}
                    <div style={{ marginTop: 6 }}>
                      {waiting
                        ? <span className="chip waiting">Refilled (waiting to sync)</span>
                        : covered
                          ? <span className="chip ok">Refilled</span>
                          : <span className="chip todo">Not filled</span>}
                    </div>
                  </div>

                  {!covered && !readonly && (
                    <Link
                      className="btn primary"
                      to={`/deliveries/new?visit=${encodeURIComponent(visit._id)}&box=${encodeURIComponent(bid)}`}
                      state={{ visit, box: b }}
                    >
                      Refill this box
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {err && (
        <div className="error-box" style={{ marginBottom: 10 }}>
          {err}
        </div>
      )}

      <div className="card stack">
        <h3 className="m0">Submit Visit</h3>

        <label>Outcome</label>
        <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
          {OUTCOMES.map(k => {
            const disabled = readonly || (k === 'completed' && !allCovered);
            return (
              <label key={k} style={{ display:'flex', gap:6, alignItems:'center', opacity: disabled ? .6 : 1 }}>
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === k}
                  disabled={disabled}
                  onChange={() => { pickedByRep.current = true; setOutcome(k); }}
                />
                <Badge kind={outcomeKind(k)}>{k.replace('_',' ')}</Badge>
              </label>
            );
          })}
        </div>
        {!readonly && outcome === 'completed' && !allCovered && (
          <div className="error">
            You must refill all boxes before submitting as <strong>completed</strong>.
          </div>
        )}

        <label className="mt">Note</label>
        <textarea
          className="input"
          rows={4}
          value={note}
          onChange={e=>setNote(e.target.value)}
          placeholder="Optional note about this visit…"
          readOnly={readonly}
        />
        <div style={{ justifyContent:'flex-end' }}>
          <button
            className="btn primary"
            onClick={handleSubmitClick}
            disabled={readonly || saving || (outcome === 'completed' && !allCovered)}
            title={
              readonly
                ? 'This visit has already been submitted'
                : (outcome === 'completed' && !allCovered ? 'Refill all boxes to submit as completed' : '')
            }
            aria-label="Submit visit"
          >
            {saving ? 'Submitting…' : (readonly ? 'Visit Submitted' : 'Submit Visit')}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="card modal-dialog">
            <h3 id="confirm-title" style={{ margin: '0 0 12px' }}>Confirm Submission</h3>
            <p>Are you sure you want to submit this visit as <strong>{outcome || 'unspecified'}</strong>?</p>
            <p style={{ opacity: 0.8, fontSize: 14 }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn primary" onClick={submitVisit} disabled={saving}>
                {saving ? 'Submitting…' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { locationsApi, visitApi, reportsApi } from '../api';
import { useAuth } from '../auth/AuthContext.jsx';
import Badge from '../components/Badge.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { BoxesPanel } from './Boxes.jsx';
import { lastVisitText } from '../visitDue.js';

const fmtAddress = (a) => [a?.street, a?.city, a?.state, a?.zip].filter(Boolean).join(', ');
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const qtyText = (cases, each) => [
  cases ? `${cases} case${cases === 1 ? '' : 's'}` : '',
  each ? `${each} each` : ''
].filter(Boolean).join(' + ');

// Everything about one location: start/continue a visit, its boxes, recent visits.
export default function LocationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');

  const [loc, setLoc] = useState(null);
  const [open, setOpen] = useState(null);       // my visit in progress here, if any
  const [history, setHistory] = useState(null); // recent visits, newest first
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    locationsApi.get(id)
      .then(l => { if (!cancelled) setLoc(l); })
      .catch(e => { if (!cancelled) setErr(String(e?.message || e)); });
    visitApi.myOpen()
      .then(list => { if (!cancelled) setOpen((list || []).find(v => String(v.location?._id) === String(id)) || null); })
      .catch(() => {});
    reportsApi.locationHistory({ location: id })
      .then(h => { if (!cancelled) setHistory(h.rows || []); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [id]);

  async function startVisit() {
    try {
      const v = await visitApi.start(id);
      nav(`/visits/${v._id}`);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  if (err && !loc) return <div className="card error">{err}</div>;
  if (!loc) return <Skeleton.List items={3} />;

  const lastSubmitted = (history || []).find(r => r.status === 'submitted');
  const recent = (history || []).slice(0, 5);

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Locations', to: '/locations' }, { label: loc.name }]} />

      <div className="card stack-sm">
        <div className="between">
          <h2 className="m0">{loc.name}</h2>
          {isAdmin && <Link className="btn" to={`/locations/${id}/edit`}>Edit location</Link>}
        </div>
        {fmtAddress(loc.address) && <div className="dim">{fmtAddress(loc.address)}</div>}
        <div className="hint">{lastVisitText(lastSubmitted ? new Date(lastSubmitted.date) : null)}</div>
        {err && <div className="error">{err}</div>}
        <div className="mt">
          <button className="btn primary" onClick={startVisit}>
            {open ? `Continue visit (${open.boxesDone} of ${open.boxesTotal} boxes)` : 'Start visit'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="mt0">Boxes</h3>
        <BoxesPanel locationId={id} />
      </div>

      <div className="card stack-sm">
        <div className="between">
          <h3 className="m0">{isAdmin ? 'Recent visits' : 'Your recent visits'}</h3>
          <Link to={`/reports?tab=history&location=${id}`}>Full history</Link>
        </div>
        {history === null && <Skeleton.Table rows={3} cols={3} />}
        {history?.length === 0 && <div className="dim">No visits yet.</div>}
        {recent.map((r, i) => (
          <div key={r.visitId || `d${i}`} className="list-row">
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div className="inline" style={{ flexWrap: 'wrap' }}>
                <span className="strong">{new Date(r.date).toLocaleDateString()}</span>
                {r.outcome
                  ? <Badge kind={r.outcome}>{r.outcome.replace('_', ' ')}</Badge>
                  : <span className="chip todo">{r.status === 'open' ? 'in progress' : r.status}</span>}
              </div>
              <div className="hint">
                {r.repName || 'Unknown rep'} · {r.boxes.length ? `${r.boxes.length} box${r.boxes.length === 1 ? '' : 'es'} refilled` : 'no boxes refilled'}
              </div>
              {r.items.length > 0 && (
                <div className="history-items">
                  {r.items.map(it => <span key={it.name}>{it.name}: {qtyText(it.cases, it.each)}</span>)}
                </div>
              )}
              {r.note && <div className="hint"><em>Note:</em> {r.note}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="strong">{money(r.total)}</div>
              {r.visitId && (
                r.status === 'open'
                  ? <Link to={`/visits/${r.visitId}`}>Open</Link>
                  : <Link to={`/deliveries/visit/${r.visitId}`}>Details</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

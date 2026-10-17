// client/src/pages/Reports.jsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, usersApi, userTimeZone, reportsApi } from '../api';
import { useAuth } from '../auth/AuthContext.jsx';
import Badge from '../components/Badge.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { DATE_PRESETS } from '../reportDates.js';

const TABS = [
  { key: 'items', label: 'Items delivered' },
  { key: 'history', label: 'Location history' },
  { key: 'boxes', label: 'Boxes' },
  { key: 'downloads', label: 'Other downloads' },
];

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const outcomeLabel = (o) => (o || '').replace('_', ' ');
const qtyText = (cases, each) => [
  cases ? `${cases} case${cases === 1 ? '' : 's'}` : '',
  each ? `${each} each` : ''
].filter(Boolean).join(' + ') || '0';

function csvUrl(base, params) {
  const u = new URLSearchParams();
  u.set('tz', userTimeZone()); // dates and times in the CSV use the user's timezone
  Object.entries(params).forEach(([k, v]) => { if (v) u.set(k, v); });
  return `${base}?${u.toString()}`;
}

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes('admin');
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'items';

  const [[from, to], setRange] = useState(() => DATE_PRESETS[0].range(new Date()));
  // Tab and location live in the address, so a report can be bookmarked or shared
  const location = params.get('location') || '';
  const setQuery = (next) => {
    const merged = { tab, location, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)), { replace: true });
  };
  const setLocation = (id) => setQuery({ location: id });
  const [locations, setLocations] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.locations.list('').then(l => setLocations(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const activePreset = DATE_PRESETS.find(p => {
    const [f, t] = p.range(new Date());
    return f === from && t === to;
  })?.key;

  async function download(url, namePrefix) {
    setErr('');
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
      setErr(msg);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${namePrefix}_${from || 'start'}_to_${to || 'today'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <h2>Reports</h2>

      <div className="tabs mb" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setErr(''); setQuery({ tab: t.key }); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card stack">
        <div className="actions" aria-label="Date range">
          {DATE_PRESETS.map(p => (
            <button
              key={p.key}
              className={`btn chip-btn ${activePreset === p.key ? 'active' : ''}`}
              aria-pressed={activePreset === p.key}
              onClick={() => setRange(p.range(new Date()))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="row responsive-3">
          <div>
            <label htmlFor="r-from">From</label>
            <input id="r-from" className="input" type="date" value={from} onChange={e => setRange([e.target.value, to])} />
          </div>
          <div>
            <label htmlFor="r-to">To</label>
            <input id="r-to" className="input" type="date" value={to} onChange={e => setRange([from, e.target.value])} />
          </div>
          <div>
            <label htmlFor="r-loc">Location</label>
            <select id="r-loc" className="input" value={location} onChange={e => setLocation(e.target.value)}>
              <option value="">{tab === 'history' ? 'Pick a location…' : 'All locations'}</option>
              {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {err && <div className="error-box mb">{err}</div>}

      {tab === 'items' && (
        <ItemsReport
          from={from} to={to} location={location} canDownload={isAdmin}
          onDownload={() => download(csvUrl('/api/exports/items-summary.csv', { from, to, location }), 'items_delivered')}
        />
      )}
      {tab === 'history' && (
        <LocationHistory
          from={from} to={to} location={location} canDownload={isAdmin}
          onDownload={() => download(csvUrl('/api/exports/location-history.csv', { from, to, location }), 'location_history')}
        />
      )}
      {tab === 'boxes' && (
        <BoxesReport
          from={from} to={to} location={location} canDownload={isAdmin}
          onDownload={() => download(csvUrl('/api/exports/boxes.csv', { from, to, location }), 'boxes')}
        />
      )}
      {tab === 'downloads' && (
        <OtherDownloads isAdmin={isAdmin} from={from} to={to} location={location} download={download} />
      )}
    </div>
  );
}

function useReport(load, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: '' }));
    load()
      .then(data => { if (!cancelled) setState({ loading: false, data, error: '' }); })
      .catch(e => { if (!cancelled) setState({ loading: false, data: null, error: String(e?.message || e) }); });
    return () => { cancelled = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function ItemsReport({ from, to, location, canDownload, onDownload }) {
  const { loading, data, error } = useReport(() => reportsApi.itemsSummary({ from, to, location }), [from, to, location]);
  const rows = data?.rows || [];
  const totals = data?.totals;

  return (
    <div className="card">
      <div className="between mb">
        <div>
          <h3 className="m0">Items delivered</h3>
          {totals && (
            <div className="hint">
              {rows.length} item{rows.length === 1 ? '' : 's'} · {totals.units} units · {money(totals.amount)} across {data.deliveries} box refill{data.deliveries === 1 ? '' : 's'}
            </div>
          )}
        </div>
        {canDownload && <button className="btn" onClick={onDownload} disabled={!rows.length}>Download CSV</button>}
      </div>

      {loading && <Skeleton.Table rows={5} cols={6} />}
      {!loading && error && <div className="error">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="dim">Nothing was delivered in these dates.</div>}
      {!loading && !error && rows.length > 0 && (
        <div className="scroll-x">
          <table className="table report-table">
            <thead>
              <tr>
                <th>Item</th><th>SKU</th>
                <th className="num">Cases</th><th className="num">Each</th>
                <th className="num">Total units</th><th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.itemId}>
                  <td data-label="Item" className="strong">{r.name}</td>
                  <td data-label="SKU">{r.sku || '—'}</td>
                  <td data-label="Cases" className="num"><span>{r.cases}{r.cases > 0 && <span className="hint"> × {r.unitsPerPack}</span>}</span></td>
                  <td data-label="Each" className="num">{r.each}</td>
                  <td data-label="Total units" className="num strong">{r.units}</td>
                  <td data-label="Amount" className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td data-label="" className="strong">Total</td>
                <td />
                <td data-label="Cases" className="num">{totals.cases}</td>
                <td data-label="Each" className="num">{totals.each}</td>
                <td data-label="Total units" className="num strong">{totals.units}</td>
                <td data-label="Amount" className="num strong">{money(totals.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function LocationHistory({ from, to, location, canDownload, onDownload }) {
  if (!location) {
    return <div className="card dim">Pick a location above to see every visit there, newest first.</div>;
  }
  return <LocationHistoryFor from={from} to={to} location={location} canDownload={canDownload} onDownload={onDownload} />;
}

function LocationHistoryFor({ from, to, location, canDownload, onDownload }) {
  const { loading, data, error } = useReport(() => reportsApi.locationHistory({ from, to, location }), [from, to, location]);
  const rows = data?.rows || [];
  const total = rows.reduce((s, r) => s + r.total, 0);
  const visits = rows.filter(r => r.visitId).length;

  return (
    <div className="card">
      <div className="between mb">
        <div>
          <h3 className="m0">{data?.location?.name || 'Location history'}</h3>
          {data && (
            <div className="hint">
              {visits} visit{visits === 1 ? '' : 's'} · {money(total)} delivered
            </div>
          )}
        </div>
        {canDownload && <button className="btn" onClick={onDownload} disabled={!rows.length}>Download CSV</button>}
      </div>

      {loading && <Skeleton.Table rows={4} cols={5} />}
      {!loading && error && <div className="error">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="dim">No visits here in these dates.</div>}
      {!loading && !error && rows.length > 0 && (
        <div className="stack-sm">
          {rows.map((r, i) => (
            <div key={r.visitId || `d${i}`} className="list-row history-row">
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="inline" style={{ flexWrap: 'wrap' }}>
                  <span className="strong">{new Date(r.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {r.outcome
                    ? <Badge kind={r.outcome}>{outcomeLabel(r.outcome)}</Badge>
                    : <span className="chip todo">{r.status === 'open' ? 'in progress' : r.status}</span>}
                </div>
                <div className="hint">{r.repName || 'Unknown rep'}{r.boxes.length ? ` · ${r.boxes.length} box${r.boxes.length === 1 ? '' : 'es'} refilled (${r.boxes.join(', ')})` : ' · no boxes refilled'}</div>
                {r.items.length > 0 && (
                  <div className="history-items">
                    {r.items.map(it => <span key={it.name}>{it.name}: {qtyText(it.cases, it.each)}</span>)}
                  </div>
                )}
                {r.note && <div className="hint"><em>Note:</em> {r.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="strong">{money(r.total)}</div>
                {r.visitId && <Link to={`/deliveries/visit/${r.visitId}`}>Details</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BoxesReport({ from, to, location, canDownload, onDownload }) {
  const { loading, data, error } = useReport(() => reportsApi.boxes({ from, to, location }), [from, to, location]);
  const rows = data?.rows || [];
  const t = data?.totals;
  const groups = (data?.locations || []).map(l => ({ ...l, boxes: rows.filter(r => r.locationId === l.locationId) }));

  return (
    <div className="card">
      <div className="between mb">
        <div>
          <h3 className="m0">Boxes</h3>
          {t && (
            <div className="hint">
              {t.active} active box{t.active === 1 ? '' : 'es'} at {t.locations} location{t.locations === 1 ? '' : 's'}
              {t.retired ? ` · ${t.retired} retired` : ''} · {t.refills} refill{t.refills === 1 ? '' : 's'} ({money(t.amount)}) in these dates
            </div>
          )}
        </div>
        {canDownload && <button className="btn" onClick={onDownload} disabled={!rows.length}>Download CSV</button>}
      </div>

      {loading && <Skeleton.Table rows={5} cols={5} />}
      {!loading && error && <div className="error">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="dim">No boxes yet.</div>}
      {!loading && !error && groups.map(g => (
        <div key={g.locationId} className="box-group">
          <div className="between">
            <Link className="strong" to={`/locations/${g.locationId}`}>{g.location}</Link>
            <span className="hint">{g.active} box{g.active === 1 ? '' : 'es'}{g.retired ? ` + ${g.retired} retired` : ''}</span>
          </div>
          <table className="table report-table">
            <thead>
              <tr><th>Box</th><th>Size</th><th>Status</th><th>Last refilled</th><th className="num">Refills</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {g.boxes.map(b => (
                <tr key={b.boxId} style={b.active ? undefined : { opacity: 0.6 }}>
                  <td data-label="Box" className="strong">{b.label}</td>
                  <td data-label="Size">{b.size}</td>
                  <td data-label="Status">{b.active ? 'Active' : 'Retired'}</td>
                  <td data-label="Last refilled">{b.lastRefilled ? new Date(b.lastRefilled).toLocaleDateString() : 'Never'}</td>
                  <td data-label="Refills" className="num">{b.refills}</td>
                  <td data-label="Amount" className="num">{money(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function OtherDownloads({ isAdmin, from, to, location, download }) {
  const [repId, setRepId] = useState('');
  const [reps, setReps] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.list().then(arr => setReps(Array.isArray(arr) ? arr.filter(u => (u.roles || []).includes('rep')) : [])).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return <div className="card dim">Downloads are available to admins.</div>;

  const p = { from, to, location, repId };
  return (
    <div className="card stack">
      <div style={{ maxWidth: 360 }}>
        <label htmlFor="r-rep">Rep</label>
        <select id="r-rep" className="input" value={repId} onChange={e => setRepId(e.target.value)}>
          <option value="">All reps</option>
          {reps.map(u => <option key={u._id} value={u._id}>{u.name}{u.active === false ? ' (inactive)' : ''}</option>)}
        </select>
      </div>
      <div className="stack-sm">
        <DownloadRow
          title="Every line item"
          text="One row per item on each box refill. Line-by-line detail for audits."
          onClick={() => download(csvUrl('/api/exports/deliveries.csv', { ...p, mode: 'lines' }), 'line_items')}
        />
        <DownloadRow
          title="Every box refill"
          text="One row per box refilled, with its total."
          onClick={() => download(csvUrl('/api/exports/deliveries.csv', { ...p, mode: 'deliveries' }), 'box_refills')}
        />
        <DownloadRow
          title="Rep productivity"
          text="Per rep: visits, boxes, line items, total, and visit outcomes."
          onClick={() => download(csvUrl('/api/exports/reps.csv', p), 'rep_productivity')}
        />
      </div>
      <p className="hint m0">Uses the dates and location above. Open the CSV in Excel or Google Sheets.</p>
    </div>
  );
}

function DownloadRow({ title, text, onClick }) {
  return (
    <div className="list-row">
      <div style={{ flex: '1 1 240px' }}>
        <div className="strong">{title}</div>
        <div className="hint">{text}</div>
      </div>
      <button className="btn" onClick={onClick}>Download CSV</button>
    </div>
  );
}

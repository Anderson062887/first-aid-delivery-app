import { useEffect, useMemo, useState } from 'react'
import { api, reportsApi } from '../api'
import { useLocation } from 'react-router-dom'
import Flash from '../components/Flash.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';


import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts'

function useQuery(){ return new URLSearchParams(useLocation().search); }

const OUTCOME_COLORS = {
  completed: '#2e7d32',
  partial: '#f9a825',
  no_access: '#6d4c41',
  skipped: '#ef6c00',
  other: '#607d8b'
};

function toISODate(d) {
  const z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

export default function Dashboard(){
  const [ok, setOk] = useState(false);
  const q = useQuery();
  const done = q.get('done'); // 'delivery' | 'visit'

  // --- NEW state for reports ---
  const today = new Date();
  const start = new Date(); start.setDate(today.getDate() - 30);
  const [from, setFrom] = useState(toISODate(start));
  const [to, setTo]     = useState(toISODate(today));
  const [location, setLocation] = useState('');
  const [locations, setLocations] = useState([]);

  const [itemsData, setItemsData] = useState([]);
  const [repData, setRepData] = useState([]);
  const [outcomesData, setOutcomesData] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => { 
    api.health().then(() => setOk(true)).catch(() => setOk(false)) 
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.locations.list('').then(locs => {
      if (!cancelled) setLocations(Array.isArray(locs) ? locs : []);
    }).catch(()=>{});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load(){
      try {
        setLoading(true); setErr('');
        const [items, reps, outs] = await Promise.all([
          reportsApi.itemsUsage({ from, to, location, limit: 10 }),
          reportsApi.repProductivity({ from, to, location }),
          reportsApi.outcomes({ from, to, location })
        ]);
        if (cancelled) return;

        setItemsData((items.rows || []).map(r => ({ name: r.name, quantity: r.quantity, amount: Number(r.amount).toFixed(2) })));
        setRepData((reps.rows || []).map(r => ({ rep: r.repName, total: Number(r.total), visits: r.visitCount, deliveries: r.deliveries })));

        const counts = outs.counts || {};
        const oData = [
          { name:'Completed', key:'completed', value:counts.completed||0, fill:OUTCOME_COLORS.completed },
          { name:'Partial',   key:'partial',   value:counts.partial||0,   fill:OUTCOME_COLORS.partial },
          { name:'No access', key:'no_access', value:counts.no_access||0, fill:OUTCOME_COLORS.no_access },
          { name:'Skipped',   key:'skipped',   value:counts.skipped||0,   fill:OUTCOME_COLORS.skipped },
          { name:'Other',     key:'other',     value:counts.other||0,     fill:OUTCOME_COLORS.other },
        ].filter(d => d.value > 0);
        setOutcomesData(oData);

      } catch (e) {
        setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [from, to, location]);

  const totalAmount = useMemo(() => repData.reduce((s,r)=>s+(Number(r.total)||0),0), [repData]);

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <OfflineBanner />
      {done === 'delivery' && <Flash>Delivery recorded ✅</Flash>}
      {done === 'visit' && <Flash>Visit submitted ✅</Flash>}

      <div className="card">
        <p>API status: {ok ? '✅ Connected' : '❌ Offline'}</p>
        <p>Use the navigation to manage items, locations, boxes, visits, and deliveries.</p>
      </div>

      {/* --- NEW filters card --- */}
      <div className="card" style={{ display:'grid', gap:12 }}>
        <div className="row responsive-3">
          <div>
            <label>From</label>
            <input className="input" type="date" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label>To</label>
            <input className="input" type="date" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <div>
            <label>Location</label>
            <select className="input" value={location} onChange={e=>setLocation(e.target.value)}>
              <option value="">All</option>
              {locations.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <button className="btn" onClick={()=>{ setFrom(''); setTo(''); setLocation(''); }}>Clear</button>
          <div style={{ marginLeft:'auto' }}>
            <strong>Total: ${totalAmount.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {err && <div style={{ color:'red', margin:'12px 0' }}>{err}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && (
        <>
          <div className="card">
            <h3>Top Items</h3>
            <div style={{ width:'100%', height:300 }}>
              <ResponsiveContainer>
                <BarChart data={itemsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#2196f3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3>Rep Performance</h3>
            <div style={{ width:'100%', height:300 }}>
              <ResponsiveContainer>
                <BarChart data={repData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rep" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#4caf50" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3>Visit Outcomes</h3>
            <div style={{ width:'100%', height:300 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={outcomesData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                    {outcomesData.map((entry,i)=><Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}



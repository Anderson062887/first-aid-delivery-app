import { useState, useMemo } from 'react';
import { locationsApi } from '../api';
import { useNavigate } from 'react-router-dom';

const SIZES = ['S','M','L','XL'];

export default function LocationNew(){
  const nav = useNavigate();
  const [form, setForm] = useState({
    name:'',
    address:{ street:'', city:'', state:'', zip:'' },
    boxCount: 1,
    boxLabelPrefix: 'Box'
  });
  const [boxSizes, setBoxSizes] = useState(['M']);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Keep boxSizes array in sync with boxCount
  function setCount(n){
    const count = Math.max(1, Math.min(20, Number(n)||1));
    setForm(f=>({...f, boxCount: count}));
    setBoxSizes(prev => {
      const clone = prev.slice(0, count);
      while(clone.length < count) clone.push('M');
      return clone;
    });
  }

  function updateField(e){
    const { name, value } = e.target;
    if(name.startsWith('address.')){
      const key = name.split('.')[1];
      setForm(f=>({ ...f, address:{ ...f.address, [key]: value } }));
    } else {
      setForm(f=>({ ...f, [name]: value }));
    }
  }

  function updateSize(i, val){
    setBoxSizes(s => s.map((x,idx)=> idx===i ? val : x));
  }

  const sizeSelectors = useMemo(()=>(
    Array.from({length: form.boxCount}).map((_,i)=>(
      <div key={i} className="row" style={{alignItems:'end'}}>
        <div><label>Box {i+1} size</label>
          <select className="input" value={boxSizes[i]} onChange={e=>updateSize(i, e.target.value)}>
            {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    ))
  ),[form.boxCount, boxSizes]);

  async function submit(e){
    e.preventDefault();
    setSaving(true); setErr('');
    try{
      await locationsApi.create({
        name: form.name,
        address: form.address,
        boxCount: form.boxCount,
        boxSizes,
        boxLabelPrefix: form.boxLabelPrefix
      });
      nav('/locations');
    } catch(e){ setErr(String(e.message||e)); }
    finally{ setSaving(false); }
  }

  return (
    <div>
      <h2>New Location</h2>
      {err && <div style={{color:'red', marginBottom:12}}>{err}</div>}
      <form className='card' onSubmit={submit} style={{display:'grid', gap:12, maxWidth:600, margin:"0 auto"}}>
        <label>Name<input className="input" name="name" required value={form.name} onChange={updateField}/></label>
        <div className="row">
          <div><label>Street<input className="input" name="address.street" value={form.address.street} onChange={updateField}/></label></div>
          <div><label>City<input className="input" name="address.city" value={form.address.city} onChange={updateField}/></label></div>
        </div>
        <div className="row">
          <div><label>State<input className="input" name="address.state" value={form.address.state} onChange={updateField}/></label></div>
          <div><label>Zip<input className="input" name="address.zip" value={form.address.zip} onChange={updateField}/></label></div>
        </div>

        <div className="row">
          <div>
            <label>Number of boxes (1–20)</label>
            <input className="input" type="number" min="1" max="20" value={form.boxCount} onChange={e=>setCount(e.target.value)} />
          </div>
          <div>
            <label>Box label prefix</label>
            <input className="input" name="boxLabelPrefix" value={form.boxLabelPrefix} onChange={updateField}/>
          </div>
        </div>

        <div className="card">
          <strong>Box sizes</strong>
          <div style={{display:'grid', gap:10, marginTop:10}}>
            {sizeSelectors}
          </div>
        </div>

        <button className="btn primary" disabled={saving}>{saving?'Saving…':'Create Location'}</button>
      </form>
    </div>
  );
}

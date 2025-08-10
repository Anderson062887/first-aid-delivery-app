import { useState } from 'react';
import { usersApi } from '../api';
import { useNavigate } from 'react-router-dom';

export default function UserNew(){
  const nav = useNavigate();
  const [form, setForm] = useState({ name:'', email:'', role:'rep', active:true });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function update(e){
    const { name, value, type, checked } = e.target;
    setForm(f=>({...f, [name]: type==='checkbox'? checked : value}));
  }

  async function submit(e){
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await usersApi.create(form);
      nav('/users');
    } catch(e){ setErr(String(e.message||e)); }
    finally{ setSaving(false); }
  }

  return (
    <div>
      <h2>New User</h2>
      {err && <div style={{color:'red', marginBottom:12}}>{err}</div>}
      <form onSubmit={submit} style={{display:'grid', gap:12, maxWidth:420}}>
        <label>Name<input name="name" required value={form.name} onChange={update}/></label>
        <label>Email<input name="email" value={form.email} onChange={update}/></label>
        <label>Role
          <select name="role" value={form.role} onChange={update}>
            <option value="rep">rep</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:8}}>
          <input type="checkbox" name="active" checked={form.active} onChange={update}/> Active
        </label>
        <button className="btn primary" disabled={saving}>{saving?'Saving…':'Create User'}</button>
      </form>
    </div>
  );
}

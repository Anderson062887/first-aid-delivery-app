import { useState } from 'react';
import { usersApi } from '../api';
import { useNavigate } from 'react-router-dom';

export default function UserNew(){
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
  const [rep, setRep] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');

  async function submit(){
    try{
      const roles = [];
      if (rep) roles.push('rep');
      if (admin) roles.push('admin');
      await usersApi.create({ name, email,password,roles, active: true });
      nav('/users');
    }catch(e){ setErr(String(e.message||e)); }
  }

  return (
    <div className="card" style={{ display:'grid', gap:12,width:"50%", margin:"0 auto"}}>
      <h2>New User</h2>
      {err && <div style={{color:'red'}}>{err}</div>}
      <div>
        <label>Name</label>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} />
      </div>
      <div>
        <label>Email</label>
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} />
      </div>

      <div>
       <label>Password</label>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <h2>Role</h2>
      <div  style={{ gap:16 }}>
        <label><input type="checkbox" checked={rep} onChange={e=>setRep(e.target.checked)} /> Rep</label>
        <label><input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)} /> Admin</label>
      </div>
      <button style={{width:"80%", margin:"20px auto"}}className="btn primary" onClick={submit}>Create</button>
    </div>
  );
}



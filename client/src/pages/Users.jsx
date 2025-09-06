import { useEffect, useState } from 'react';
import { usersApi } from '../api';
import Flash from '../components/Flash.jsx';
import { Link } from 'react-router-dom';


export default function Users(){
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load(){
    try { setRows(await usersApi.list()); setErr(''); }
    catch(e){ setErr(String(e.message||e)); }
  }
  useEffect(()=>{ load(); },[]);

async function toggleRole(u, role){
  const has = (u.roles||[]).includes(role);
  const next = has ? u.roles.filter(r=>r!==role) : [...(u.roles||[]), role];

  if (next.length === 0) {
    setErr('A user must have at least one role (rep or admin).');
    return; // do not call API
  }

  try{
    await usersApi.patch(u._id, { roles: next });
    setErr('');
    setMsg(`Updated ${u.name}`);
    load();
  }catch(e){ setErr(String(e.message||e)); }
}

  async function toggleActive(u){
    try{
      await usersApi.patch(u._id, { active: !u.active });
      load();
    }catch(e){ setErr(String(e.message||e)); }
  }

  return (
    <div>
      <h2>Users</h2>
      {msg && <Flash>{msg}</Flash>}
      {err && <div style={{color:'red'}}>{err}</div>}
      <div style={{margin:"20px 0"}}>
        <Link to="/users/new" className='btn'>+ New User</Link>
      </div>

      <div className="card" style={{ overflowX:'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Active</th><th>Rep</th><th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email || '—'}</td>
                <td>
                  <input type="checkbox" checked={!!u.active} onChange={()=>toggleActive(u)} />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={(u.roles||[]).includes('rep')}
                    onChange={()=>toggleRole(u,'rep')}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={(u.roles||[]).includes('admin')}
                    onChange={()=>toggleRole(u,'admin')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}



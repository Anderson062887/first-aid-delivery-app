import { useEffect, useState } from 'react';
import { usersApi } from '../api';
import Flash from '../components/Flash.jsx';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastContext.jsx';


export default function Users(){
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();

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

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.name}"? This action cannot be undone.`)) {
      return;
    }
    setDeleting(user._id);
    try {
      await usersApi.delete(user._id);
      setRows(prev => prev.filter(u => u._id !== user._id));
      toast.success(`User "${user.name}" deleted`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
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
              <th>Name</th><th>Email</th><th>Active</th><th>Rep</th><th>Admin</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u._id}>
                <td data-label="Name">{u.name}</td>
                <td data-label="Email">{u.email || '—'}</td>
                <td data-label="Active">
                  <input type="checkbox" checked={!!u.active} onChange={()=>toggleActive(u)} />
                </td>
                <td data-label="Rep">
                  <input
                    type="checkbox"
                    checked={(u.roles||[]).includes('rep')}
                    onChange={()=>toggleRole(u,'rep')}
                  />
                </td>
                <td data-label="Admin">
                  <input
                    type="checkbox"
                    checked={(u.roles||[]).includes('admin')}
                    onChange={()=>toggleRole(u,'admin')}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#c62828', color: '#fff', borderColor: '#c62828' }}
                    onClick={() => handleDelete(u)}
                    disabled={deleting === u._id}
                  >
                    {deleting === u._id ? '...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

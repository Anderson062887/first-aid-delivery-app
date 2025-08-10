import { useEffect, useState } from 'react';
import { usersApi } from '../api';
import { Link } from 'react-router-dom';

export default function Users(){
  const [users, setUsers] = useState([]);
  useEffect(()=>{ usersApi.list().then(setUsers); },[]);
  return (
    <div>
      <h2>Users</h2>
      <div style={{marginBottom:12}}><Link to="/users/new">+ New User</Link></div>
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
        <tbody>
          {users.map(u=>(
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.email || '—'}</td>
              <td>{u.role}</td>
              <td>{u.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length===0 && <div className="card">No users yet.</div>}
    </div>
  );
}

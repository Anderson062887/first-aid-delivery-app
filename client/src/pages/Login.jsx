import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    try {
      await login(email, password);
      const to = loc.state?.from || '/';
      nav(to, { replace:true });
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <div className="card" style={{ maxWidth:420, margin:'40px auto' }}>
      <h2 style={{ marginTop:0 }}>Sign in</h2>
      {err && <div style={{ color:'red', marginBottom:8 }}>{err}</div>}
      <form onSubmit={onSubmit} style={{ display:'grid', gap:10 }}>
        <div>
          <label>Email</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div>
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        <button className="btn primary" type="submit">Sign in</button>
      </form>
    </div>
  );
}

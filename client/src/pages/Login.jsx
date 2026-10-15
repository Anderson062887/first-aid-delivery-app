import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { login, sessionEnded } = useAuth();
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
      // Only same-app paths (never "//host" or a full URL)
      const from = loc.state?.from;
      const to = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login'
        ? from : '/';
      nav(to, { replace:true });
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <div className="card" style={{ maxWidth:420, margin:'40px auto' }}>
      <h2 className="mt0">Sign in</h2>
      {sessionEnded && (
        <div className="notice warn" style={{ marginBottom: 8 }}>
          Your session has ended (it expired, or your account was disabled). Please sign in again.
        </div>
      )}
      {err && <div className="error" style={{ marginBottom:8 }}>{err}</div>}
      <form className="stack" onSubmit={onSubmit}>
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

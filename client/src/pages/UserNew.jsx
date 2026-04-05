import { useState, useMemo } from 'react';
import { usersApi } from '../api';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

// Password validation rules
function validatePassword(password) {
  const rules = [
    { test: p => p.length >= 8, label: 'At least 8 characters' },
    { test: p => /[a-z]/.test(p), label: 'One lowercase letter' },
    { test: p => /[A-Z]/.test(p), label: 'One uppercase letter' },
    { test: p => /[0-9]/.test(p), label: 'One number' },
  ];
  return rules.map(r => ({ ...r, passed: r.test(password || '') }));
}

export default function UserNew(){
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rep, setRep] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const passwordRules = useMemo(() => validatePassword(password), [password]);
  const passwordValid = passwordRules.every(r => r.passed);

  async function submit(){
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!email.trim()) { setErr('Email is required'); return; }
    if (!passwordValid) { setErr('Please fix password requirements'); return; }

    try{
      setSubmitting(true);
      setErr('');
      const roles = [];
      if (rep) roles.push('rep');
      if (admin) roles.push('admin');
      if (roles.length === 0) { setErr('Select at least one role'); setSubmitting(false); return; }
      await usersApi.create({ name, email, password, roles, active: true });
      toast.success('User created successfully');
      nav('/users');
    }catch(e){
      setErr(String(e.message||e));
      toast.error('Failed to create user');
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Users', to: '/users' },
        { label: 'New User' }
      ]} />
      <div className="card" style={{ display:'grid', gap:12, maxWidth: 500, margin:"0 auto"}}>
        <h2 style={{ marginTop: 0 }}>New User</h2>
        {err && <div style={{color:'red'}}>{err}</div>}
        <div>
          <label>Name</label>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>

        <div>
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {password && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {passwordRules.map((rule, i) => (
                <div key={i} style={{
                  color: rule.passed ? '#28a745' : '#dc3545',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 2
                }}>
                  <span>{rule.passed ? '✓' : '✗'}</span>
                  <span>{rule.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <h3 style={{ marginBottom: 0 }}>Roles</h3>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={rep} onChange={e=>setRep(e.target.checked)} /> Rep
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)} /> Admin
          </label>
        </div>

        <button
          className="btn primary"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </div>
  );
}

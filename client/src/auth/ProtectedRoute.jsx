import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="card">Checking auth…</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (roles && roles.length) {
    const ok = (user.roles || []).some(r => roles.includes(r));
    if (!ok) return <div className="card" style={{ color:'red' }}>Forbidden</div>;
  }
  return <Outlet />;
}

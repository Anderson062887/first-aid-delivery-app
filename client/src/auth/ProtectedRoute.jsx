import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="card">Checking auth…</div>;
  // Remember where they were going so Login can send them back there
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles && roles.length) {
    const ok = (user.roles || []).some(r => roles.includes(r));
    if (!ok) return <div className="card" style={{ color:'red' }}>Forbidden</div>;
  }
  return <Outlet />;
}

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authApi } from '../api';
import { clearUserData } from '../offline';

const AuthCtx = createContext(null);

// A 401 from the API (outside /api/auth, where it means a wrong password)
// means the session is gone: expired, or the account was disabled/deleted.
function isSessionLoss(input, res) {
  if (res?.status !== 401) return false;
  try {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    const path = new URL(url, window.location.origin).pathname;
    return path.startsWith('/api/') && !path.startsWith('/api/auth/');
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set when we were logged out by the server, so Login can say why
  const [sessionEnded, setSessionEnded] = useState(false);
  const userRef = useRef(user);
  userRef.current = user;

  // Watch every API response, including pages that call fetch() directly.
  // ProtectedRoute then sends the user to /login and back here afterwards.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (isSessionLoss(args[0], res)) {
        if (userRef.current) setSessionEnded(true);
        setUser(null);
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  async function refresh() {
    try {
      const me = await authApi.me();
      setUser(me || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function login(email, password) {
    const u = await authApi.login(email, password);
    setSessionEnded(false);
    setUser(u);
  }
  // Throws if the server can't be reached: the session cookie is httpOnly, so
  // only the server can end it. Local data is cleared only once it has.
  async function logout() {
    await authApi.logout();
    await clearUserData();
    setSessionEnded(false);
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, sessionEnded }}>
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthCtx);
}

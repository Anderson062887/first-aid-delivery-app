import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';
import { clearUserData } from '../offline';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
    setUser(u);
  }
  // Throws if the server can't be reached: the session cookie is httpOnly, so
  // only the server can end it. Local data is cleared only once it has.
  async function logout() {
    await authApi.logout();
    await clearUserData();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthCtx);
}

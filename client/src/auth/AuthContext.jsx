import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';

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
  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

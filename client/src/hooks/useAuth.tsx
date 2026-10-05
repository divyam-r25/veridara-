import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { getMe, getAuthStatus, demoLogin, logout as apiLogout } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  demoModeAvailable: boolean;
  isAuthenticated: boolean;
  loginAsDemo: () => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoModeAvailable, setDemoModeAvailable] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getAuthStatus();
      setDemoModeAvailable(status.data.demoModeAvailable);

      if (status.data.authenticated) {
        const me = await getMe();
        setUser(me.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
      setError('The ReleaseRadar API is not responding. Please wake or redeploy the Render service, then try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const loginAsDemo = async () => {
    setLoading(true);
    try {
      const result = await demoLogin();
      setUser(result.data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      demoModeAvailable,
      isAuthenticated: !!user,
      loginAsDemo,
      logout,
      refetch: fetchUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

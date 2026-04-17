import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../constants/theme';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  tier: string;
  usage: {
    allowed: boolean;
    remaining: number;
    limit: number;
    tier: string;
    message?: string;
    rollover?: number;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionToken: string | null;
  login: (sessionId: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, sessionToken: null,
  login: async () => false, logout: async () => {}, refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const fetchUser = useCallback(async (token: string): Promise<User | null> => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!sessionToken) return;
    const u = await fetchUser(sessionToken);
    if (u) setUser(u);
  }, [sessionToken, fetchUser]);

  // Check existing session on mount
  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const u = await fetchUser(token);
        if (u) {
          setUser(u);
          setSessionToken(token);
        } else {
          await AsyncStorage.removeItem('session_token');
        }
      }
      setLoading(false);
    })();
  }, [fetchUser]);

  const login = async (sessionId: string): Promise<boolean> => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      const token = data.session_token;
      await AsyncStorage.setItem('session_token', token);
      setSessionToken(token);
      // Fetch full user with usage
      const u = await fetchUser(token);
      if (u) setUser(u);
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    if (sessionToken) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch {}
    }
    await AsyncStorage.removeItem('session_token');
    setUser(null);
    setSessionToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, sessionToken, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

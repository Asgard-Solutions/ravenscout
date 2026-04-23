import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { BACKEND_URL } from '../constants/theme';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT
// URLS, THIS BREAKS THE AUTH.
//
// The Google Web Client ID comes from EXPO_PUBLIC_GOOGLE_CLIENT_ID.
// Read once here so the rest of the hook can call configure()
// lazily the first time loginWithGoogle() is invoked.
const GOOGLE_WEB_CLIENT_ID =
  (Constants.expoConfig?.extra as any)?.googleWebClientId ||
  (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID as string | undefined) ||
  '';

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
  loginWithGoogle: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, sessionToken: null,
  login: async () => false,
  loginWithGoogle: async () => ({ ok: false, reason: 'not_ready' }),
  logout: async () => {}, refreshUser: async () => {},
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

  // ------------------------------------------------------------------
  // Google Sign-In (native flow, portable — used with Railway backend)
  // ------------------------------------------------------------------
  // Uses @react-native-google-signin/google-signin. iOS needs the
  // reversed-client-ID URL scheme in app.json (see iosUrlScheme in the
  // plugin config). Android uses Google Play Services — the user's
  // Google accounts appear in a native picker.
  //
  // Flow:
  //   1. GoogleSignin.configure({ webClientId }) — idempotent.
  //   2. GoogleSignin.signIn() → returns { idToken, user, ... }
  //   3. POST idToken → /api/auth/google → backend verifies signature
  //      against Google's JWKS, upserts user by email, mints our
  //      session token.
  //   4. Store session token in AsyncStorage, hydrate user.
  //
  // Not supported on Platform.OS === 'web' — the native library has no
  // web implementation. The app's web blocker already prevents end
  // users from reaching a login screen on web anyway.
  const loginWithGoogle = async (): Promise<
    { ok: true } | { ok: false; reason: string }
  > => {
    if (Platform.OS === 'web') {
      return { ok: false, reason: 'web_not_supported' };
    }
    if (!GOOGLE_WEB_CLIENT_ID) {
      return { ok: false, reason: 'missing_google_client_id_env' };
    }
    try {
      // Dynamic import so web bundle never pulls in native-only code.
      const GoogleSignin = (
        await import('@react-native-google-signin/google-signin')
      ).GoogleSignin;

      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        // We only need an ID token (no access token, no offline).
        offlineAccess: false,
      });

      // Make sure Play Services is present on Android. No-op on iOS.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const result = await GoogleSignin.signIn();
      // v13+ shape: { type: 'success', data: { idToken, user, ... } }
      // Older shape: { idToken, user, ... } directly. Support both.
      const idToken: string | null =
        (result as any)?.data?.idToken ?? (result as any)?.idToken ?? null;
      if (!idToken) {
        return { ok: false, reason: 'no_id_token_returned' };
      }

      const resp = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (!resp.ok) {
        return { ok: false, reason: `backend_${resp.status}` };
      }
      const data = await resp.json();
      const token = data.session_token;
      if (!token) return { ok: false, reason: 'no_session_token' };
      await AsyncStorage.setItem('session_token', token);
      setSessionToken(token);
      const u = await fetchUser(token);
      if (u) setUser(u);
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || err?.message || String(err);
      // User-cancelled flow isn't an error in the UX sense — return
      // ok:false with a known reason so the login screen can stay
      // idle rather than showing a scary alert.
      if (code === 'SIGN_IN_CANCELLED' || code === '-5') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: code || 'unknown' };
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
    <AuthContext.Provider value={{ user, loading, sessionToken, login, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

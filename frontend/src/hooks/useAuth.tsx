import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  email: string | null;
  name: string | null;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, email: string, name: string, refreshToken?: string) => void;
  logout: () => void;
  getValidToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.VITE_API_URL || '';

// Track refresh-in-progress to prevent concurrent refreshes
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<{ token: string; email: string; name: string; refreshToken?: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) return data;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = localStorage.getItem('auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, isAuthenticated: !!parsed.token };
      } catch {
        return { token: null, refreshToken: null, email: null, name: null, isAuthenticated: false };
      }
    }
    return { token: null, refreshToken: null, email: null, name: null, isAuthenticated: false };
  });

  // Keep a ref so getValidToken always sees latest state
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const login = useCallback((token: string, email: string, name: string, refreshToken?: string) => {
    const newState: AuthState = {
      token,
      refreshToken: refreshToken || null,
      email,
      name,
      isAuthenticated: true,
    };
    setState(newState);
    localStorage.setItem('auth', JSON.stringify(newState));
  }, []);

  const logout = useCallback(async () => {
    const rt = stateRef.current.refreshToken;
    setState({ token: null, refreshToken: null, email: null, name: null, isAuthenticated: false });
    localStorage.removeItem('auth');
    // Revoke refresh token server-side (fire-and-forget)
    if (rt) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
  }, []);

  // Returns a valid access token, auto-refreshing if expired
  const getValidToken = useCallback(async (): Promise<string | null> => {
    const current = stateRef.current;
    if (!current.token || !current.refreshToken) return current.token;

    // Check if token is about to expire (within 2 minutes)
    try {
      const payload = JSON.parse(atob(current.token.split('.')[1]));
      const expiresAt = payload.exp * 1000;
      if (expiresAt - Date.now() > 2 * 60 * 1000) {
        return current.token; // Still valid
      }
    } catch {
      // Can't decode — try refresh anyway
    }

    // Token expired or about to expire — refresh it
    // Deduplicate concurrent refresh requests
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const result = await refreshAccessToken(current.refreshToken!);
        refreshPromise = null;
        if (result) {
          const newState: AuthState = {
            token: result.token,
            refreshToken: result.refreshToken || current.refreshToken,
            email: result.email,
            name: result.name,
            isAuthenticated: true,
          };
          setState(newState);
          stateRef.current = newState;
          localStorage.setItem('auth', JSON.stringify(newState));
          return result.token;
        }
        // Refresh failed — force logout
        setState({ token: null, refreshToken: null, email: null, name: null, isAuthenticated: false });
        localStorage.removeItem('auth');
        return null;
      })();
    }
    return refreshPromise;
  }, []);

  // Auto-refresh timer: check every 50 seconds if token needs refreshing
  useEffect(() => {
    if (!state.token || !state.refreshToken) return;

    const interval = setInterval(async () => {
      const current = stateRef.current;
      if (!current.token || !current.refreshToken) return;

      try {
        const payload = JSON.parse(atob(current.token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        if (expiresAt - Date.now() < 5 * 60 * 1000) {
          await getValidToken();
        }
      } catch { /* Token malformed — will be caught on next API call */ }
    }, 50 * 1000);

    return () => clearInterval(interval);
  }, [state.token, state.refreshToken, getValidToken]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, getValidToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

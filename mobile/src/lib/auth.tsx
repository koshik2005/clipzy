import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, configureAuth, setTokens, type Session, type User } from './api';

const KEY = 'clipzy.session';

type AuthState = {
  ready: boolean;
  user: User | null;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthState | null>(null);

async function persist(tokens: { token: string; refreshToken: string } | null) {
  try {
    if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      configureAuth(null, (t) => {
        void persist(t);
        if (!t) setUser(null); // refresh failed -> signed out
      });
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          configureAuth(stored, (t) => {
            void persist(t);
            if (!t) setUser(null);
          });
          setUser(await api.me());
        }
      } catch {
        // Offline or token rejected. A rejected refresh already cleared the session via the callback above.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (s: Session) => {
    const t = { token: s.token, refreshToken: s.refreshToken };
    setTokens(t);
    await persist(t);
    setUser(s.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      const refreshToken = raw ? JSON.parse(raw).refreshToken : null;
      if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    } finally {
      setTokens(null);
      await persist(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut, setUser }), [ready, user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

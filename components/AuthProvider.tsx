'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { insforge } from '@/lib/insforge';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  avatarUrl?: string | null;
  profile?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Pull an avatar URL from the varied keys different auth providers use. */
function pickAvatarUrl(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string | null {
  const keys = ['avatar_url', 'avatarUrl', 'picture', 'image', 'photoURL'];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** getCurrentUser may return the user directly or wrapped in `{ user }`. */
function normalizeUser(data: unknown): AuthUser | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const candidate =
    'user' in record && record.user ? (record.user as Record<string, unknown>) : record;
  if (!candidate || typeof candidate.id !== 'string') return null;

  const profile = (candidate.profile as Record<string, unknown> | null) ?? null;
  const metadata = (candidate.metadata as Record<string, unknown> | null) ?? null;
  const name =
    (profile?.name as string | undefined) ??
    (candidate.name as string | undefined) ??
    null;

  return {
    id: candidate.id,
    email: (candidate.email as string) ?? '',
    emailVerified: candidate.emailVerified as boolean | undefined,
    name,
    avatarUrl: pickAvatarUrl(profile, metadata, candidate),
    profile,
    metadata,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await insforge.auth.getCurrentUser();
    setUser(normalizeUser(data));
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    await insforge.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await insforge.auth.getCurrentUser();
      if (!active) return;
      setUser(normalizeUser(data));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

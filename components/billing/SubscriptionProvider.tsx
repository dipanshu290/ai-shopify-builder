'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchEntitlement, type EntitlementDTO } from '@/lib/billing/client';

/**
 * Client-side subscription context. Loads the authoritative entitlement from the
 * server whenever a user is signed in and exposes it to the sidebar usage UI,
 * upgrade dialogs, billing page, and export gating. `refresh()` is called after
 * returning from Stripe so permissions update as soon as the webhook has run.
 */
interface SubscriptionContextValue {
  entitlement: EntitlementDTO | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementDTO | null>(null);
  const [loading, setLoading] = useState(true);

  // Manual refresh (called from event handlers / after returning from Stripe).
  const refresh = useCallback(async () => {
    if (!user) {
      setEntitlement(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchEntitlement();
      setEntitlement(data);
    } catch {
      // Non-fatal — treat as no entitlement (Free-plan defaults in the UI).
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial / user-change load. Inlined (not calling `refresh`) so every state
  // update happens after an `await`, matching AuthProvider and avoiding
  // synchronous setState inside the effect body.
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    (async () => {
      if (!user) {
        await Promise.resolve();
        if (active) {
          setEntitlement(null);
          setLoading(false);
        }
        return;
      }
      try {
        const data = await fetchEntitlement();
        if (active) setEntitlement(data);
      } catch {
        if (active) setEntitlement(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  return (
    <SubscriptionContext.Provider value={{ entitlement, loading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return ctx;
}

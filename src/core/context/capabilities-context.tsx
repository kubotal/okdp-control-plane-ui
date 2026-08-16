/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { capabilitiesApi, type Capabilities } from '../api/capabilities-api';
import { logger } from '../services/logger';

export interface CapabilitiesContextValue {
  capabilities: Capabilities | null;
  /** True while the platform has not answered yet. */
  loading: boolean;
  /** Whether the kubauth user and group management screens are worth showing. */
  userManagement: boolean;
}

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

/** Reads /api/capabilities once, after sign-in. A platform on its own OIDC
 *  provider serves no user and group API, so the Identity area is hidden rather
 *  than left in the menu leading to a screen that can only say "unavailable".
 *
 *  Read once on purpose: the provider comes from the platform Context, which
 *  changes at the pace of a redeploy, not of a session. */
export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    capabilitiesApi
      .get()
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch((err) => {
        // An older server has no such endpoint. Staying null keeps every area
        // visible, which is the behaviour before capabilities existed.
        logger.error('Failed to load platform capabilities', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      capabilities,
      loading,
      userManagement: capabilities ? capabilities.identity.userManagement : true,
    }),
    [capabilities, loading],
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesContextValue {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) {
    throw new Error('useCapabilities must be used within a CapabilitiesProvider');
  }
  return ctx;
}

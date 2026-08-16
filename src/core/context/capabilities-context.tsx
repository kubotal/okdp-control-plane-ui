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

/** Reads /api/capabilities once, after sign-in, so the areas the platform does
 *  not serve stay out of the navigation. Once is enough: the provider changes at
 *  the pace of a redeploy, not of a session. */
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
        // A server without the endpoint leaves this null, and every area visible.
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

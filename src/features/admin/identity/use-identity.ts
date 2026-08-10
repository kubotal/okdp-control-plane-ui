import { useCallback, useEffect, useRef, useState } from 'react';
import { identityApi, type Group, type User } from '../../../core/api/identity-api';
import { unavailableFeature } from '../../../core/api/http';
import { logger } from '../../../core/services/logger';

const POLL_INTERVAL_MS = 15000;

function usePolledList<T>(fetcher: () => Promise<T[]>, label: string) {
  const [items, setItems] = useState<T[]>([]);
  // Stays true across refresh()/poll cycles so background refreshes don't
  // re-mask an already-painted table with the loading spinner.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  /** Set when the cluster does not carry the CRDs this screen needs. Not an
   *  error: the feature was never installed, and the screen says so. */
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Read inside the interval callback, which closes over its first render.
  const stopped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    stopped.current = false;

    const load = () =>
      fetcher()
        .then((data) => {
          if (!cancelled) {
            setItems(data);
            setError(false);
            setUnavailable(null);
          }
        })
        .catch((err) => {
          const feature = unavailableFeature(err);
          if (feature) {
            // Polling a feature the cluster does not have would repeat the
            // same answer every 15s and fill the console with noise, so this
            // stops until the user asks again.
            stopped.current = true;
            if (!cancelled) {
              setItems([]);
              setError(false);
              setUnavailable(feature);
            }
            return;
          }
          logger.error(`Failed to load ${label}`, err);
          if (!cancelled) {
            setError(true);
            setUnavailable(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });

    load();
    const id = setInterval(() => {
      if (!stopped.current) load();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { items, loading: !loaded, error, unavailable, refresh };
}

/** Users fetched on init, every 15s, and on demand (IdentityService equivalent). */
export function useIdentityUsers() {
  const {
    items: users,
    loading,
    error,
    unavailable,
    refresh,
  } = usePolledList<User>(identityApi.listUsers, 'users');
  return { users, loading, error, unavailable, refresh };
}

/** Groups fetched on init, every 15s, and on demand (IdentityService equivalent). */
export function useIdentityGroups() {
  const {
    items: groups,
    loading,
    error,
    unavailable,
    refresh,
  } = usePolledList<Group>(identityApi.listGroups, 'groups');
  return { groups, loading, error, unavailable, refresh };
}

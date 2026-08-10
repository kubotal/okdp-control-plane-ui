import { useCallback, useEffect, useRef, useState } from 'react';
import { unavailableFeature } from '../../core/api/http';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Initial load + interval polling for a project-scoped resource list,
 *  shared by the secret store, external secret and connection tables.
 *
 *  Poll results go through `merge`, which keeps the current array's
 *  referential identity unless `isRowChanged` reports a difference — this
 *  avoids DataTable re-render churn on every tick. `fetchList` and
 *  `isRowChanged` must be referentially stable (module-level functions).
 *
 *  A feature the cluster does not carry surfaces as `unavailable` rather than a
 *  load failure, and polling stops: retrying cannot fix it. */
export function usePolledResources<T>(
  projectId: string,
  fetchList: (projectId: string) => Promise<T[]>,
  isRowChanged: (incoming: T, current: T) => boolean,
  onLoadError: () => void,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  // Read from the interval callback, which closes over its first render.
  const stopped = useRef(false);

  const merge = useCallback(
    (incoming: T[]) => {
      setItems((current) => {
        if (current.length !== incoming.length) {
          return incoming;
        }
        const changed = incoming.some((row, i) => isRowChanged(row, current[i]));
        return changed ? incoming : current;
      });
    },
    [isRowChanged],
  );

  const reload = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    stopped.current = false;
    fetchList(projectId)
      .then((data) => {
        setItems(data);
        setUnavailable(null);
        setLoading(false);
      })
      .catch((err) => {
        const feature = unavailableFeature(err);
        if (feature) {
          stopped.current = true;
          setItems([]);
          setUnavailable(feature);
          setLoading(false);
          return;
        }
        onLoadErrorRef.current();
        setLoading(false);
      });
  }, [projectId, fetchList]);

  // Initial load + polling while a project is selected
  useEffect(() => {
    if (!projectId) return;
    reload();
    const timer = setInterval(() => {
      if (stopped.current) return;
      fetchList(projectId)
        .then(merge)
        .catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [projectId, fetchList, merge, reload, intervalMs]);

  return { items, loading, unavailable, reload, merge };
}

import { useCallback, useEffect, useRef, useState } from 'react';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Initial load + interval polling for a project-scoped resource list,
 *  shared by the secret store, external secret and connection tables.
 *
 *  Poll results go through `merge`, which keeps the current array's
 *  referential identity unless `isRowChanged` reports a difference — this
 *  avoids DataTable re-render churn on every tick. `fetchList` and
 *  `isRowChanged` must be referentially stable (module-level functions). */
export function usePolledResources<T>(
  projectId: string,
  fetchList: (projectId: string) => Promise<T[]>,
  isRowChanged: (incoming: T, current: T) => boolean,
  onLoadError: () => void,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

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
    fetchList(projectId)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => {
        onLoadErrorRef.current();
        setLoading(false);
      });
  }, [projectId, fetchList]);

  // Initial load + polling while a project is selected
  useEffect(() => {
    if (!projectId) return;
    reload();
    const timer = setInterval(() => {
      fetchList(projectId)
        .then(merge)
        .catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [projectId, fetchList, merge, reload, intervalMs]);

  return { items, loading, reload, merge };
}

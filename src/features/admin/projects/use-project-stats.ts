import { useEffect, useRef, useState } from 'react';
import { serviceApi } from '../../../core/api/service-api';
import { readUiCache, writeUiCache } from '../../../core/api/ui-cache';

export interface ProjectStats {
  /** Total deployed service instances in the project. */
  instances: number;
  /** False until the per-instance metric requests have settled. */
  metricsLoaded: boolean;
  /** Summed CPU usage in cores; null when no instance reports it. */
  cpuUsed: number | null;
  /** Summed memory usage in bytes; null when no instance reports it. */
  memUsed: number | null;
  /** Summed CPU limit in cores; null when usage is unreported or any
   *  usage-reporting instance has no limit configured (unbounded). */
  cpuLimit: number | null;
  /** Summed memory limit in bytes; same null semantics as cpuLimit. */
  memLimit: number | null;
}

/** Per-project KPI aggregates for the projects list: instance counts arrive
 *  first (one request per project), CPU/memory sums follow (one request per
 *  instance, like the overview's summary but rolled up per project). */
export function useProjectStats(projectNames: string[]): Record<string, ProjectStats> {
  // Joined key keeps the effect stable across re-renders that rebuild the
  // array with the same content.
  const namesKey = projectNames.join('|');
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  // Names already fanned out for (the list grows via SSE events; existing
  // rows must not refetch). Cache-seeded entries are NOT in this set — the
  // snapshot paints instantly, the live aggregation still runs.
  const fetchedRef = useRef<Set<string>>(new Set());
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshNonce((n) => n + 1);
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchedRef.current.clear();
  }, [refreshNonce]);

  useEffect(() => {
    const names = namesKey ? namesKey.split('|') : [];

    // No cancellation: fetchedRef marks every name as fetched up front, so a
    // namesKey change mid-flight (SSE ADDED/DELETED) must let in-flight
    // results land — they would otherwise be dropped and never retried.
    const mergeStats = (name: string, value: ProjectStats) => {
      setStats((prev) => ({ ...prev, [name]: value }));
    };

    // A partial result must not blank out a painted snapshot (no pulse
    // regression); the final aggregate below always overwrites.
    const mergeIfAbsent = (name: string, value: ProjectStats) => {
      setStats((prev) => (prev[name] ? prev : { ...prev, [name]: value }));
    };

    for (const name of names) {
      if (fetchedRef.current.has(name)) continue;
      fetchedRef.current.add(name);

      // Recent snapshot: paint immediately; the aggregation still runs.
      const cached = readUiCache<ProjectStats>(`project-stats:${name}`);
      if (cached) mergeIfAbsent(name, cached);

      (async () => {
        let base: ProjectStats;
        try {
          const instances = await serviceApi.getServices(name);
          base = {
            instances: instances.length,
            metricsLoaded: instances.length === 0,
            cpuUsed: null,
            memUsed: null,
            cpuLimit: null,
            memLimit: null,
          };
          if (instances.length === 0) {
            writeUiCache(`project-stats:${name}`, base);
            mergeStats(name, base);
            return;
          }
          mergeIfAbsent(name, base);

          const byService = await serviceApi.getProjectMetrics(name).catch(() => ({}) as Record<string, import('../../../core/models/service.model').ServiceMetrics>);
          const metrics = instances.map((i) => byService[i.name] ?? null);
          let cpu = 0;
          let mem = 0;
          let cpuLimit = 0;
          let memLimit = 0;
          let cpuSeen = false;
          let memSeen = false;
          // A project roll-up only has a meaningful limit when every instance
          // contributing usage is itself bounded; one unbounded instance makes
          // the whole project unbounded.
          let cpuBounded = true;
          let memBounded = true;
          for (const m of metrics) {
            if (m?.cpu?.available) {
              cpu += m.cpu.usedRaw;
              cpuSeen = true;
              if (m.cpu.limitRaw > 0) cpuLimit += m.cpu.limitRaw;
              else cpuBounded = false;
            }
            if (m?.memory?.available) {
              mem += m.memory.usedRaw;
              memSeen = true;
              if (m.memory.limitRaw > 0) memLimit += m.memory.limitRaw;
              else memBounded = false;
            }
          }
          const aggregated: ProjectStats = {
            ...base,
            metricsLoaded: true,
            cpuUsed: cpuSeen ? cpu : null,
            memUsed: memSeen ? mem : null,
            cpuLimit: cpuSeen && cpuBounded ? cpuLimit : null,
            memLimit: memSeen && memBounded ? memLimit : null,
          };
          writeUiCache(`project-stats:${name}`, aggregated);
          mergeStats(name, aggregated);
        } catch {
          // Failures are not cached, and must not replace a painted snapshot.
          mergeIfAbsent(name, {
            instances: 0,
            metricsLoaded: true,
            cpuUsed: null,
            memUsed: null,
            cpuLimit: null,
            memLimit: null,
          });
        }
      })();
    }
  }, [namesKey, refreshNonce]);

  return stats;
}

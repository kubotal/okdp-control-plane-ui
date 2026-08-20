import type { ListEvent } from '../api/sse';

// --- Platform Services (core OKDP, full lifecycle management) ---

export interface PlatformService {
  name: string;
  versions: string[];
  defaultVersion: string;
  description: string;
  icon?: string;
  category?: string;
  // Per-service package repository override (defaults to the Context's global
  // packageRepository when empty). Versions are resolved against this registry.
  repository?: string;
}

/**
 * Write payload for the catalog-management endpoints (POST/PUT
 * /api/platform-services). `defaultVersion` is optional on the wire — the
 * server falls back to the first version when it is omitted. The server also
 * validates each version against the OCI registry (quay.io) and rejects the
 * request (400) when a version does not exist. `repository` overrides the
 * package registry for this service; omitted means the global one is used.
 */
export interface PlatformServiceRequest {
  name: string;
  versions: string[];
  defaultVersion?: string;
  description?: string;
  icon?: string;
  category?: string;
  repository?: string;
}

export interface DeployServiceRequest {
  service: string;
  tag?: string;
  instanceName?: string;
  parameters: Record<string, unknown>;
}

export interface ServiceInstance {
  name: string;
  releaseName: string;
  service: string;
  serviceTag: string;
  status: string;
  /**
   * Human-readable explanation set by the backend when status is not
   * "Ready". Typically the latest K8s Warning event in the namespace
   * (e.g. a Helm upgrade failure or an invalid resource parameter).
   */
  statusMessage?: string;
  targetNamespace: string;
  url?: string;
  parameters: Record<string, unknown>;
  /** What the release is actually wired to, published by the controller,
   *  as opposed to what the service asked for. */
  connections?: ServiceConnection[];
  createdAt?: string;
}

/** One connection a deployed service is bound to. */
export interface ServiceConnection {
  name: string;
  namespace?: string;
  /** Connection or ClusterConnection: the two may share a name. */
  kind: string;
  /** False while the release is still waiting for it. */
  resolved: boolean;
}

export type ServiceEvent = ListEvent<ServiceInstance>;

export interface Pod {
  name: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  containers: PodContainer[];
}

export interface PodContainer {
  name: string;
  image: string;
  ready: boolean;
}

export interface MetricValue {
  usedRaw: number;
  limitRaw: number;
  used: string;
  limit: string;
  pct: number;
  available: boolean;
}

export interface ServiceMetrics {
  cpu: MetricValue;
  memory: MetricValue;
}

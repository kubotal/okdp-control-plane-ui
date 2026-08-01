import { environment } from '../../config/environment';
import { http } from './http';

// --- Connection type descriptors ---
// The server owns these: one descriptor drives the form below, the server-side
// validation and the recognition of a deployed service as a provider. Adding a
// connection type therefore needs no change here.

export type ConnectionFieldType = 'string' | 'number' | 'boolean' | 'enum';

export interface ConnectionField {
  name: string;
  label: string;
  type: ConnectionFieldType;
  required: boolean;
  /** Credentials: masked in the form, never returned by the API afterwards. */
  secret?: boolean;
  default?: string | number | boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
}

export interface ConnectionType {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  /** Whether a user may declare this type by hand. Types that only ever come
   *  from a deployed service (Trino, ...) appear in the internal tab only. */
  external: boolean;
  fields: ConnectionField[];
}

export interface ConnectionCatalog {
  types: ConnectionType[];
  /** False while the KuboCD connection CRDs are not installed: external
   *  connections cannot be persisted yet, internal ones still work. */
  crdAvailable: boolean;
}

// --- Connections ---

export type ConnectionScope = 'project' | 'platform';

export type ConnectionValues = Record<string, string | number | boolean>;

export interface Connection {
  name: string;
  type: string;
  scope: ConnectionScope;
  namespace?: string;
  description?: string;
  status: string;
  message?: string;
  values: ConnectionValues;
  /** Names of the fields holding credentials — their values are never sent. */
  secretFields?: string[];
  createdAt?: string;
}

export interface ConnectionRequest {
  name: string;
  type: string;
  description?: string;
  values: ConnectionValues;
}

/** A connection provided by a service already deployed in the project. */
export interface InternalConnection {
  name: string;
  type: string;
  typeDisplay: string;
  icon?: string;
  category?: string;
  service: string;
  releaseName: string;
  namespace: string;
  status: string;
  /** Empty until a Service actually carries the endpoint — never guessed. */
  endpoint: string;
  host: string;
  port: number;
  values: ConnectionValues;
  /** True once the entry comes from a Connection owned by the release
   *  controller rather than being derived from the deployed service. */
  managed: boolean;
  createdAt?: string;
}

export type ConnectionTestReason =
  | 'unreachable'
  | 'auth-failed'
  | 'not-found'
  | 'timeout'
  | 'invalid-config'
  | 'unknown';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  reason?: ConnectionTestReason;
  durationMs: number;
}

export interface ConnectionTestRequest {
  type: string;
  values: ConnectionValues;
}

const seg = encodeURIComponent;

function projectUrl(projectId: string): string {
  return `${environment.apiBaseUrl}/api/projects/${seg(projectId)}/connections`;
}

function platformUrl(): string {
  return `${environment.apiBaseUrl}/api/platform-connections`;
}

/** Project connections and platform-wide ones share a shape; only the base URL
 *  differs, so the console can render both with the same components. */
function endpoints(baseUrl: string) {
  return {
    list(): Promise<Connection[]> {
      return http.getList<Connection>(baseUrl);
    },

    create(request: ConnectionRequest): Promise<Connection> {
      return http.post<Connection>(baseUrl, request);
    },

    update(connectionName: string, request: ConnectionRequest): Promise<Connection> {
      return http.put<Connection>(`${baseUrl}/${seg(connectionName)}`, request);
    },

    delete(connectionName: string): Promise<void> {
      return http.delete(`${baseUrl}/${seg(connectionName)}`);
    },

    test(request: ConnectionTestRequest): Promise<ConnectionTestResult> {
      return http.post<ConnectionTestResult>(`${baseUrl}/test`, request);
    },
  };
}

export const connectionApi = {
  catalog(): Promise<ConnectionCatalog> {
    return http.get<ConnectionCatalog>(`${environment.apiBaseUrl}/api/connection-types`);
  },

  project(projectId: string) {
    return endpoints(projectUrl(projectId));
  },

  platform() {
    return endpoints(platformUrl());
  },

  listInternal(projectId: string): Promise<InternalConnection[]> {
    return http.getList<InternalConnection>(`${projectUrl(projectId)}/internal`);
  },
};

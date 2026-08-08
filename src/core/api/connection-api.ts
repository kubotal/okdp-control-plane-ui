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
  /** The value is stored in the credentials Secret, and never returned by the
   *  API afterwards. This is about storage, not about how it is typed in. */
  secret?: boolean;
  /** The value is hidden as it is typed. A database user name is stored in the
   *  Secret without being worth hiding, so the two are separate. */
  masked?: boolean;
  default?: string | number | boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  /** The field only applies when another one holds this value. A PostgreSQL
   *  TLS mode has no meaning on a MySQL server, and offering both at once is
   *  how a connection ends up carrying the wrong one. */
  showWhen?: { field: string; value: string };
  /** The value follows from another field, so the form does not ask for it.
   *  The server recomputes it on save either way. */
  derived?: { from: string; map: Record<string, string> };
}

export interface ConnectionType {
  /** Also the KuboCD Interface this type produces: one type, one contract. A
   *  package asking for `database-server` is answered by the type of the same
   *  name, whose engine field says whether it is PostgreSQL or MySQL. */
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

/** Where one credential lives. The console shows the reference so a consumer
 *  can mount it; it never receives, and cannot display, the value. */
export interface SecretRef {
  name: string;
  namespace?: string;
  key: string;
}

/** One environment variable of a connection's usage. Exactly one of `value`
 *  and `secretRef` is set — a credential is always the latter. */
export interface ConnectionEnvVar {
  name: string;
  value?: string;
  secretRef?: SecretRef;
}

/** What a consumer needs to actually use a connection, rendered by the server
 *  so the formats live in one place. */
export interface ConnectionUsage {
  uri?: string;
  uriLabel?: string;
  env?: ConnectionEnvVar[];
}

/** The Secret holding a connection's credentials, and the keys it carries. */
export interface CredentialsSecretRef {
  name: string;
  namespace?: string;
  keys?: string[];
}

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
  /** The Secret holding those credentials, for consumers to reference. */
  credentialsSecret?: CredentialsSecretRef;
  usage?: ConnectionUsage;
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
  /** Same shape as an external connection's, minus the credential variables:
   *  an internal connection carries no Secret. */
  usage?: ConnectionUsage;
  createdAt?: string;
}

/** A connection offered when deploying a service whose package declares an
 *  input. Managed connections are included: a Trino published by another
 *  release is exactly what a new service wants to bind. */
export interface SelectableConnection {
  name: string;
  scope: ConnectionScope;
  type: string;
  status: string;
  description?: string;
  managed: boolean;
  /** Release publishing a managed connection. */
  providedBy?: string;
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

  /** Connections a deployment form can offer for an input of that contract. */
  selectable(projectId: string, iface: string): Promise<SelectableConnection[]> {
    return http.getList<SelectableConnection>(
      `${projectUrl(projectId)}/selectable?interface=${seg(iface)}`,
    );
  },
};

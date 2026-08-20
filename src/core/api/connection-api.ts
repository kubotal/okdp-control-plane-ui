import { environment } from '../../config/environment';
import { http } from './http';

// --- Contract descriptors ---
// The server owns these: one descriptor drives the form below, the server-side
// validation and the recognition of a deployed service as a provider. Adding a
// contract therefore needs no change here.

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

export interface ContractDescriptor {
  /** Also the KuboCD Contract this descriptor produces. A package asking for
   *  `database-server` is answered by the contract of the same name, whose
   *  engine field says whether it is PostgreSQL or MySQL. */
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  /** Whether a user may declare this contract by hand. Contracts that only ever
   *  come from a deployed service (Trino, ...) appear in the internal tab only. */
  external: boolean;
  fields: ConnectionField[];
}

export interface ConnectionCatalog {
  types: ContractDescriptor[];
  /** False while the KuboCD connection CRDs are not installed: external
   *  connections cannot be persisted yet, internal ones still work. */
  crdAvailable: boolean;
}

// --- Connections ---

/** A connection lives in the namespace of its project. The cluster-wide
 *  scope was removed on 2026-08-10: nothing consumed it. */
export type ConnectionScope = 'project';

export type ConnectionValues = Record<string, string | number | boolean>;

/** The Secret holding a connection's credentials, and the keys it carries. */
export interface CredentialsSecretRef {
  name: string;
  namespace?: string;
  keys?: string[];
  /** True when the console wrote this Secret, false when the connection points
   *  at one that was already there, typically projected from a vault. Deleting
   *  the connection removes the first and leaves the second alone. */
  owned: boolean;
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
  /** Names of the fields holding credentials. Their values are never sent. */
  secretFields?: string[];
  /** The Secret holding those credentials, for consumers to reference. */
  credentialsSecret?: CredentialsSecretRef;
  createdAt?: string;
}

export interface ConnectionRequest {
  name: string;
  type: string;
  description?: string;
  values: ConnectionValues;
  /** Names a Secret already present in the project, holding the credentials.
   *  When set, the server writes no Secret of its own: the credentials may come
   *  from anywhere, typically projected from a vault by External Secrets. */
  existingSecret?: string;
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
  /** The address a consumer would reach, taken from the value the contract
   *  declares as carrying it: a URI for trino or hive, host and port for a
   *  database. Empty when the contract carries no address at all. */
  endpoint: string;
  host: string;
  port: number;
  values: ConnectionValues;
  /** True once the entry comes from a Connection owned by the release
   *  controller rather than being derived from the deployed service. */
  managed: boolean;
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

/** A service bound to a connection, as the release controller published it. */
export interface ConnectionConsumer {
  service: string;
  releaseName: string;
  status: string;
  /** False while the service is only waiting for the connection. */
  effective: boolean;
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
  /** One entry per address probed. A contract may publish several, and a store
   *  reachable from outside the cluster but not from inside it needs both
   *  answers to be readable. */
  checks?: ConnectionTestCheck[];
}

export interface ConnectionTestCheck {
  label: string;
  target: string;
  /** The path a workload will actually take, the one `success` reflects. */
  decisive: boolean;
  success: boolean;
  message: string;
  reason?: ConnectionTestReason;
}

export interface ConnectionTestRequest {
  type: string;
  values: ConnectionValues;
}

const seg = encodeURIComponent;

function projectUrl(projectId: string): string {
  return `${environment.apiBaseUrl}/api/projects/${seg(projectId)}/connections`;
}

/** The endpoints of a project's connections. */
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
    return http.get<ConnectionCatalog>(`${environment.apiBaseUrl}/api/contracts`);
  },

  project(projectId: string) {
    return endpoints(projectUrl(projectId));
  },


  listInternal(projectId: string): Promise<InternalConnection[]> {
    return http.getList<InternalConnection>(`${projectUrl(projectId)}/internal`);
  },

  /** Connections a deployment form can offer for an input of that contract. */
  selectable(projectId: string, contract: string): Promise<SelectableConnection[]> {
    return http.getList<SelectableConnection>(
      `${projectUrl(projectId)}/selectable?contract=${seg(contract)}`,
    );
  },

  /** Services bound to a connection, to show before a destructive edit. */
  consumers(projectId: string, connectionName: string): Promise<ConnectionConsumer[]> {
    return http.getList<ConnectionConsumer>(
      `${projectUrl(projectId)}/${seg(connectionName)}/consumers`,
    );
  },
};

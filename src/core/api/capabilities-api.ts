import { environment } from '../../config/environment';
import { http } from './http';

/** What the platform is wired to, resolved by the server from the Context. */
export interface Capabilities {
  identity: {
    /** "external" (bring your own OIDC, the default) or "kubauth". */
    provider: string;
    /** True when the kubauth user and group management API is served. */
    userManagement: boolean;
  };
  oidcProvisioning: {
    /** "none", "kubauth" or "keycloak". */
    provider: string;
  };
}

const apiUrl = `${environment.apiBaseUrl}/api/capabilities`;

export const capabilitiesApi = {
  get(): Promise<Capabilities> {
    return http.get<Capabilities>(apiUrl);
  },
};

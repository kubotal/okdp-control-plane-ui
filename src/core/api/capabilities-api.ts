import { environment } from '../../config/environment';
import { http } from './http';

/** What the platform is wired to, as the server resolves it from the Context at
 *  request time. The console reads it once at start-up to hide the areas this
 *  installation does not carry, rather than offering a screen whose every call
 *  answers "not available here". */
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

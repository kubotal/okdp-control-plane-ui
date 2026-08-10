// Environment configuration. Vite statically replaces import.meta.env.PROD,
// so the unused branch is dropped from production bundles.
//
// The OIDC settings are read at STARTUP, not baked into the bundle: the same
// image must run against any cluster, whose issuer is not known when the
// bundle is built. The container entrypoint writes /config.js, which index.html
// loads before the bundle. The values below are the fallback for `npm run dev`.

declare global {
  interface Window {
    __OKDP_CONFIG__?: Partial<Pick<OidcConfig, 'authority' | 'clientId'>> &
      Partial<IdentityConfig>;
  }
}

const runtime = (typeof window !== 'undefined' && window.__OKDP_CONFIG__) || {};

interface OidcConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scope: string;
  responseType: string;
  silentRenew: boolean;
  logLevel: string;
}

/** How a token says who the caller is, and which role opens the
 *  administration screens. Both come from the cluster at startup: the roles of
 *  one realm are the groups of another, and hardcoding either meant the
 *  console only ever worked against the realm it was written for. */
interface IdentityConfig {
  /** Path to the claim carrying the caller's roles, dots allowed for a nested
   *  one. It must be a claim of the ID TOKEN: that is what oidc-client-ts
   *  exposes as the user profile, and it is not the same set as the access
   *  token's. Keycloak, for one, keeps realm_access.roles out of the ID token,
   *  so pointing at it silently yields no role at all. */
  rolesClaim: string;
  /** The role that grants administration. */
  adminRole: string;
}

interface Environment {
  production: boolean;
  apiBaseUrl: string;
  oidc: OidcConfig;
  identity: IdentityConfig;
  githubUrl: string;
}

const development: Environment = {
  production: false,

  // API Configuration
  apiBaseUrl: 'http://localhost:8093',

  oidc: {
    authority: runtime.authority || 'https://keycloak.okdp.sandbox/realms/master',
    clientId: runtime.clientId || 'okdp-ui',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    scope: 'openid profile email groups offline_access',
    responseType: 'code',
    silentRenew: true,
    logLevel: 'Debug',
  },

  identity: {
    rolesClaim: runtime.rolesClaim || 'groups',
    adminRole: runtime.adminRole || 'platform_admin',
  },

  // External Links
  githubUrl: 'https://github.com/okdp',
};

const production: Environment = {
  ...development,

  production: true,

  // API Configuration - relative URLs for same-origin deployment
  apiBaseUrl: '',

  oidc: {
    ...development.oidc,
    logLevel: 'None',
  },
};

export const environment: Environment = import.meta.env.PROD ? production : development;

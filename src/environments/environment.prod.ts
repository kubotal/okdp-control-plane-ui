// Production environment configuration
export const environment = {
    production: true,

    // API Configuration - same-origin root; services already prepend their
    // own /api/... prefix (e.g. `${apiBaseUrl}/api/projects`), so the base
    // must stay empty to avoid a duplicated /api/api/ path.
    apiBaseUrl: '',

    // OIDC Configuration - same values as dev, logLevel set to None
    oidc: {
        authority: 'https://kubauth.okdp.dev-sandbox', // Update for production Keycloak
        clientId: 'okdp-app',
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
        scope: 'openid profile email groups offline_access',
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
        logLevel: 'None',
    },

    // External Links - production URLs
    githubUrl: 'https://github.com/okdp',
};

import '@testing-library/jest-dom/vitest';

// En production, /config.js fournit ces valeurs avant le chargement du bundle, et
// la console refuse de demarrer sans autorite plutot que d'en deviner une. Les
// tests jouent ce role ici, sinon createUserManager echoue comme il le doit.
window.__OKDP_CONFIG__ = {
  authority: 'https://keycloak.test.invalid/realms/test',
  clientId: 'okdp-ui-test',
};

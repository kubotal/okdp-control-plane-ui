/** Acronyms that packages spell in lowercase or that a naive capitalisation
 *  would mangle. Anything absent from this list is simply capitalised. */
const ACRONYMS = new Set([
  'api',
  'cpu',
  'csrf',
  'dcr',
  'dns',
  'gpu',
  'hdfs',
  'http',
  'https',
  'id',
  'io',
  'ip',
  'jdbc',
  'json',
  'jvm',
  'jwt',
  'k8s',
  'oidc',
  'opa',
  'pkce',
  'pvc',
  'ram',
  'rbac',
  's3',
  'sql',
  'ssl',
  'sso',
  'tls',
  'ttl',
  'ui',
  'uid',
  'uri',
  'url',
  'yaml',
]);

/** Splits on the boundaries a camelCase or snake_case name actually has.
 *  The first alternative keeps a plural acronym whole (`URIs`), the second an
 *  acronym run (`JVM` in `additionalJVMConfig`), the third an ordinary word. */
const TOKEN = /[A-Z]+s(?![a-z])|[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g;

function renderToken(token: string): string {
  const lower = token.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (lower.endsWith('s') && ACRONYMS.has(lower.slice(0, -1))) {
    return `${lower.slice(0, -1).toUpperCase()}s`;
  }
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** Turns a schema property name into the label shown above its input.
 *  `oidcUsePKCE` reads "OIDC Use PKCE", not "Oidc Use P K C E". */
export function formatLabel(name: string): string {
  return (name.replace(/[_-]+/g, ' ').match(TOKEN) ?? []).map(renderToken).join(' ');
}

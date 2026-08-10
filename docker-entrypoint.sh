#!/bin/sh
# Write the runtime configuration the bundle reads before it starts.
#
# The image is built once and runs against any cluster, whose OIDC issuer is
# not known at build time. index.html loads /config.js before the bundle, and
# src/config/environment.ts reads window.__OKDP_CONFIG__ from it.
set -eu

# rolesClaim and adminRole travel the same way: which claim carries the roles,
# and which role grants administration, are properties of the realm the cluster
# authenticates against, not of this image. The defaults match Keycloak.
cat > /usr/share/nginx/html/config.js <<EOF
window.__OKDP_CONFIG__ = {
  authority: "${OIDC_AUTHORITY:-}",
  clientId: "${OIDC_CLIENT_ID:-}",
  rolesClaim: "${OIDC_ROLES_CLAIM:-groups}",
  adminRole: "${OIDC_ADMIN_ROLE:-platform_admin}"
};
EOF

exec "$@"

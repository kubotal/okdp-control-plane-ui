ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# Build the Angular bundle on the native build platform (no QEMU): the output
# is static, architecture-independent assets reused for every target arch.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

WORKDIR /workspace

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build -- --configuration=production

FROM ${NGINX_IMAGE}

ARG OKDP_UI_UID=1001

LABEL org.opencontainers.image.title="OKDP Control Plane UI" \
    org.opencontainers.image.description="Web console for the OKDP platform" \
    org.opencontainers.image.url="https://okdp.io" \
    org.opencontainers.image.source="https://github.com/OKDP/okdp-control-plane-ui" \
    org.opencontainers.image.vendor="okdp.io" \
    org.opencontainers.image.licenses="Apache-2.0"

COPY --from=build /workspace/dist/okdp-ui-new/browser/ /usr/share/nginx/html/
COPY default.conf /etc/nginx/conf.d/default.conf

# Replace the default privileged port (80) by an unprivileged one (4200)
# When using a non-root user, Nginx ignores 'user' directive but still shows a warning.
RUN sed -i -E -e 's/^(\s*)listen\s+80\s*;/\1listen 4200;/' \
              -e 's/^(\s*)listen\s+\[::\]:80\s*;/\1listen [::]:4200;/' /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf \
    && sed -i 's/^\(\s*user\s\+.*\)$/# \1/' /etc/nginx/nginx.conf \
    && chown -R ${OKDP_UI_UID}:root /usr/share/nginx/html /var/cache/nginx /etc/nginx /run /var/run

EXPOSE 4200

USER ${OKDP_UI_UID}

# Run the application in the foreground
CMD ["nginx", "-g", "daemon off;"]

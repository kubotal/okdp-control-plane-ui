ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

# Build the Vite bundle on the native build platform (no QEMU): the output
# is static, architecture-independent assets reused for every target arch.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM ${NGINX_IMAGE}

ARG OKDP_UI_UID=1001

LABEL org.opencontainers.image.title="OKDP Control Plane UI" \
    org.opencontainers.image.description="Web console for the OKDP platform" \
    org.opencontainers.image.url="https://okdp.io" \
    org.opencontainers.image.source="https://github.com/OKDP/okdp-control-plane-ui" \
    org.opencontainers.image.vendor="okdp.io" \
    org.opencontainers.image.licenses="Apache-2.0"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Run as a non-root user. nginx.conf already listens on the unprivileged
# port 4200, so only the master 'user' directive needs silencing and the
# runtime directories need to be writable by the unprivileged user.
RUN sed -i 's/^\(\s*user\s\+.*\)$/# \1/' /etc/nginx/nginx.conf \
    && chown -R ${OKDP_UI_UID}:root /usr/share/nginx/html /var/cache/nginx /etc/nginx /run /var/run

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:4200/health || exit 1

USER ${OKDP_UI_UID}

# The entrypoint writes /config.js from the environment, then hands over to nginx.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

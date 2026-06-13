# OKDP Console

The OKDP Console is the web interface for managing OKDP projects and resources.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Deploy with the Helm chart

The console runs **in-cluster** (nginx serves the build and proxies `/api` to the
server), deployed with the bundled chart (`chart/`):

```bash
helm install okdp-ui ./chart -n okdp-system \
  --set ingress.host=console.okdp.dev-sandbox
```

For local development you can still run `npm start`.

## Build

To build the project run:

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Architecture

- **Framework**: Angular 20
- **UI Library**: PrimeNG
- **Styling**: SCSS with CSS Variables for theming

## Key Features

- **Project Management**: Create, list, and delete projects.
- **Secrets**: Per-project **Secret Stores** (e.g. HashiCorp Vault) and **External Secrets** that sync into Kubernetes Secrets.
- **Responsive Design**: Collapsible sidebar, adaptive layouts.
- **Modern UI**: Clean aesthetic with consistent theming.

## Example: Secret Store (Vault)

1. Open your project → **Secrets** → **Secret Stores** → **Add secret store**.
2. Fill the form with simple values like below. The Vault URL must work **from inside the cluster** (where ESO runs).

| Field | Simple example |
|-------|----------------|
| Store name | `my-store` |
| Server URL | `http://vault-main.vault-system.svc.cluster.local:8200` |
| Secret path | `secret` |
| KV version | `v2` |
| Token | `root` *(sandbox / dev only; never in production)* |
| Default store | optional checkbox |


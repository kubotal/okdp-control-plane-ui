# Architecture

The OKDP Console is the web UI for managing OKDP projects and data-platform
services (Spark, Jupyter, Airflow, Trino, Superset, Polaris, secrets…). It is a
**React 19 + Vite** single-page application written in strict TypeScript that
talks to the OKDP **control-plane API**. The codebase is a port of an earlier
Angular app; comments referencing Angular constructs (`APP_INITIALIZER`,
`HttpClient`, `route.data`, route guards) document which construct each piece
replaces.

Tech stack: React 19, react-router 7, PrimeReact 10 (styled mode, lara theme),
Tailwind CSS v4, oidc-client-ts 3, Vite 7, Vitest 3.

- [Bootstrap & provider tree](#bootstrap--provider-tree)
- [Routing](#routing)
- [Authentication](#authentication)
- [HTTP & API clients](#http--api-clients)
- [Streaming: the REST + SSE pattern](#streaming-the-rest--sse-pattern)
- [State & storage](#state--storage)
- [Dynamic schema forms](#dynamic-schema-forms)
- [Navigation & the views world](#navigation--the-views-world)
- [SQL editor](#sql-editor)
- [Styling](#styling)
- [Build, test & deployment](#build-test--deployment)
- [Directory layout](#directory-layout)
- [Known limitations & open decisions](#known-limitations--open-decisions)

## Bootstrap & provider tree

`src/main.tsx` mounts `<App />` under `<StrictMode>`. `src/App.tsx` declares the
provider tree — **order is intentional**, outermost first:

| # | Provider | Responsibility |
|---|----------|----------------|
| 1 | `PrimeReactProvider` | PrimeReact global config (`ripple: true`) |
| 2 | `ThemeProvider` | light/dark/system theme, persisted, toggles `body.dark-mode` |
| 3 | `EnvBarProvider` | environment-bar visibility preference |
| 4 | `NavPrefsProvider` | sidebar item show/hide + entry size |
| 5 | `CustomViewsProvider` | user-created view launchers per project (local-only) |
| 6 | `ConfirmPrefsProvider` | typed-delete confirmation preference |
| 7 | `BrowserRouter` | routing (+ `ScrollToTop` on pathname change) |
| 8 | `AuthProvider` | OIDC state machine around `oidc-client-ts` `UserManager` |
| 9 | `AuthGate` | renders `null` until the one-shot OIDC check resolves — **no route mounts before auth state is known** (the `APP_INITIALIZER` equivalent) |
| 10 | `AuthRedirector` | post-login deep-link restore + global 401/403 handler |
| 11 | `ProjectContextProvider` | available projects (REST + SSE) and the selected project |
| 12 | `AppRoutes` | the route table |

## Routing

All routes live in `src/app-routes.tsx`. Pages are `lazy()`-loaded and
**default-exported** (keep both when adding a page); the tree is wrapped in
`<Suspense fallback={null}>`.

| Path | Component | Guards |
|------|-----------|--------|
| `/` | `RootRedirect` | — (consumes a pending return URL, else `/home`) |
| `/login` | `HomePage` (landing) | — |
| `/home` | `StartPage` | `RequireAuth` |
| `/admin` | `AdminPage` | `RequireAuth` → `RequireAdmin` |
| `/identity` | `IdentityPage` | `RequireAuth` → `RequireAdmin` |
| `/platform-connections` | `PlatformConnectionsPage` | `RequireAuth` → `RequireAdmin` |
| `/settings` | `SettingsPage` | `RequireAuth` |
| `/views` | `ViewsRedirect` → `/projects/{current}/views` | `RequireAuth` |
| `/projects` | `ProjectList` | `RequireAuth` |
| `/projects/:projectId` | `ProjectRouteSync` → `ProjectHome` (index) | `RequireAuth` |
| `/projects/:projectId/secret-stores` | `SecretsPage` | same |
| `/projects/:projectId/connections` | `ConnectionsPage` | same |
| `/projects/:projectId/settings` | `ProjectSettingsPage` | same |
| `/projects/:projectId/views` | `CustomViewsPage` | same |
| `/projects/:projectId/views/sql-editor` | `SqlEditorPage` | same |
| `/projects/:projectId/views/spark/applications[...]` | Spark list / submit / detail / edit pages | same |
| `*` | redirect to `/home` | — |

Three structural pieces:

- **`ProjectPage`** (`features/project-console/project-page.tsx`) is the shared
  console shell — a pathless layout route. `/admin`, `/identity`, `/settings`,
  `/views`, `/projects` and everything under `/projects/:projectId` render in
  its `<Outlet>`.
- **`ProjectRouteSync`** (`core/guards/project-route.tsx`) is the route-guard
  equivalent: it syncs the selected project in `ProjectContext` from the URL
  param and renders nothing until context matches the URL, so project-scoped
  pages never see a mismatched context.
- **`serviceRoutes(basePath, data)`** generates the list/deploy/edit/detail
  route quadruple for a service area. The generic `ServicesPage` is driven
  entirely by per-route props (`title`, `deployLabel`, `serviceFilter`,
  `emptyMessage` — the `route.data` equivalent), so jupyterhub,
  spark/history-server, polaris, trino, airflow and superset all share one
  component. **Differentiate service areas via the props object, not new
  components.**

## Authentication

Everything lives in `src/core/auth/`; configuration in
`src/config/environment.ts` (`environment.oidc`).

1. **Init.** `AuthProvider` creates a single `UserManager` (held in a ref):
   authorization-code flow, tokens stored in **sessionStorage**
   (`WebStorageStateStore`), `automaticSilentRenew` enabled, `offline_access`
   in scope.
2. **One-shot callback.** The init effect redeems the OIDC redirect callback
   **exactly once** via a ref-held promise. StrictMode double-invokes effects
   in dev; without this guard the single-use authorization code would be
   redeemed twice and the IdP may revoke the tokens. **Preserve that guard.**
   When no callback is present, the session is restored from sessionStorage
   (rejected if expired). Either way `ready: true` is set and `AuthGate` lets
   the app render.
3. **Deep links.** On mount (before auth state is knowable), the current URL is
   saved under the `auth_return_url` sessionStorage key (skipping `/`,
   `/index.html` and login paths). After login, `AuthRedirector` consumes the
   key and `replace`-navigates to it; the `/` index route is handled by
   `RootRedirect`, which also consumes a pending return URL before defaulting
   to `/home`, so the two redirects cannot race. `RequireAuth` re-saves the
   location whenever it bounces an unauthenticated user, which covers the
   silent-renew-expiry path.
4. **Roles.** Derived from the OIDC `groups` claim. `hasRole('admins')` gates
   `RequireAdmin`; non-admins are sent to `/home`.
5. **Token renewal.** Silent renew runs automatically. `silentRenewError` is
   logged (the current token is usually still valid at that point);
   `accessTokenExpired` drops the local session, which routes the user back to
   login with their location saved. `token()` refuses to hand out an expired
   access token.
6. **401/403.** `http.ts` fires the unauthorized handler registered by
   `AuthRedirector`: forced logout (local state cleared, including the
   project selection and per-project SQL drafts), the interrupted location is
   re-saved, and the user lands on `/login?sessionExpired=true` — the landing
   page shows a session-expired notice and the deep link is restored after
   re-login.

## HTTP & API clients

`src/core/api/http.ts` is a small `fetch` wrapper (the `HttpClient` +
interceptors equivalent):

- Attaches `Authorization: Bearer <token>` to any URL containing `/api/`
  (the `secureRoutes` equivalent). Auth wires the token provider via
  `setAuthTokenProvider`; **feature code never reads the token directly** — it
  goes through `http`.
- Throws `HttpError { status, statusText, body, url }` on non-OK responses;
  401/403 additionally fire the unauthorized handler.
- `get` / `getText` / `post` / `put` / `patch` / `delete` plus
  **`getList<T>`**, which resolves `[]` on an empty body — use it for every
  list endpoint instead of hand-rolling `|| []`.
- Every method accepts an optional trailing `init?: RequestInit`, used e.g. to
  thread an `AbortSignal` through (`sqlApi.execute`).

Each domain has a `*-api.ts` exporting a plain object of methods, with URLs
built from `environment.apiBaseUrl`. Path segments are encoded with
`encodeURIComponent` at the client boundary (the per-file `seg` helper) —
follow that pattern for new endpoints. Current clients:

| Client | Endpoints |
|--------|-----------|
| `project-api.ts` | `/api/projects` CRUD + `/stream` SSE |
| `service-api.ts` | platform services, schema, per-project service instances CRUD + `/stream` SSE, pods, metrics, pod logs (text + follow stream), profile images |
| `spark-api.ts` | spark config/schema, spark-apps CRUD (guided + YAML submit) + `/stream` SSE, Spark UI info, driver logs (text + follow stream) |
| `identity-api.ts` | `/api/v1/identity` users/groups CRUD (admin) |
| `secret-store-api.ts` | per-project secret stores CRUD, connection test, status |
| `external-secret-api.ts` | per-project external secrets CRUD, status |
| `connection-api.ts` | connection type descriptors, per-project external connections CRUD + connectivity test, derived internal connections, and the same external CRUD + test at platform scope (admin) |
| `sql-api.ts` | `execute(projectId, serviceName, query, maxRows?, signal?)` — POST `/api/projects/{id}/services/{name}/sql` to the control plane's SQL proxy |

`src/core/api/ui-cache.ts` is a deliberate in-memory, per-tab,
stale-while-revalidate cache (60 s TTL) for slow reads (instance lists,
metrics): revisited pages paint instantly from the snapshot while the fresh
request always runs and overwrites. It is never a reason to skip a fetch.

## Streaming: the REST + SSE pattern

`src/core/api/sse.ts` holds the primitives:

- `subscribeJsonStream<T>(url, subscriber, label)` — `EventSource` emitting
  parsed JSON; relies on the browser's auto-reconnect and only completes when
  the connection is permanently closed.
- `subscribeTextStream(url, subscriber)` — raw text lines (log following);
  completes silently on error.
- `applyListEvent<T>(list, event, key)` — folds a watch-style
  `{ type: 'ADDED' | 'MODIFIED' | 'DELETED', object }` event into an immutable
  list, upserting by key. The event types (`ProjectEvent`, `ServiceEvent`,
  `SparkAppEvent`) are aliases of `ListEvent<T>`.

**Every live list does an initial REST fetch, then merges SSE events** —
follow this pattern for new lists. Current consumers:

| Consumer | Resource |
|----------|----------|
| `core/context/project-context.tsx` | projects |
| `core/hooks/use-live-services.ts` | service instances (shared hook) |
| `features/project-console/services/service-list.tsx` | service instances (filtered per area) |
| `features/project-console/spark/spark-list.tsx` | spark applications |

`useLiveServices(projectName)` (`src/core/hooks/use-live-services.ts`) is the
canonical live service-instance hook: cached paint from `ui-cache`, REST fetch,
SSE merge, and **state keyed by the owning project** so a project switch can
never flash another project's data. `useViewServices` (views world) and
`useProjectServicesSummary` (dashboard) are built on it — build new
instance-driven features on it too.

## State & storage

### Project context (`src/core/context/project-context.tsx`)

Holds `availableProjects` (REST + SSE), the selected project (persisted in
sessionStorage), `isLoading` / `loadError` / `reload()`, and self-corrects when
the selection disappears from the list: it falls back to the first remaining
project (navigating only if the user is inside `/projects/:id/...`), or clears
the selection and goes to `/projects` when none remain. The destructive
self-correction is gated on at least one **successful** load, so a transient
fetch failure never wipes the saved selection. It only fetches while
authenticated — the provider is mounted on anonymous routes too, and an early
fetch would 401 and trigger the forced-logout handler.

### Preferences

Theme, env-bar, nav-prefs, custom views and confirm-prefs are
localStorage-backed contexts under `src/core/preferences/` and
`src/core/theme/`. State updaters are pure (persistence happens in effects) —
the app runs under StrictMode, which double-invokes updaters in dev.

### Storage keys

**All web-storage keys live in `src/core/storage-keys.ts`** — add new keys
there so writers and the logout cleaner cannot drift.

| Key | Stores | Storage |
|-----|--------|---------|
| `okdp-selected-projectId` | selected project (cleared on logout) | session |
| `auth_return_url` | deep link to restore after login | session |
| `okdp-sql-query:{projectId}` | SQL editor draft per project (swept on logout) | session |
| `okdp-theme` | theme mode — also read by the `index.html` pre-paint script | local |
| `okdp-sidebar-collapsed`, `okdp-nav-expanded`, `okdp-nav-hidden`, `okdp-nav-size` | sidebar/nav preferences | local |
| `okdp-project-colors` | project accent colors (cross-tab synced) | local |
| `okdp-env-bar`, `okdp-typed-delete` | env-bar & typed-delete preferences | local |
| `okdp-custom-views` | user-created launchers per project (local-only) | local |

`oidc-client-ts` additionally persists the OIDC user/tokens in sessionStorage
under library-managed keys.

## Dynamic schema forms

`src/shared/components/dynamic-schema-form.tsx` renders deploy/edit forms from
a JSON Schema fetched from the API (service deploy/edit flows are built on it,
via the `useServiceSchema` hook in `service-utils.ts`). `x-ui-*` extension
keys:

| Key | Effect |
|-----|--------|
| `x-ui-order` | sort position within the form |
| `x-ui-group` | titled section grouping (icon per `GROUP_ICONS`) |
| `x-ui-widget` | explicit widget: `password`, `textarea`, `select`, `stepper`, `number`, `toggle`, `url`; `profile-editor` excludes the field (rendered by `profile-list-editor.tsx` instead) |
| `x-ui-condition` | `{ field, value }` — render only when `values[field] === value` |
| `x-ui-advanced` | moves the field behind the per-group "Show advanced options" expander |
| `x-ui-columns` / `x-ui-col-span` | group grid columns / per-field span |
| `x-ui-placeholder` | input placeholder |

Without `x-ui-widget`: `enum` → select, `boolean` → toggle, numbers → number
input, else text. Validation checks Kubernetes `resource.Quantity` format on
cpu/memory/request/limit-looking string fields (enum fields excluded), skips
fields hidden by `x-ui-condition`, and omits hidden fields' values from the
emitted parameters; overall validity is reported through `onValidityChange`.

## Navigation & the views world

`src/features/project-console/nav-config.tsx` exports `NAV_CATEGORIES` — the
**single source of truth** for the sidebar, shared by the project console
(renderer) and the settings page (show/hide toggles). Item flags: `disabled`
(inert "exploration" placeholder), `defaultHidden` (off until the user enables
it), category `fixed` (exempt from hide preferences). Brand logos come from
`simple-icons` or vendored `BrandGlyph` objects rendered through `BrandIcon`.

The **views world** (`/projects/:projectId/views`, `src/features/custom-views/`)
renders a different sidebar inside the same shell and hosts:

- **UI service launchers** (`views-config.tsx` `UI_SERVICE_VIEWS`) — one tile
  per deployed instance exposing a URL (Airflow, JupyterHub, Superset + its SQL
  Lab, Spark History Server).
- **Built-in views** (`BUILT_IN_VIEWS`) — rich technology pages that don't fit
  the "one service, one instance list" shape: Spark Applications and the SQL
  Editor.
- **Custom views** — user-created launcher tiles, stored locally per project.

## SQL editor

`/projects/:projectId/views/sql-editor`
(`src/features/custom-views/sql-editor-page.tsx`) runs SQL on a deployed query
engine through the control plane's SQL proxy (`sql-api.ts`); the proxy forwards
the statement to the engine with the caller's bearer token. Engines are the
project's `trino` instances (`SQL_SERVICES`), fed from the shell's shared
`useViewServices` subscription via outlet context.

Mechanics worth knowing: the page state is remounted per project
(`key={projectId}`), so drafts/results can't leak across projects; the draft
persists per project in sessionStorage (swept on logout); in-flight queries are
aborted on unmount or engine switch (`AbortController` + supersede guard);
Ctrl/Cmd+Enter runs the query; engine-reported errors (`SqlQueryResult.error`)
render with line/column info, transport errors separately.

## Styling

- **Single CSS entry point** `src/styles.css`, which declares the cascade-layer
  order up front:
  `@layer theme, base, primereact, primereact-overrides, components, utilities;`
  This line is **load-bearing**: the PrimeReact theme ships inside
  `@layer primereact`, and without the declared order Tailwind v4 preflight (in
  `base`) would strip PrimeReact components bare. The app's PrimeReact re-skins
  live in `primereact-overrides`. Don't reorder or remove it; keep the import
  order intact.
- **Design tokens** are `--db-*` CSS variables in `src/styles/variables.css`
  (light values in `:root`, dark overrides in `body.dark-mode`), surfaced as
  Tailwind utilities via `@theme inline` (`text-fg`, `bg-surface`,
  `border-border-light`, radius/shadow scales…). **Prefer tokens over raw
  hex/px.**
- **Dark mode is class-based** (`body.dark-mode`), not media-query based,
  applied by an inline script in `index.html` **before first paint** to avoid a
  light flash. That script intentionally duplicates the key/resolution logic of
  `theme-context.tsx` — keep the two in sync.
- The brand font (DM Sans) is loaded via `<link>` tags in `index.html`, not a
  CSS `@import` (a remote `@import` after the Tailwind import gets stripped
  from the production bundle).
- PrimeReact 10 runs in styled mode (lara theme). Re-skins are per-component
  `.p-*` overrides in the `primereact-overrides` layer.

## Build, test & deployment

- **Dev server**: `npm start` → Vite on **port 4200**. The port is
  load-bearing: the OIDC redirect URIs registered with the IdP point at
  `localhost:4200`. Do not change it. Development talks to the control plane at
  `http://localhost:8093` with a sandbox OIDC authority
  (`src/config/environment.ts`, statically branched on `import.meta.env.PROD`).
- **Build**: `npm run build` = `tsc -b && vite build` → `dist/`. Strict TS with
  `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`;
  `vite.config.ts` is included in type-checking. The app version rendered in
  the footer comes from `package.json` via the `__APP_VERSION__` Vite define
  (declared in `src/vite-env.d.ts`). `npm run size-check` builds and then fails
  if a bundle exceeds the budgets in `scripts/check-bundle-size.mjs`.
- **Tests**: Vitest + Testing Library (`jsdom`), configured in
  `vite.config.ts`; tests are co-located `*.test.ts(x)`. External SDKs
  (e.g. `oidc-client-ts`) are mocked with `vi.hoisted` + `vi.mock` — see
  `src/core/auth/auth-context.test.tsx` for the pattern.
- **Docker** (`Dockerfile`): two-stage — `node:22-alpine` builds the bundle,
  `nginx:1.27-alpine` serves `dist/` on port 4200. `nginx.conf`: immutable
  caching for hashed `/assets/`, `no-cache` for `index.html` (so deploys are
  picked up), SPA fallback, and `/api/` answered with 404 — **an ingress in
  front of the container is expected to route `/api` to the control plane**.

## Directory layout

```
index.html               # SPA shell; pre-paint dark-mode script; font links
vite.config.ts           # Vite + React + Tailwind plugins; port 4200; Vitest; __APP_VERSION__
Dockerfile / nginx.conf  # two-stage build; nginx static serving on 4200
scripts/                 # check-bundle-size.mjs (npm run size-check)
src/
  main.tsx               # entry: StrictMode, createRoot, styles.css
  App.tsx                # provider tree, AuthGate, ScrollToTop
  app-routes.tsx         # route table, lazy pages, serviceRoutes() helper
  styles.css             # single CSS entry: layer order, theme mapping, overrides
  styles/variables.css   # --db-* design tokens (light + dark)
  config/environment.ts  # dev/prod switch (apiBaseUrl, OIDC)
  core/
    api/                 # http.ts, sse.ts, ui-cache.ts, domain clients (*-api.ts)
    auth/                # auth-context, auth-redirector, require-auth/admin
    context/             # project-context
    guards/              # project-route (ProjectRouteSync)
    hooks/               # use-live-services (REST + SSE instance hook),
                         # use-polled-resources (poll a list while any row is transient)
    models/              # service.model.ts, spark.model.ts
    preferences/         # localStorage-backed preference contexts
    services/            # logger.ts, project-colors.ts
    storage-keys.ts      # ALL web-storage keys
    theme/               # theme-context
  features/
    landing/ start/      # /login landing, /home entry
    admin/               # admin page, identity (users/groups), project list,
                         # connections (platform-wide external connections)
    custom-views/        # views world: launchers, SQL editor
    settings/            # global user settings
    project-console/     # console shell, nav-config, home dashboard,
                         # services (generic pages), spark, secret-stores,
                         # connections (external + internal tabs), settings
  shared/
    components/          # page-header, status-tag, empty-state, dynamic-schema-form,
                         # profile-list-editor, console-shell, brand-icon, …
    hooks/               # use-toast-messages, use-row-actions-menu
    utils/               # k8s-names
```

Conventions: feature code under `src/features/<area>/`, cross-cutting infra
under `src/core/`, reusable presentational pieces under
`src/shared/components/`. Use the `logger`, never `console`.

## Known limitations & open decisions

- **SSE streams are unauthenticated.** `EventSource` cannot send an
  `Authorization` header, so the live-list and log-follow streams hit the
  `/api/.../stream` endpoints without credentials while every REST call is
  bearer-protected. Closing this requires backend coordination (a short-lived
  stream ticket, or replacing `EventSource` with a fetch-based SSE reader once
  the control plane enforces auth on stream endpoints).
- **Production OIDC config is baked in at build time** and currently inherits
  the dev-sandbox authority (`https://kubauth.okdp.dev-sandbox`, client
  `okdp-app`). Any non-sandbox deployment needs either build-time
  `VITE_*` variables or a runtime `window.__ENV` injection (entrypoint-templated
  script in `index.html`) — to be decided.
- **Production API base path.** `environment.apiBaseUrl` is `/api` in
  production while every client appends `/api/...`, so requests leave the
  browser as `/api/api/...`. This assumes the fronting ingress strips the first
  `/api` prefix; if the ingress routes without a rewrite, `apiBaseUrl` should
  be `''` instead. Verify against the actual deployment.

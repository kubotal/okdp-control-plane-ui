import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { legacyRedirectRoutes } from './legacy-routes';
import { RequireAuth } from './core/auth/require-auth';
import { RequireAdmin } from './core/auth/require-admin';
import { RootRedirect } from './core/auth/auth-redirector';
import { ProjectRouteSync } from './core/guards/project-route';
import { useProjectContext } from './core/context/project-context';
// Type-only: a value import would statically pull the lazy()-split page module
// into the routes chunk and defeat the code split.
import type { ServicesPageProps } from './features/project-console/services/services-page';

/** /views convenience target: the views world lives under the project scope
 *  (/projects/:projectId/views) so deep links and project switching keep it. */
function ViewsRedirect() {
  const { currentProjectId } = useProjectContext();
  return (
    <Navigate to={currentProjectId ? `/projects/${currentProjectId}/views` : '/projects'} replace />
  );
}

const HomePage = lazy(() => import('./features/landing/home-page'));
const StartPage = lazy(() => import('./features/start/start-page'));
const ProjectList = lazy(() => import('./features/admin/projects/project-list'));
const SettingsPage = lazy(() => import('./features/settings/settings-page'));
const CustomViewsPage = lazy(() => import('./features/custom-views/custom-views-page'));
const AdminPage = lazy(() => import('./features/admin/admin-page'));
const IdentityPage = lazy(() => import('./features/admin/identity/identity-page'));
const CatalogPage = lazy(() => import('./features/admin/catalog/catalog-page'));
const ProjectPage = lazy(() => import('./features/project-console/project-page'));
const ProjectHome = lazy(() => import('./features/project-console/home/project-home'));
const SecretsPage = lazy(() => import('./features/project-console/secret-stores/secrets-page'));
const ConnectionsPage = lazy(() => import('./features/project-console/connections/connections-page'));
const ProjectSettingsPage = lazy(
  () => import('./features/project-console/settings/project-settings-page'),
);
const ServicesPage = lazy(() => import('./features/project-console/services/services-page'));
const ServiceDeployPage = lazy(
  () => import('./features/project-console/services/service-deploy-page'),
);
const ServiceEditPage = lazy(() => import('./features/project-console/services/service-edit-page'));
const ServiceDetailPage = lazy(
  () => import('./features/project-console/services/service-detail-page'),
);
const SparkAppsPage = lazy(() => import('./features/project-console/spark/spark-apps-page'));
const SparkSubmitPage = lazy(() => import('./features/project-console/spark/spark-submit-page'));
const SparkEditPage = lazy(() => import('./features/project-console/spark/spark-edit-page'));
const SparkDetailPage = lazy(() => import('./features/project-console/spark/spark-detail-page'));

/** Deploy / edit / detail / list route quadruple under a base path. The list
 *  pages share one component driven by per-route props (the Angular
 *  `route.data` equivalent). */
function serviceRoutes(basePath: string, data: ServicesPageProps) {
  return (
    <>
      <Route path={`${basePath}/deploy`} element={<ServiceDeployPage />} />
      <Route path={`${basePath}/:serviceName/edit`} element={<ServiceEditPage />} />
      <Route path={`${basePath}/:serviceName`} element={<ServiceDetailPage />} />
      <Route path={basePath} element={<ServicesPage {...data} />} />
    </>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* RootRedirect (not a plain /home Navigate) so a freshly restored
            deep link can't be clobbered in the same effect flush. */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<HomePage />} />
        {/* Authenticated entry point: default project, or getting started
            when the platform has no project yet. */}
        <Route
          path="/home"
          element={
            <RequireAuth>
              <StartPage />
            </RequireAuth>
          }
        />

        {/* Single console shell: the project pages, the shared project list
            and the admin-only identity page all render inside it. */}
        <Route
          element={
            <RequireAuth>
              <ProjectPage />
            </RequireAuth>
          }
        >
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />

          <Route
            path="/identity"
            element={
              <RequireAdmin>
                <IdentityPage />
              </RequireAdmin>
            }
          />

          <Route
            path="/catalog"
            element={
              <RequireAdmin>
                <CatalogPage />
              </RequireAdmin>
            }
          />

          <Route path="/settings" element={<SettingsPage />} />
          {/* Convenience entry point (user dropdown, old links): the views
              world is project-scoped — forward to the current project's. */}
          <Route path="/views" element={<ViewsRedirect />} />

          {/* REST-style: /projects is the collection, /projects/:projectId a member. */}
          <Route path="/projects">
            <Route index element={<ProjectList />} />
            <Route path=":projectId" element={<ProjectRouteSync />}>
              <Route index element={<ProjectHome />} />
              <Route path="secret-stores" element={<SecretsPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
              <Route path="settings" element={<ProjectSettingsPage />} />

              {/* Views world: the project's view launchers and the rich
                  technology views (Spark pages). Lives beside the console
                  pages under the same project scope, but renders the views
                  sidebar instead of the project tree. */}
              <Route path="views">
                <Route index element={<CustomViewsPage />} />
                <Route path="spark/applications/submit" element={<SparkSubmitPage />} />
                <Route path="spark/applications/:appName/edit" element={<SparkEditPage />} />
                <Route path="spark/applications/:appName" element={<SparkDetailPage />} />
                <Route path="spark/applications" element={<SparkAppsPage />} />
              </Route>

              {serviceRoutes('jupyterhub', {
                title: 'JupyterHub',
                deployLabel: 'Deploy',
                serviceFilter: 'jupyterhub',
                emptyMessage: 'No JupyterHub instances deployed yet.',
              })}

              {serviceRoutes('spark/history-server', {
                title: 'Spark History Server',
                deployLabel: 'Deploy',
                serviceFilter: 'spark-history-server',
                emptyMessage: 'No Spark History Server instances deployed yet.',
              })}

              {/* Services on the OKDP roadmap but not yet packaged. */}
              {/* Polaris (Lakehouse / data-catalog) — kubocd Package: polaris@0.1.0 */}
              {serviceRoutes('polaris', {
                title: 'Polaris',
                deployLabel: 'Deploy',
                serviceFilter: 'polaris',
                emptyMessage: 'No Polaris instances deployed yet.',
              })}

              {/* Trino (Lakehouse / data-querying) — kubocd Package: trino@0.1.0 */}
              {serviceRoutes('trino', {
                title: 'Trino',
                deployLabel: 'Deploy',
                serviceFilter: 'trino',
                emptyMessage: 'No Trino instances deployed yet.',
              })}

              {/* Airflow (Data Engineering / orchestration) — kubocd Package: airflow@0.1.0 */}
              {serviceRoutes('airflow', {
                title: 'Airflow',
                deployLabel: 'Deploy',
                serviceFilter: 'airflow',
                emptyMessage: 'No Airflow instances deployed yet.',
              })}

              {/* Superset (SQL & BI / data-visualization) — kubocd Package: superset@0.1.0 */}
              {serviceRoutes('superset', {
                title: 'Superset',
                deployLabel: 'Deploy',
                serviceFilter: 'superset',
                emptyMessage: 'No Superset instances deployed yet.',
              })}

              {/* Catalog-driven generic area: any exposed service without a
                  bespoke console area is reachable here (list / deploy /
                  detail). The service type comes from the :svcType param. */}
              {serviceRoutes('services/:svcType', {
                title: '',
                deployLabel: 'Deploy',
                serviceFilter: '',
                emptyMessage: 'No instances deployed yet.',
              })}
            </Route>
          </Route>
        </Route>

        {legacyRedirectRoutes()}

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}

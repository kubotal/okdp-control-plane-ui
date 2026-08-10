import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Toast } from 'primereact/toast';
import { projectApi, type Project } from '../../../core/api/project-api';
import { logger } from '../../../core/services/logger';
import { useAuth } from '../../../core/auth/auth-context';
import { useProjectContext } from '../../../core/context/project-context';
import {
  PROJECT_COLOR_PALETTE,
  clearProjectColor,
  getProjectColor,
  setProjectColor,
  useProjectColorsVersion,
} from '../../../core/services/project-colors';
import EmptyState from '../../../shared/components/empty-state';
import { PageHeader } from '../../../shared/components/page-header';
import MetricCell from '../../../shared/components/metric-cell';
import SearchFilter from '../../../shared/components/search-filter';
import type { MetricValue } from '../../../core/models/service.model';
import { formatCpuCores, formatMemoryBytes } from '../../project-console/services/service-utils';
import { useProjectStats, type ProjectStats } from './use-project-stats';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { DialogFooter } from '../../../shared/components/dialog-footer';

type ProjectRow = Project & { stats?: ProjectStats; color: string };

/** KPI cell: pulse while loading, em dash when the metric is unreported. */
function StatCell({
  stats,
  value,
}: {
  stats: ProjectStats | undefined;
  value: (stats: ProjectStats) => string | number | null;
}) {
  if (!stats || !stats.metricsLoaded) {
    return <div className="metric-bar h-[5px] w-[48px] animate-pulse"></div>;
  }
  const v = value(stats);
  return v === null ? (
    <span className="text-sm text-fg-muted">—</span>
  ) : (
    <span className="text-sm text-fg-secondary">{v}</span>
  );
}

/** Project roll-up shaped as a MetricValue for the shared MetricCell:
 *  null used = unreported (dash), null limit = unbounded ("no limit"). */
function rollupMetric(
  used: number | null,
  limit: number | null,
  format: (value: number) => string,
): MetricValue {
  if (used === null) {
    return { available: false, usedRaw: 0, limitRaw: 0, used: '', limit: '', pct: 0 };
  }
  const limitRaw = limit ?? 0;
  return {
    available: true,
    usedRaw: used,
    limitRaw,
    used: format(used),
    limit: format(limitRaw),
    pct: limitRaw > 0 ? used / limitRaw : 0,
  };
}

export default function ProjectList() {
  const auth = useAuth();
  const isAdmin = auth.isAdmin;
  // The projects list (REST snapshot + SSE merge) lives in ProjectContext —
  // the provider is always mounted above this page; no second subscription.
  const {
    currentProjectId,
    availableProjects: projects,
    isLoading,
    loadError,
    reload,
  } = useProjectContext();
  const { toast, showSuccess, showError } = useToastMessages();
  // Row dots follow color edits live (other tab, or Project Settings).
  const colorsVersion = useProjectColorsVersion();

  const [globalFilter, setGlobalFilter] = useState('');
  const [visible, setVisible] = useState(false);
  const [newProject, setNewProject] = useState<Project>({ name: '', description: '' });
  const [newColor, setNewColor] = useState<string>(PROJECT_COLOR_PALETTE[0]);

  // Watch-confirmed created/deleted toasts (covers other admins/tabs too):
  // diff against the previous snapshot. The ref is seeded from the first
  // loaded list — and re-seeded after a reload() — so an initial population
  // never produces spurious "created" toasts.
  const prevProjectsRef = useRef<Project[] | null>(null);
  useEffect(() => {
    if (isLoading || loadError) {
      prevProjectsRef.current = null;
      return;
    }
    const prev = prevProjectsRef.current;
    prevProjectsRef.current = projects;
    if (!prev) return;
    for (const p of projects) {
      if (!prev.some((q) => q.name === p.name)) showSuccess(`Project ${p.name} created`);
    }
    for (const p of prev) {
      if (!projects.some((q) => q.name === p.name)) {
        showSuccess(`Project ${p.name} deleted`);
        clearProjectColor(p.name);
      }
    }
  }, [projects, isLoading, loadError, showSuccess]);

  const showDialog = () => {
    setNewProject({ name: '', description: '' });
    setNewColor(PROJECT_COLOR_PALETTE[0]);
    setVisible(true);
  };

  const createProject = () => {
    // Store the color before the request: the watch ADDED event often beats
    // the HTTP response, and the new row must not flash the fallback color.
    setProjectColor(newProject.name, newColor);
    projectApi
      .createProject(newProject)
      .then(() => setVisible(false))
      .catch((err) => {
        clearProjectColor(newProject.name);
        showError('Failed to create project');
        logger.error('Failed to create project', err);
      });
  };

  const dialogFooter = (
    <DialogFooter
      onCancel={() => setVisible(false)}
      onConfirm={createProject}
      confirmLabel="Create"
      confirmDisabled={!newProject.name}
    />
  );

  // Four distinct states: loading (placeholder), error (panel + retry),
  // empty (getting-started wizard), populated (filter + table). The wizard
  // must never flash while the list is still loading or failed to load.
  // The context's SSE stream runs in parallel with its snapshot fetch, so a
  // failed fetch may coexist with a populated list: error only while empty.
  const showLoadError = loadError && projects.length === 0;
  const empty = !isLoading && !loadError && projects.length === 0;
  const populated = !isLoading && projects.length > 0;

  const projectStats = useProjectStats(projects.map((p) => p.name));

  // DataTable deep-compares `value` to decide whether to repaint: anything a
  // cell renders (KPI aggregates, the color dot) must be part of the row
  // objects, or edits to it are invisible to the table.
  const rows = useMemo<ProjectRow[]>(
    () =>
      projects.map((p) => ({ ...p, stats: projectStats[p.name], color: getProjectColor(p.name) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colorsVersion re-reads the colors
    [projects, projectStats, colorsVersion],
  );

  return (
    <div>
      {/* Top Bar: Title (Left) | Create Button (Right), vertically aligned */}
      <PageHeader
        title="Projects"
        actions={
          isAdmin &&
          populated && (
            <button className="create-btn" onClick={showDialog}>
              <i className="pi pi-plus"></i>
              <span>Create project</span>
            </button>
          )
        }
      />

      {isLoading ? (
        /* Loading: same centered geometry as the wizard, so an empty result
           settles into the wizard without layout shift. */
        <EmptyState
          icon="pi pi-spin pi-spinner"
          title="Loading projects…"
          description="Fetching the project list."
        />
      ) : showLoadError ? (
        <EmptyState
          icon="pi pi-exclamation-triangle"
          title="Failed to load projects"
          description="The project list could not be retrieved. Check your connection and try again."
          action={
            <button className="btn-secondary mt-3" onClick={reload}>
              <i className="pi pi-refresh"></i>
              <span>Retry</span>
            </button>
          }
        />
      ) : empty ? (
        /* Getting started: the platform has no project yet. */
        <EmptyState
          icon="pi pi-sparkles"
          title="Welcome to OKDP"
          description={
            isAdmin
              ? 'There is no project on this platform yet. Create your first project to get started.'
              : 'There is no project you can access yet. Ask your platform administrator to create one and grant you access.'
          }
          action={
            isAdmin && (
              <Button
                label="Create your first project"
                icon="pi pi-plus"
                onClick={showDialog}
                className="create-btn mt-3"
              />
            )
          }
        />
      ) : (
        <>
          <SearchFilter
            value={globalFilter}
            onChange={setGlobalFilter}
            placeholder="Filter projects..."
          />

          {/* Data Table */}
          <div className="table-wrapper">
            <DataTable
              value={rows}
              dataKey="name"
              globalFilter={globalFilter}
              globalFilterFields={['name', 'description']}
              className="minimal-table"
              emptyMessage="No projects found."
              rowClassName={() => 'workspace-row'}
            >
              <Column
                header="Name"
                field="name"
                style={{ width: '26%' }}
                body={(project: ProjectRow) => (
                  <span className="flex items-center gap-2">
                    <Link
                      to={`/projects/${project.name}`}
                      className="flex items-center gap-2 text-lg font-semibold text-fg no-underline transition-colors duration-150 ease-smooth hover:text-primary hover:underline"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: project.color }}
                      ></span>
                      {project.name}
                    </Link>
                    {project.name === currentProjectId && (
                      <span
                        className="rounded-full border border-(--db-primary-200) bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary"
                        title="The project currently open in the console"
                      >
                        Current
                      </span>
                    )}
                  </span>
                )}
              />
              <Column
                header="Description"
                field="description"
                style={{ width: '30%' }}
                body={(project: Project) => project.description || '-'}
              />
              <Column
                header="Instances"
                style={{ width: '8%' }}
                body={(project: ProjectRow) => (
                  <StatCell stats={project.stats} value={(s) => s.instances} />
                )}
              />
              <Column
                header="CPU"
                style={{ width: '18%' }}
                body={(project: ProjectRow) => (
                  <MetricCell
                    metric={
                      project.stats?.metricsLoaded
                        ? rollupMetric(
                            project.stats.cpuUsed,
                            project.stats.cpuLimit,
                            formatCpuCores,
                          )
                        : undefined
                    }
                  />
                )}
              />
              <Column
                header="Memory"
                style={{ width: '18%' }}
                body={(project: ProjectRow) => (
                  <MetricCell
                    metric={
                      project.stats?.metricsLoaded
                        ? rollupMetric(
                            project.stats.memUsed,
                            project.stats.memLimit,
                            formatMemoryBytes,
                          )
                        : undefined
                    }
                  />
                )}
              />
            </DataTable>
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog
        header="Create new project"
        visible={visible}
        modal
        draggable={false}
        resizable={false}
        style={{ width: '600px' }}
        className="db-dialog"
        closable
        onHide={() => setVisible(false)}
        footer={dialogFooter}
      >
        <div className="dialog-content">
          <div className="field">
            <label htmlFor="name">Project name</label>
            <InputText
              id="name"
              value={newProject.name}
              onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
              className="w-full dialog-input"
              placeholder="e.g., analytics-prod"
            />
          </div>

          <div className="field">
            <label htmlFor="description">
              Description <span className="optional">(optional)</span>
            </label>
            <InputTextarea
              id="description"
              value={newProject.description}
              onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
              rows={5}
              className="w-full dialog-input"
              placeholder="Briefly describe the purpose of this project..."
            />
          </div>

          <div className="field">
            <label id="project-color-label">
              Color <span className="optional">(only visible to you)</span>
            </label>
            <div
              className="flex items-center gap-2"
              role="radiogroup"
              aria-labelledby="project-color-label"
            >
              {PROJECT_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={newColor === color}
                  aria-label={`Project color ${color}`}
                  className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform duration-150 ease-smooth hover:scale-110 ${
                    newColor === color
                      ? 'border-fg ring-2 ring-(--db-primary-200)'
                      : 'border-transparent'
                  }`}
                  style={{ background: color }}
                  onClick={() => setNewColor(color)}
                ></button>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Toast ref={toast} position="bottom-right" />
    </div>
  );
}

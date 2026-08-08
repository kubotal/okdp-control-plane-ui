import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Toast } from 'primereact/toast';
import DeleteConfirmDialog from '../../../shared/components/delete-confirm-dialog';
import EmptyState from '../../../shared/components/empty-state';
import { serviceApi } from '../../../core/api/service-api';
import type { Pod, ServiceInstance, ServiceMetrics } from '../../../core/models/service.model';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { PodList } from './pod-list';
import { PodLogViewer } from './pod-log-viewer';
import {
  apiErrorMessage,
  areaBasePath,
  formatMediumDateTime,
  isTransitioning,
  openInNewTab,
  parentLabel,
  statusTone,
} from './service-utils';
import { StatusTag } from '../../../shared/components/status-tag';

type Tab = 'overview' | 'pods' | 'logs' | 'parameters';

const TABS: Tab[] = ['overview', 'pods', 'logs', 'parameters'];

interface ResourceUsage {
  used: string;
  limit: string;
  pct: number;
  pctLabel: string;
  unbounded: boolean;
}

function resourceUsage(metrics: ServiceMetrics | null, kind: 'cpu' | 'memory'): ResourceUsage {
  if (!metrics) {
    return { used: '—', limit: '—', pct: 0, pctLabel: '—', unbounded: false };
  }
  const v = kind === 'cpu' ? metrics.cpu : metrics.memory;
  const hasLimit = v.limitRaw > 0;
  return {
    used: v.available ? v.used : '—',
    limit: hasLimit ? v.limit : '—',
    pct: v.pct,
    pctLabel: hasLimit ? `${Math.round(v.pct * 100)}%` : '',
    unbounded: v.available && !hasLimit,
  };
}

function MetricCard({
  label,
  usage,
  unit,
}: {
  label: string;
  usage: ResourceUsage;
  unit?: string;
}) {
  return (
    <div className={`metric${usage.unbounded ? ' unbounded' : ''}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        {!usage.unbounded && (
          <span className="metric-unit">
            <span className="metric-used">{usage.used}</span>
            <span className="metric-sep">/</span>
            <span>
              {usage.limit}
              {unit ? ` ${unit}` : ''}
            </span>
          </span>
        )}
      </div>
      {usage.unbounded ? (
        <div className="metric-value">
          <span className="metric-value-big">{usage.used}</span>
          {unit && <span className="muted-text small">{unit}</span>}
          <span className="metric-hint" style={{ marginLeft: 'auto' }}>
            No limit set
          </span>
        </div>
      ) : (
        <>
          <div className="metric-bar">
            <div
              className={[
                'metric-fill',
                usage.pct > 0.6 && usage.pct <= 0.8 ? 'tone-warn' : '',
                usage.pct > 0.8 ? 'tone-danger' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ width: `${usage.pct * 100}%` }}
            ></div>
          </div>
          <div className="metric-pct">{usage.pctLabel}</div>
        </>
      )}
    </div>
  );
}

export default function ServiceDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId = '', serviceName = '' } = useParams<{
    projectId: string;
    serviceName: string;
  }>();
  const [searchParams] = useSearchParams();
  const { toast, showSuccess, showError } = useToastMessages();
  // Stale-response guard: only the latest loadAll call may commit state
  // (params can change mid-flight when navigating between instances).
  const reqIdRef = useRef(0);

  const [instance, setInstance] = useState<ServiceInstance | null>(null);
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  // Type-to-confirm deletion dialog visibility.
  const [deleteVisible, setDeleteVisible] = useState(false);

  const runningPods = useMemo(
    () => pods.filter((p) => p.status === 'Running' || p.status === 'Ready').length,
    [pods],
  );

  const paramEntries = useMemo(() => {
    const params = instance?.parameters || {};
    const entries: { key: string; value: string }[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (k === 'profiles') continue;
      entries.push({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) });
    }
    return entries;
  }, [instance]);

  const cpuUsage = resourceUsage(metrics, 'cpu');
  const memUsage = resourceUsage(metrics, 'memory');

  const loadAll = useCallback(() => {
    const reqId = ++reqIdRef.current;
    if (!projectId || !serviceName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      serviceApi.getService(projectId, serviceName),
      serviceApi.getPods(projectId, serviceName),
    ])
      .then(([inst, podList]) => {
        if (reqId !== reqIdRef.current) return;
        setInstance(inst);
        setPods(podList);
        setLoading(false);
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return;
        showError('Failed to load instance details');
        setLoading(false);
      });
  }, [projectId, serviceName, showError]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Metrics: fetch immediately then every 10s.
  useEffect(() => {
    if (!projectId || !serviceName) return;
    let cancelled = false;
    const fetchMetrics = () => {
      serviceApi
        .getServiceMetrics(projectId, serviceName)
        .then((m) => {
          if (!cancelled) setMetrics(m);
        })
        .catch(() => {
          // Leave metrics as null; UI falls back to "—".
        });
    };
    fetchMetrics();
    const id = setInterval(fetchMetrics, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, serviceName]);

  // Navigation stays inside the instance's own console area (e.g. a Trino
  // instance edits/returns under /trino, not /services).
  const basePath = areaBasePath(instance?.service).join('/');

  const goBack = () => {
    if (!projectId) return;
    const returnTo = searchParams.get('returnTo');
    if (returnTo) {
      navigate(returnTo);
    } else {
      navigate(`/projects/${projectId}/${basePath}`);
    }
  };

  const openExternal = () => {
    const url = instance?.url;
    if (url) openInNewTab(url);
  };

  const editInstance = () => {
    if (projectId) {
      const returnTo = encodeURIComponent(location.pathname + location.search);
      navigate(`/projects/${projectId}/${basePath}/${serviceName}/edit?returnTo=${returnTo}`);
    }
  };

  const confirmDelete = () => {
    if (instance) setDeleteVisible(true);
  };

  const deleteInstance = () => {
    setDeleteVisible(false);
    if (!instance) return;
    serviceApi
      .deleteService(projectId, instance.name)
      .then(() => {
        showSuccess(`"${instance.name}" has been removed`, 'Instance deleted');
        goBack();
      })
      .catch((err) => {
        showError(apiErrorMessage(err, 'Failed to delete instance'));
      });
  };

  const onViewLogs = (pod: Pod) => {
    setSelectedPod(pod);
    setTab('logs');
  };

  const tabLabel = (t: Tab) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <>
      <Toast ref={toast} />
      <DeleteConfirmDialog
        resourceName={deleteVisible ? (instance?.name ?? null) : null}
        resourceKind="instance"
        message={
          instance && (
            <>
              This will remove <strong>{instance.name}</strong>, its pods, and the volumes it
              created for its users, notebook home directories included. This cannot be undone.
            </>
          )
        }
        onHide={() => setDeleteVisible(false)}
        onConfirm={deleteInstance}
      />

      <div className="detail-page animate-in">
        <div className="page-header">
          <nav className="breadcrumb">
            <a
              className="breadcrumb-link"
              onClick={goBack}
              onKeyDown={(e) => e.key === 'Enter' && goBack()}
              tabIndex={0}
            >
              <i className="pi pi-arrow-left text-[11px]"></i>
              {parentLabel(instance?.service)}
            </a>
            <i className="pi pi-angle-right text-[10px] text-fg-muted"></i>
            <span className="breadcrumb-current">{instance?.name || serviceName}</span>
          </nav>

          {instance && (
            <div className="header-row">
              <div className="header-badge">
                <i className="pi pi-server"></i>
              </div>
              <div className="header-text">
                <div className="header-title-row">
                  <h2>{instance.name}</h2>
                  <StatusTag
                    value={instance.status}
                    tone={statusTone(instance.status)}
                    pulse={isTransitioning(instance.status)}
                  />
                </div>
                <p className="page-desc">
                  {instance.service} · <span className="mono">{instance.serviceTag}</span>
                </p>
              </div>
              <div className="header-actions">
                {instance.url && (
                  <button
                    className="btn-secondary"
                    disabled={instance.status !== 'Ready'}
                    onClick={openExternal}
                  >
                    <i className="pi pi-external-link"></i>
                    Open
                  </button>
                )}
                <button className="btn-secondary" onClick={loadAll}>
                  <i className="pi pi-refresh"></i>
                  Refresh
                </button>
                <button className="btn-secondary" onClick={editInstance}>
                  <i className="pi pi-pencil"></i>
                  Edit
                </button>
                <button className="btn-secondary danger" onClick={confirmDelete}>
                  <i className="pi pi-trash"></i>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <EmptyState
            variant="panel"
            icon="pi pi-spin pi-spinner"
            title="Loading instance details…"
          />
        ) : instance ? (
          <>
            <div className="okdp-tabs">
              {TABS.map((t) => (
                <button
                  key={t}
                  className={`okdp-tab${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {tabLabel(t)}
                  {t === 'pods' && <span className="tab-count">{pods.length}</span>}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="detail-content">
                {instance.status === 'Error' && (
                  <div className="alert alert-danger">
                    <i className="pi pi-exclamation-circle"></i>
                    <div>
                      <strong>Instance failed to start</strong>
                      {instance.statusMessage ? (
                        <p className="mono">{instance.statusMessage}</p>
                      ) : (
                        <p className="mono">Check the pod logs for the underlying error.</p>
                      )}
                    </div>
                  </div>
                )}
                {instance.status === 'Updating' && (
                  <div className="alert alert-warn">
                    <i className="pi pi-spin pi-spinner"></i>
                    <div>
                      <strong>Updating…</strong>
                      {instance.statusMessage ? (
                        <p className="mono">{instance.statusMessage}</p>
                      ) : (
                        <p>KuboCD is rolling out the new configuration.</p>
                      )}
                    </div>
                  </div>
                )}
                {instance.status === 'Installing' && (
                  <div className="alert alert-warn">
                    <i className="pi pi-spin pi-spinner"></i>
                    <div>
                      <strong>Installing…</strong>
                      {instance.statusMessage ? (
                        <p className="mono">{instance.statusMessage}</p>
                      ) : (
                        <p>Pulling image and scheduling pod. This usually takes ~30s.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="info-card">
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Instance name</span>
                      <span className="info-value">{instance.name}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Release</span>
                      <span className="info-value mono">{instance.releaseName}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Namespace</span>
                      <span className="info-value mono">{instance.targetNamespace}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Service</span>
                      <span className="info-value">{instance.service}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Version</span>
                      <span className="info-value mono">{instance.serviceTag}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Created</span>
                      <span className="info-value">
                        {instance.createdAt ? formatMediumDateTime(instance.createdAt) : '—'}
                      </span>
                    </div>
                    {instance.url && (
                      <div className="info-item info-item-wide">
                        <span className="info-label">URL</span>
                        <a
                          className="info-link mono"
                          href={instance.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {instance.url}
                          <i className="pi pi-external-link text-[11px]"></i>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <div className="section-icon-badge chart">
                      <i className="pi pi-chart-bar"></i>
                    </div>
                    <h3 className="section-title">Resource usage</h3>
                    <span className="muted-text small">Last 5 min</span>
                  </div>
                  <div className="metric-grid">
                    <MetricCard label="CPU" usage={cpuUsage} unit="cores" />
                    <MetricCard label="Memory" usage={memUsage} />
                  </div>
                </div>

                {/* What the service actually runs against. The page showed the
                    parameters it was deployed with, never the connections the
                    controller resolved, so "which database is my Superset on"
                    had no answer here. An unresolved one is the case a reader
                    opens this page for, so it is listed too. */}
                {instance.connections && instance.connections.length > 0 && (
                  <div className="section-card">
                    <div className="section-header">
                      <div className="section-icon-badge">
                        <i className="pi pi-link"></i>
                      </div>
                      <h3 className="section-title">Connections</h3>
                    </div>
                    <ul className="reset-list">
                      {instance.connections.map((connection) => (
                        <li
                          key={`${connection.kind}/${connection.namespace ?? ''}/${connection.name}`}
                          className="flex items-center gap-2 py-1.5 text-[13px]"
                        >
                          <span className="mono flex-1 break-all">{connection.name}</span>
                          {connection.kind === 'ClusterConnection' && (
                            <span className="muted-text small">platform</span>
                          )}
                          <StatusTag
                            value={connection.resolved ? 'Resolved' : 'Waiting'}
                            tone={connection.resolved ? 'success' : 'warning'}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="section-card">
                  <div className="section-header">
                    <div className="section-icon-badge">
                      <i className="pi pi-box"></i>
                    </div>
                    <h3 className="section-title">Pods</h3>
                    <span className="muted-text small">
                      {runningPods} / {pods.length} running
                    </span>
                  </div>
                  <PodList pods={pods} onViewLogs={onViewLogs} />
                </div>
              </div>
            )}

            {tab === 'pods' && (
              <div className="section-card">
                <PodList pods={pods} onViewLogs={onViewLogs} />
              </div>
            )}

            {tab === 'logs' &&
              (pods.length > 0 ? (
                <PodLogViewer
                  projectId={projectId}
                  serviceName={serviceName}
                  pods={pods}
                  initialPodName={selectedPod?.name}
                />
              ) : (
                <div className="section-card">
                  <div className="section-header">
                    <div className="section-icon-badge">
                      <i className="pi pi-file"></i>
                    </div>
                    <h3 className="section-title">Logs</h3>
                  </div>
                  <p className="muted-text" style={{ padding: '12px 0 0' }}>
                    No pods available yet. Logs will appear here once the service is running.
                  </p>
                </div>
              ))}

            {tab === 'parameters' && (
              <div className="section-card">
                {paramEntries.length > 0 ? (
                  <div className="param-list">
                    {paramEntries.map((param) => (
                      <div key={param.key} className="param-row">
                        <span className="param-key mono">{param.key}</span>
                        <span className="param-value mono">{param.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-text">No parameters set on this instance.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            variant="panel"
            icon="pi pi-exclamation-triangle"
            title="Instance not found"
            description="The service instance could not be loaded."
            action={
              <button className="btn-secondary" onClick={goBack}>
                <i className="pi pi-arrow-left"></i>
                Back to instances
              </button>
            }
          />
        )}
      </div>
    </>
  );
}

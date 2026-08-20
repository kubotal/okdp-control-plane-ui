import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { ServiceInstance, ServiceMetrics } from '../../../core/models/service.model';
import MetricCell from '../../../shared/components/metric-cell';
import { areaBasePath, isTransitioning, parentLabel, statusTone } from '../services/service-utils';
import { StatusTag } from '../../../shared/components/status-tag';
import type { ProjectServicesSummary } from './use-project-services-summary';

type SummaryRow = ServiceInstance & { metrics?: ServiceMetrics };

/** Overview summary of every service instance deployed in the project:
 *  live status (SSE), resource usage and a link to the detail page. */
export default function DeployedServicesSummary({
  projectId,
  summary,
}: {
  projectId: string;
  summary: ProjectServicesSummary;
}) {
  const { instances, metrics, loaded } = summary;

  // DataTable memoizes its rows against `value`: metrics must be part of
  // the row objects, or cells would not refresh when they arrive.
  const rows = useMemo<SummaryRow[]>(
    () => instances.map((svc) => ({ ...svc, metrics: metrics[svc.name] })),
    [instances, metrics],
  );

  if (!loaded) {
    return (
      <div className="flex items-center gap-3 py-2">
        <i className="pi pi-spin pi-spinner text-[18px] text-primary"></i>
        <div>
          <strong className="text-fg">Loading deployed services…</strong>
          <div className="text-sm text-fg-muted">Fetching service instances and metrics.</div>
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return <p className="m-0 text-base text-fg-muted">No services deployed in this project yet.</p>;
  }

  return (
    <div className="table-wrapper">
      <DataTable paginator rows={25} paginatorTemplate="PrevPageLink PageLinks NextPageLink" alwaysShowPaginator={false} value={rows} dataKey="name" className="minimal-table">
        <Column
          header="Instance"
          field="name"
          body={(svc: SummaryRow) => (
            <Link
              to={`/projects/${projectId}/${areaBasePath(svc.service).join('/')}/${svc.name}`}
              className="font-medium text-fg no-underline transition-colors duration-150 ease-smooth hover:text-primary hover:underline"
            >
              {svc.name}
            </Link>
          )}
        />
        <Column
          header="Service"
          body={(svc: SummaryRow) => (
            <span className="text-fg-secondary">
              {parentLabel(svc.service)}
              <span className="ml-1.5 text-sm text-fg-muted">{svc.serviceTag}</span>
            </span>
          )}
        />
        <Column
          header="Status"
          body={(svc: SummaryRow) => (
            <StatusTag
              value={svc.status}
              tone={statusTone(svc.status)}
              pulse={isTransitioning(svc.status)}
              title={svc.statusMessage}
            />
          )}
        />
        <Column header="CPU" body={(svc: SummaryRow) => <MetricCell metric={svc.metrics?.cpu} />} />
        <Column
          header="Memory"
          body={(svc: SummaryRow) => <MetricCell metric={svc.metrics?.memory} />}
        />
      </DataTable>
    </div>
  );
}

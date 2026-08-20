import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { connectionApi, type InternalConnection } from '../../../core/api/connection-api';
import { formatMediumDateTime } from '../services/service-utils';
import { connectionStatusTone } from './connection-status';
import { StatusTag } from '../../../shared/components/status-tag';
import { usePolledResources } from '../../../shared/hooks/use-polled-resources';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { ConnectionDetailDialog } from './connection-detail-dialog';

const isConnectionChanged = (incoming: InternalConnection, current: InternalConnection) =>
  incoming.name !== current.name ||
  incoming.status !== current.status ||
  incoming.managed !== current.managed;

/** Connections provided by the services already deployed in the project: a
 *  Trino a project's Airflow can query, for instance. They are not editable
 *  here: they exist because the service exists, and disappear with it. */
export function InternalConnectionList() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError } = useToastMessages();
  const [globalFilter, setGlobalFilter] = useState('');

  const { items: connections, loading } = usePolledResources(
    projectId,
    connectionApi.listInternal,
    isConnectionChanged,
    useCallback(() => showError('Failed to load internal connections'), [showError]),
  );

  const [detail, setDetail] = useState<InternalConnection | null>(null);

  const onCopied = (what: string) =>
    what ? showSuccess(`Copied ${what}`) : showError('Could not copy to the clipboard');

  return (
    <div>
      <Toast ref={toast} position="bottom-right" />

      <PageHeader title="Internal connections" />

      <p className="mb-4 text-[13px] text-fg-secondary">
        Connections published by the services deployed in this project. Pick one when deploying a
        service that needs it: the controller wires it, nothing has to be copied by hand. A service
        that publishes no connection does not appear here.
      </p>

      <SearchFilter
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Filter connections..."
      />

      <div className="table-wrapper">
        <DataTable paginator rows={25} paginatorTemplate="PrevPageLink PageLinks NextPageLink" alwaysShowPaginator={false}
          value={connections}
          loading={loading}
          globalFilter={globalFilter}
          globalFilterFields={['name', 'type', 'typeDisplay', 'service', 'status']}
          className="minimal-table"
          dataKey="name"
          rowClassName={() => 'cluster-row cursor-pointer'}
          onRowClick={(event) => setDetail(event.data as InternalConnection)}
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-8 text-[14px] text-fg-secondary">
              <i className="pi pi-sitemap text-[1.2rem] opacity-50"></i>
              <span>
                No service in this project exposes a connection yet. Deploy one, a Trino for
                instance, and it will appear here.
              </span>
            </div>
          }
        >
          <Column
            header="Name"
            field="name"
            style={{ width: '22%' }}
            body={(connection: InternalConnection) => (
              <span className="font-medium">{connection.name}</span>
            )}
          />
          <Column
            header="Type"
            field="typeDisplay"
            style={{ width: '14%' }}
            body={(connection: InternalConnection) => (
              <span className="inline-flex items-center gap-1.5 rounded-xs border border-border-light bg-surface-secondary px-2 py-[3px] text-[12px] font-medium text-fg-secondary">
                <i className={`${connection.icon || 'pi pi-link'} text-[11px]`}></i>
                {connection.typeDisplay || connection.type}
              </span>
            )}
          />
          <Column
            header="Provided by"
            field="service"
            style={{ width: '14%' }}
            className="text-[13px] text-fg-secondary"
            body={(connection: InternalConnection) =>
              // A managed connection published by a release carries no service
              // label; the release name is the honest answer.
              connection.service || connection.releaseName || '-'
            }
          />
          <Column
            header="Status"
            field="status"
            style={{ width: '10%' }}
            body={(connection: InternalConnection) => (
              <StatusTag
                value={connection.status}
                tone={connectionStatusTone(connection.status)}
                pulse={connection.status === 'Installing'}
              />
            )}
          />
          <Column
            header="Created"
            style={{ width: '14%' }}
            className="text-[13px] whitespace-nowrap text-fg-secondary"
            body={(connection: InternalConnection) =>
              connection.createdAt ? formatMediumDateTime(connection.createdAt) : '-'
            }
          />
        </DataTable>
      </div>

      <ConnectionDetailDialog
        detail={
          detail && {
            name: detail.name,
            typeDisplay: detail.typeDisplay || detail.type,
            icon: detail.icon,
            description: `Provided by ${detail.service || detail.releaseName} in this project.`,
            status: detail.status,
            namespace: detail.namespace,
            values: detail.values,
          }
        }
        visible={detail !== null}
        onHide={() => setDetail(null)}
        onCopied={onCopied}
      />
    </div>
  );
}

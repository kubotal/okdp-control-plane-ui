import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { connectionApi, type InternalConnection } from '../../../core/api/connection-api';
import { formatMediumDateTime } from '../services/service-utils';
import { connectionStatusTone } from './connection-status';
import { StatusTag } from '../../../shared/components/status-tag';
import { usePolledResources } from '../../../shared/hooks/use-polled-resources';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';

const isConnectionChanged = (incoming: InternalConnection, current: InternalConnection) =>
  incoming.name !== current.name ||
  incoming.status !== current.status ||
  incoming.endpoint !== current.endpoint ||
  incoming.managed !== current.managed;

/** Connections provided by the services already deployed in the project — a
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

  const copyEndpoint = (connection: InternalConnection) => {
    navigator.clipboard
      .writeText(connection.endpoint)
      .then(() => showSuccess(`Copied ${connection.endpoint}`))
      .catch(() => showError('Could not copy the endpoint to the clipboard'));
  };

  return (
    <div>
      <Toast ref={toast} position="bottom-right" />

      <PageHeader title="Internal connections" />

      <p className="mb-4 text-[13px] text-fg-secondary">
        Endpoints exposed by the services deployed in this project. Use them to connect another
        service of the project — an Airflow DAG to this project&apos;s Trino, for example.
      </p>

      <SearchFilter
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Filter connections..."
      />

      <div className="table-wrapper">
        <DataTable
          value={connections}
          loading={loading}
          globalFilter={globalFilter}
          globalFilterFields={['name', 'type', 'typeDisplay', 'service', 'endpoint', 'status']}
          className="minimal-table"
          dataKey="name"
          rowClassName={() => 'cluster-row'}
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-8 text-[14px] text-fg-secondary">
              <i className="pi pi-sitemap text-[1.2rem] opacity-50"></i>
              <span>
                No service in this project exposes a connection yet. Deploy one — a Trino, for
                instance — and it will appear here.
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
            body={(connection: InternalConnection) => connection.service || '-'}
          />
          <Column
            header="Endpoint"
            style={{ width: '26%' }}
            className="max-w-0 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-fg-secondary mono"
            body={(connection: InternalConnection) =>
              connection.endpoint ? (
                <span title={connection.endpoint}>{connection.endpoint}</span>
              ) : (
                // Nothing backs the service yet, so there is no address to
                // show; inventing one would send consumers nowhere.
                <span className="italic opacity-70">not available yet</span>
              )
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
          <Column
            style={{ width: '8%', textAlign: 'right' }}
            body={(connection: InternalConnection) => (
              <div className="actions">
                <Button
                  icon="pi pi-copy"
                  text
                  rounded
                  disabled={!connection.endpoint}
                  onClick={() => copyEndpoint(connection)}
                  title="Copy endpoint"
                  aria-label={`Copy the endpoint of ${connection.name}`}
                />
              </div>
            )}
          />
        </DataTable>
      </div>
    </div>
  );
}

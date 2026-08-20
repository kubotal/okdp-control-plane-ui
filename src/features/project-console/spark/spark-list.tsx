import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { sparkApi } from '../../../core/api/spark-api';
import { applyListEvent } from '../../../core/api/sse';
import type { SparkAppInstance, SparkUIInfo } from '../../../core/models/spark.model';
import { apiErrorMessage, formatMediumDate, openInNewTab } from '../services/service-utils';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { StatusTag } from '../../../shared/components/status-tag';
import { getStatusTone, isTerminalStatus } from './spark-utils';
import SearchFilter from '../../../shared/components/search-filter';
import DeleteConfirmDialog from '../../../shared/components/delete-confirm-dialog';

function shortenImage(image: string): string {
  if (!image) return '';
  const parts = image.split('/');
  return parts[parts.length - 1];
}

export function SparkList() {
  const navigate = useNavigate();
  const { projectId: projectName } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError, showWarn } = useToastMessages();

  const [apps, setApps] = useState<SparkAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SparkAppInstance | null>(null);

  useEffect(() => {
    if (!projectName) return;

    let cancelled = false;
    setLoading(true);
    sparkApi
      .listApps(projectName)
      .then((data) => {
        if (cancelled) return;
        setApps(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        showError('Failed to load Spark jobs');
        setLoading(false);
      });

    const unsubscribe = sparkApi.subscribeApps(projectName, {
      next: (event) => setApps((current) => applyListEvent(current, event, (a) => a.name)),
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectName, showError]);

  const viewDetail = (app: SparkAppInstance) => {
    if (projectName) {
      navigate(`/projects/${projectName}/views/spark/applications/${app.name}`);
    }
  };

  const confirmDelete = (app: SparkAppInstance) => setDeleteTarget(app);

  const deleteApp = (app: SparkAppInstance) => {
    if (!projectName) return;
    sparkApi
      .deleteApp(projectName, app.name)
      .then(() => {
        showSuccess(`Spark job "${app.name}" has been removed`, 'Deleted');
        setApps((current) => current.filter((a) => a.name !== app.name));
      })
      .catch((err) => {
        showError(apiErrorMessage(err, 'Failed to delete Spark job'));
      });
  };

  const openSparkLink = (app: SparkAppInstance, field: keyof SparkUIInfo, warnTitle: string) => {
    if (!projectName) return;
    sparkApi
      .getSparkUI(projectName, app.name)
      .then((info) => {
        const url = info[field] as string;
        if (url) {
          openInNewTab(url);
        } else {
          showWarn('URL not available.', warnTitle);
        }
      })
      .catch(() => {
        showError('Failed to retrieve Spark UI info');
      });
  };

  return (
    <div>
      <Toast ref={toast} />
      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="Spark job"
        onHide={() => setDeleteTarget(null)}
        onConfirm={(name) => {
          if (deleteTarget?.name === name) deleteApp(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <SearchFilter value={globalFilter} onChange={setGlobalFilter} placeholder="Filter jobs..." />

      <div className="table-wrapper">
        <DataTable paginator rows={25} paginatorTemplate="PrevPageLink PageLinks NextPageLink" alwaysShowPaginator={false}
          value={apps}
          loading={loading}
          rowHover
          globalFilter={globalFilter}
          globalFilterFields={['name', 'type', 'status', 'image']}
          className="minimal-table"
          dataKey="name"
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-7 text-[14px] text-fg-secondary">
              <i className="pi pi-bolt text-[1.2rem] opacity-50"></i>
              No Spark jobs found. Click <strong>Submit job</strong> to run your first Spark
              application.
            </div>
          }
        >
          <Column
            header="Name"
            field="name"
            style={{ width: '25%' }}
            body={(app: SparkAppInstance) => (
              <a
                className="cursor-pointer font-medium text-primary no-underline transition-colors duration-250 ease-smooth hover:text-primary-700 hover:underline"
                onClick={() => viewDetail(app)}
              >
                {app.name}
              </a>
            )}
          />
          <Column
            header="Type"
            field="type"
            style={{ width: '12%' }}
            body={(app: SparkAppInstance) => (
              <span className="inline-flex items-center rounded-sm border border-border-light bg-surface-secondary px-2 py-[3px] text-[12px] font-medium text-fg-secondary">
                {app.type}
              </span>
            )}
          />
          <Column
            header="Image"
            style={{ width: '15%' }}
            body={(app: SparkAppInstance) => (
              <span className="text-[12px] text-fg-secondary mono" title={app.image}>
                {shortenImage(app.image)}
              </span>
            )}
          />
          <Column
            header="Status"
            field="status"
            style={{ width: '12%' }}
            body={(app: SparkAppInstance) => (
              <StatusTag
                value={app.status}
                tone={getStatusTone(app.status)}
                pulse={app.status === 'RUNNING'}
              />
            )}
          />
          <Column
            header="Created"
            style={{ width: '15%' }}
            body={(app: SparkAppInstance) => (
              <span className="text-[13px] text-fg-secondary">
                {formatMediumDate(app.createdAt)}
              </span>
            )}
          />
          <Column
            style={{ width: '21%', textAlign: 'right' }}
            body={(app: SparkAppInstance) => (
              <div className="actions">
                {app.status === 'RUNNING' ? (
                  <Button
                    icon="pi pi-external-link"
                    text
                    label="Spark UI"
                    title="Open live Spark UI"
                    onClick={() => openSparkLink(app, 'uiAddress', 'Spark UI unavailable')}
                  />
                ) : (
                  isTerminalStatus(app.status) && (
                    <Button
                      icon="pi pi-history"
                      text
                      label="History"
                      title="Open Spark History Server"
                      onClick={() =>
                        openSparkLink(app, 'historyServerUrl', 'History Server unavailable')
                      }
                    />
                  )
                )}
                <Button
                  icon="pi pi-eye"
                  text
                  label="Detail"
                  title="View details"
                  onClick={() => viewDetail(app)}
                />
                <Button
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  rounded
                  title="Delete job"
                  onClick={() => confirmDelete(app)}
                />
              </div>
            )}
          />
        </DataTable>
      </div>
    </div>
  );
}

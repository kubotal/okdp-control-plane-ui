import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Toast } from 'primereact/toast';
import {
  externalSecretApi,
  type ExternalSecret,
  type ExternalSecretRequest,
  type ExternalSecretDataRef,
  type ExternalSecretStatusDetail,
} from '../../../core/api/external-secret-api';
import { secretStoreApi, type SecretStore } from '../../../core/api/secret-store-api';
import { apiErrorMessage, formatMediumDateTime } from '../services/service-utils';
import { statusTone } from './secret-status';
import { StatusTag } from '../../../shared/components/status-tag';
import { StatusDialog } from './status-dialog';
import { usePolledResources } from '../../../shared/hooks/use-polled-resources';
import { useStatusDialog } from './use-status-dialog';
import { SECTION_TITLE_CLASS, DIVIDER_CLASS } from './constants';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { useRowActionsMenu } from '../../../shared/hooks/use-row-actions-menu';
import { k8sNameError } from '../../../shared/utils/k8s-names';
import { DialogFooter } from '../../../shared/components/dialog-footer';
import DeleteConfirmDialog from '../../../shared/components/delete-confirm-dialog';

const REFRESH_OPTIONS = [
  { label: '1 minute', value: '1m' },
  { label: '5 minutes', value: '5m' },
  { label: '15 minutes', value: '15m' },
  { label: '30 minutes', value: '30m' },
  { label: '1 hour', value: '1h' },
  { label: '6 hours', value: '6h' },
  { label: '24 hours', value: '24h' },
];

const EMPTY_MAPPING = (): ExternalSecretDataRef => ({
  secretKey: '',
  remoteRef: { key: '', property: '' },
});

const getStatusTone = (status: string) => statusTone(status, 'Synced');

const isSecretChanged = (s: ExternalSecret, c: ExternalSecret) =>
  s.name !== c.name ||
  s.status !== c.status ||
  s.lastSyncedAt !== c.lastSyncedAt ||
  s.lastError !== c.lastError;

const toSecretFallbackDetail = (es: ExternalSecret): ExternalSecretStatusDetail => ({
  status: es.status,
  conditions: [],
  lastSyncedAt: es.lastSyncedAt,
  lastError: es.lastError,
});

export function ExternalSecretList() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError } = useToastMessages();

  const [readyStores, setReadyStores] = useState<SecretStore[]>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExternalSecret | null>(null);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [secretName, setSecretName] = useState('');
  const [selectedStoreRefName, setSelectedStoreRefName] = useState('');
  const [targetName, setTargetName] = useState('');
  const [refreshInterval, setRefreshInterval] = useState('1h');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataMappings, setDataMappings] = useState<ExternalSecretDataRef[]>([EMPTY_MAPPING()]);

  const {
    items: secrets,
    loading,
    unavailable,
    reload: loadSecrets,
    merge: mergeSecrets,
  } = usePolledResources(projectId, externalSecretApi.list, isSecretChanged, () =>
    showError('Failed to load external secrets'),
  );

  const listAndMerge = useCallback(
    () =>
      externalSecretApi.list(projectId).then((data) => {
        mergeSecrets(data);
        return data;
      }),
    [projectId, mergeSecrets],
  );

  const statusDialog = useStatusDialog({
    projectId,
    getStatus: externalSecretApi.getStatus,
    listAndMerge,
    toFallbackDetail: toSecretFallbackDetail,
    showError,
  });

  const loadReadyStores = useCallback(() => {
    if (!projectId) return;
    secretStoreApi
      .list(projectId)
      .then((stores) => setReadyStores(stores.filter((s) => s.status === 'Ready')))
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    loadReadyStores();
  }, [loadReadyStores]);

  // --- Name validation ---
  const nameError = k8sNameError(secretName);

  const formValid = (() => {
    if (!secretName || !selectedStoreRefName) return false;
    if (nameError) return false;
    return dataMappings.some((m) => m.secretKey && m.remoteRef.key);
  })();

  // --- Dialog ---
  const resetForm = () => {
    setSecretName('');
    setSelectedStoreRefName('');
    setTargetName('');
    setRefreshInterval('1h');
    setShowAdvanced(false);
    setDataMappings([EMPTY_MAPPING()]);
  };

  const showCreateDialog = () => {
    loadReadyStores();
    resetForm();
    setEditMode(false);
    setDialogVisible(true);
  };

  const showEditDialog = (es: ExternalSecret) => {
    loadReadyStores();
    setEditMode(true);
    setSecretName(es.name);
    setSelectedStoreRefName(es.secretStoreRef);
    setTargetName(es.target?.name ?? '');
    setRefreshInterval(es.refreshInterval || '1h');
    setShowAdvanced(!!es.target?.name && es.target.name !== es.name);
    setDataMappings(
      es.data?.length
        ? es.data.map((d) => ({
            secretKey: d.secretKey,
            remoteRef: { key: d.remoteRef.key, property: d.remoteRef.property || '' },
          }))
        : [EMPTY_MAPPING()],
    );
    setDialogVisible(true);
  };

  const addMapping = () => setDataMappings((list) => [...list, EMPTY_MAPPING()]);

  const removeMapping = (index: number) =>
    setDataMappings((list) => {
      const next = list.filter((_, i) => i !== index);
      return next.length === 0 ? [EMPTY_MAPPING()] : next;
    });

  const patchMapping = (index: number, patch: Partial<ExternalSecretDataRef>) =>
    setDataMappings((list) =>
      list.map((m, i) =>
        i === index ? { ...m, ...patch, remoteRef: { ...m.remoteRef, ...patch.remoteRef } } : m,
      ),
    );

  const buildRequest = (): ExternalSecretRequest => ({
    name: secretName,
    secretStoreRef: selectedStoreRefName,
    target: { name: targetName || secretName },
    refreshInterval,
    data: dataMappings
      .filter((m) => m.secretKey && m.remoteRef.key)
      .map((m) => ({
        secretKey: m.secretKey,
        remoteRef: {
          key: m.remoteRef.key,
          property: m.remoteRef.property || undefined,
        },
      })),
  });

  const saveSecret = () => {
    setSaving(true);
    const request = buildRequest();
    const save = editMode
      ? externalSecretApi.update(projectId, secretName, request)
      : externalSecretApi.create(projectId, request);

    save
      .then(() => {
        setSaving(false);
        setDialogVisible(false);
        showSuccess(
          `External secret "${secretName}" ${editMode ? 'updated' : 'created'} successfully`,
        );
        loadSecrets();
      })
      .catch((err) => {
        setSaving(false);
        showError(
          apiErrorMessage(err, `Failed to ${editMode ? 'update' : 'create'} external secret`),
        );
      });
  };

  const confirmDelete = (es: ExternalSecret) => setDeleteTarget(es);

  const deleteSecret = (es: ExternalSecret) => {
    externalSecretApi
      .delete(projectId, es.name)
      .then(() => {
        showSuccess(`External secret "${es.name}" deleted successfully`);
        loadSecrets();
      })
      .catch((err) => {
        showError(apiErrorMessage(err, 'Failed to delete external secret'));
      });
  };

  const { menuElement, openMenu } = useRowActionsMenu<ExternalSecret>([
    { label: 'View Status', icon: 'pi pi-info-circle', command: statusDialog.open },
    { label: 'Edit', icon: 'pi pi-pencil', command: showEditDialog },
    { label: 'Delete', icon: 'pi pi-trash', command: confirmDelete },
  ]);

  const dialogFooter = (
    <DialogFooter
      onCancel={() => setDialogVisible(false)}
      onConfirm={saveSecret}
      confirmLabel={editMode ? 'Save' : 'Create'}
      confirmDisabled={!formValid}
      busy={saving}
    />
  );

  return (
    <div>
      {/* Top Bar */}
      <PageHeader
        title="External Secrets"
        actions={
          <button className="create-btn" onClick={showCreateDialog}>
            <i className="pi pi-plus"></i>
            <span>Add external secret</span>
          </button>
        }
      />

      <SearchFilter
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Filter secrets..."
      />

      {/* Data Table */}
      <div className="table-wrapper">
        <DataTable
          value={secrets}
          loading={loading}
          globalFilter={globalFilter}
          globalFilterFields={['name', 'secretStoreRef', 'target.name', 'status']}
          className="minimal-table"
          dataKey="name"
          rowClassName={() => 'cluster-row'}
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-8 text-[14px] text-fg-secondary">
              <i className="pi pi-key text-[1.2rem] opacity-50"></i>
              <span>
                {unavailable ? (
                  <>
                    Vault integration is not installed on this cluster ({unavailable}), so external
                    secrets cannot be created from here.
                  </>
                ) : (
                  <>
                    No external secrets configured. Click <strong>Add external secret</strong> to
                    create one.
                  </>
                )}
              </span>
            </div>
          }
        >
          <Column
            header="Name"
            field="name"
            style={{ width: '20%' }}
            body={(es: ExternalSecret) => <span className="font-medium">{es.name}</span>}
          />
          <Column
            header="Secret Store"
            field="secretStoreRef"
            style={{ width: '16%' }}
            body={(es: ExternalSecret) => (
              <span className="inline-flex items-center gap-1.5 rounded-xs border border-border-light bg-surface-secondary px-2 py-[3px] text-[12px] font-medium text-fg-secondary">
                <i className="pi pi-database text-[11px]"></i>
                {es.secretStoreRef}
              </span>
            )}
          />
          <Column
            header="Target Secret"
            style={{ width: '20%' }}
            body={(es: ExternalSecret) => (
              <span className="text-[13px] text-fg-secondary mono">{es.target?.name || '-'}</span>
            )}
          />
          <Column
            header="Status"
            field="status"
            style={{ width: '10%' }}
            body={(es: ExternalSecret) => (
              <span title={es.lastError || ''}>
                <StatusTag
                  value={es.status}
                  tone={getStatusTone(es.status)}
                  pulse={es.status === 'Pending'}
                />
              </span>
            )}
          />
          <Column
            header="Last Synced"
            style={{ width: '22%' }}
            className="text-[13px] whitespace-nowrap text-fg-secondary"
            body={(es: ExternalSecret) =>
              es.lastSyncedAt ? formatMediumDateTime(es.lastSyncedAt) : '-'
            }
          />
          <Column
            style={{ width: '12%', textAlign: 'right' }}
            body={(es: ExternalSecret) => (
              <div className="actions">
                <Button
                  icon="pi pi-info-circle"
                  text
                  rounded
                  onClick={() => statusDialog.open(es)}
                  title="View status"
                  aria-label={`View status for ${es.name}`}
                />
                <Button
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  aria-label={`Actions for ${es.name}`}
                  onClick={(e) => openMenu(es, e)}
                />
              </div>
            )}
          />
        </DataTable>
        {menuElement}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        header={editMode ? 'Edit external secret' : 'Add external secret'}
        visible={dialogVisible}
        modal
        draggable={false}
        resizable={false}
        style={{ width: '650px' }}
        className="db-dialog"
        closable
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
      >
        <div className="dialog-content">
          {/* Name */}
          <div className="field">
            <label htmlFor="esName">Name</label>
            <InputText
              id="esName"
              value={secretName}
              onChange={(e) => setSecretName(e.target.value)}
              className={`w-full dialog-input${nameError ? ' border-danger!' : ''}`}
              placeholder="e.g., db-credentials"
              disabled={editMode}
            />
            {nameError && <small className="mt-1 block text-[12px] text-danger">{nameError}</small>}
          </div>

          <hr className={DIVIDER_CLASS} />
          <h4 className={SECTION_TITLE_CLASS}>Source</h4>

          {/* Secret Store */}
          <div className="field">
            <label htmlFor="storeRef">Secret Store</label>
            {readyStores.length === 0 ? (
              <div className="alert-warn flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]">
                <i className="pi pi-info-circle shrink-0 text-[14px]"></i>
                <span>
                  No ready secret stores available. Create and connect a secret store first.
                </span>
              </div>
            ) : (
              <Dropdown
                id="storeRef"
                options={readyStores}
                value={selectedStoreRefName}
                onChange={(e) => setSelectedStoreRefName(e.value)}
                optionLabel="name"
                optionValue="name"
                placeholder="Select a secret store"
                className="w-full"
                appendTo={document.body}
                itemTemplate={(store: SecretStore) => (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{store.name}</span>
                    <span className="text-[12px] text-fg-secondary capitalize">
                      {store.provider}
                    </span>
                  </div>
                )}
              />
            )}
          </div>

          {/* Refresh Interval */}
          <div className="field">
            <label htmlFor="refreshInterval">Refresh interval</label>
            <Dropdown
              id="refreshInterval"
              options={REFRESH_OPTIONS}
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(e.value)}
              optionLabel="label"
              optionValue="value"
              className="w-full"
              appendTo={document.body}
            />
          </div>

          <hr className={DIVIDER_CLASS} />
          <h4 className={SECTION_TITLE_CLASS}>Data Mappings</h4>
          <p className="m-0 mb-3 text-[13px] text-fg-secondary">
            Map keys from the remote secret store to keys in the Kubernetes Secret.
          </p>

          <div className="flex flex-col gap-2">
            {dataMappings.map((mapping, index) => (
              <div
                key={index}
                className="rounded-md border border-border-light bg-surface-secondary px-3 py-2.5"
              >
                <div className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[11px] font-semibold tracking-[0.5px] text-fg-secondary uppercase">
                      Secret Key
                    </label>
                    <InputText
                      value={mapping.secretKey}
                      onChange={(e) => patchMapping(index, { secretKey: e.target.value })}
                      className="dialog-input text-[13px]!"
                      placeholder="e.g., DB_PASSWORD"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-[11px] font-semibold tracking-[0.5px] text-fg-secondary uppercase">
                      Remote Key
                    </label>
                    <InputText
                      value={mapping.remoteRef.key}
                      onChange={(e) =>
                        patchMapping(index, {
                          remoteRef: { ...mapping.remoteRef, key: e.target.value },
                        })
                      }
                      className="dialog-input text-[13px]!"
                      placeholder="e.g., myapp/db"
                    />
                  </div>
                  <div className="flex flex-[0.8] flex-col gap-1">
                    <label className="text-[11px] font-semibold tracking-[0.5px] text-fg-secondary uppercase">
                      Property <span className="optional">(opt.)</span>
                    </label>
                    <InputText
                      value={mapping.remoteRef.property ?? ''}
                      onChange={(e) =>
                        patchMapping(index, {
                          remoteRef: { ...mapping.remoteRef, property: e.target.value },
                        })
                      }
                      className="dialog-input text-[13px]!"
                      placeholder="e.g., password"
                    />
                  </div>
                  <Button
                    icon="pi pi-times"
                    text
                    severity="danger"
                    onClick={() => removeMapping(index)}
                    disabled={dataMappings.length <= 1}
                    aria-label="Remove mapping"
                  />
                </div>
              </div>
            ))}
          </div>
          <Button icon="pi pi-plus" text label="Add mapping" onClick={addMapping} />

          {/* Advanced */}
          <hr className={DIVIDER_CLASS} />
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent px-0 py-1 text-[13px] font-semibold text-fg-secondary transition-colors duration-150 hover:text-fg"
            onClick={() => setShowAdvanced((v) => !v)}
            type="button"
          >
            <i
              className={`${showAdvanced ? 'pi pi-chevron-down' : 'pi pi-chevron-right'} text-[12px] transition-transform duration-150`}
            ></i>
            <span>Advanced</span>
            {!showAdvanced && targetName && targetName !== secretName && (
              <span className="ml-2 text-[12px] font-normal text-fg-secondary opacity-70">
                Target: {targetName}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="pt-3">
              <div className="field">
                <label htmlFor="targetName">Kubernetes Secret name</label>
                <InputText
                  id="targetName"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-full dialog-input"
                  placeholder={secretName || 'Same as name'}
                />
                <small className="mt-1 block text-[12px] text-fg-secondary">
                  Defaults to the external secret name. Override to use a different name for the
                  Kubernetes Secret.
                </small>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <StatusDialog
        visible={statusDialog.visible}
        selectedName={statusDialog.selectedName}
        loading={statusDialog.loading}
        detail={statusDialog.detail}
        tone={statusDialog.detail ? getStatusTone(statusDialog.detail.status) : 'info'}
        checkedLabel="Last synced"
        checkedAt={statusDialog.detail?.lastSyncedAt}
        onHide={statusDialog.close}
        onRefresh={statusDialog.refresh}
      />

      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="external secret"
        message={
          deleteTarget && (
            <>
              This will remove <strong>{deleteTarget.name}</strong>. The associated Kubernetes
              secret will also be removed.
            </>
          )
        }
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteSecret(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <Toast ref={toast} position="bottom-right" />
    </div>
  );
}

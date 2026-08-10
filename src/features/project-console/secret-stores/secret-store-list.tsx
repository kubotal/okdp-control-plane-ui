import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Checkbox } from 'primereact/checkbox';
import { Toast } from 'primereact/toast';
import {
  secretStoreApi,
  type SecretStore,
  type SecretStoreRequest,
  type SecretStoreStatusDetail,
  type VaultAuthType,
} from '../../../core/api/secret-store-api';
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

const MODE_SWITCH_CLASS =
  'mb-4 flex rounded-sm border border-border-light bg-surface-secondary p-1';
const MODE_BTN_CLASS =
  'flex-1 cursor-pointer rounded-xs border-none p-2 transition-all duration-200';
const MODE_BTN_ACTIVE_CLASS = 'bg-surface font-semibold text-fg shadow-[0_1px_3px_rgba(0,0,0,0.1)]';
const MODE_BTN_IDLE_CLASS = 'bg-transparent font-medium text-fg-secondary';

const modeBtnClass = (active: boolean) =>
  `${MODE_BTN_CLASS} ${active ? MODE_BTN_ACTIVE_CLASS : MODE_BTN_IDLE_CLASS}`;

const AUTH_TYPE_OPTIONS: { label: string; value: VaultAuthType }[] = [
  { label: 'Token', value: 'token' },
  { label: 'Kubernetes', value: 'kubernetes' },
];

interface StoreForm {
  storeName: string;
  vaultServer: string;
  vaultPath: string;
  vaultVersion: 'v1' | 'v2';
  caBundle: string;
  authType: VaultAuthType;
  authToken: string;
  authMountPath: string;
  authRole: string;
  isDefault: boolean;
}

const EMPTY_FORM: StoreForm = {
  storeName: '',
  vaultServer: '',
  vaultPath: '',
  vaultVersion: 'v2',
  caBundle: '',
  authType: 'token',
  authToken: '',
  authMountPath: '',
  authRole: '',
  isDefault: false,
};

const getStatusTone = (status: string) => statusTone(status, 'Ready');

const isStoreChanged = (s: SecretStore, c: SecretStore) =>
  s.name !== c.name ||
  s.status !== c.status ||
  s.lastCheckedAt !== c.lastCheckedAt ||
  s.lastError !== c.lastError ||
  s.isDefault !== c.isDefault;

const toStoreFallbackDetail = (store: SecretStore): SecretStoreStatusDetail => ({
  status: store.status,
  conditions: [],
  lastCheckedAt: store.lastCheckedAt,
  lastError: store.lastError,
});

export function SecretStoreList() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError } = useToastMessages();

  const [globalFilter, setGlobalFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SecretStore | null>(null);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StoreForm>(EMPTY_FORM);

  const patchForm = (patch: Partial<StoreForm>) => setForm((f) => ({ ...f, ...patch }));

  const {
    items: stores,
    loading,
    unavailable,
    reload: loadStores,
    merge: mergeStores,
  } = usePolledResources(projectId, secretStoreApi.list, isStoreChanged, () =>
    showError('Failed to load secret stores'),
  );

  const listAndMerge = useCallback(
    () =>
      secretStoreApi.list(projectId).then((data) => {
        mergeStores(data);
        return data;
      }),
    [projectId, mergeStores],
  );

  const statusDialog = useStatusDialog({
    projectId,
    getStatus: secretStoreApi.getStatus,
    listAndMerge,
    toFallbackDetail: toStoreFallbackDetail,
    showError,
  });

  // --- Name validation ---
  const nameError = k8sNameError(form.storeName);

  const formValid = (() => {
    if (!form.storeName || !form.vaultServer || !form.vaultPath) return false;
    if (nameError) return false;
    if (form.authType === 'token' && !form.authToken && !editMode) return false;
    if (form.authType === 'kubernetes' && !form.authRole) return false;
    return true;
  })();

  // --- Dialog ---
  const showCreateDialog = () => {
    setForm(EMPTY_FORM);
    setEditMode(false);
    setDialogVisible(true);
  };

  const showEditDialog = (store: SecretStore) => {
    setEditMode(true);
    setForm({
      storeName: store.name,
      vaultServer: store.vault?.server ?? '',
      vaultPath: store.vault?.path ?? '',
      vaultVersion: store.vault?.version ?? 'v2',
      caBundle: store.vault?.caBundle ?? '',
      authType: store.auth?.type ?? 'token',
      authToken: '',
      authMountPath: store.auth?.config?.mountPath ?? '',
      authRole: store.auth?.config?.role ?? '',
      isDefault: store.isDefault,
    });
    setDialogVisible(true);
  };

  const buildRequest = (): SecretStoreRequest => ({
    name: form.storeName,
    provider: 'vault',
    vault: {
      server: form.vaultServer,
      path: form.vaultPath,
      version: form.vaultVersion,
      caBundle: form.caBundle || undefined,
    },
    auth: {
      type: form.authType,
      config: {
        token: form.authType === 'token' ? form.authToken || undefined : undefined,
        mountPath: form.authType === 'kubernetes' ? form.authMountPath || undefined : undefined,
        role: form.authType === 'kubernetes' ? form.authRole || undefined : undefined,
      },
    },
    isDefault: form.isDefault,
  });

  const testConnection = () => {
    setTesting(true);
    secretStoreApi
      .testConnection(projectId, buildRequest())
      .then(() => {
        setTesting(false);
        showSuccess('Connection successful!');
      })
      .catch((err) => {
        setTesting(false);
        showError(`Connection test failed: ${apiErrorMessage(err, 'Connection failed')}`);
      });
  };

  const saveStore = () => {
    setSaving(true);
    const request = buildRequest();
    const save = editMode
      ? secretStoreApi.update(projectId, form.storeName, request)
      : secretStoreApi.create(projectId, request);

    save
      .then(() => {
        setSaving(false);
        setDialogVisible(false);
        showSuccess(
          `Secret store "${form.storeName}" ${editMode ? 'updated' : 'created'} successfully`,
        );
        loadStores();
      })
      .catch((err) => {
        setSaving(false);
        showError(apiErrorMessage(err, `Failed to ${editMode ? 'update' : 'create'} secret store`));
      });
  };

  const confirmDelete = (store: SecretStore) => setDeleteTarget(store);

  const deleteStore = (store: SecretStore) => {
    secretStoreApi
      .delete(projectId, store.name)
      .then(() => {
        showSuccess(`Secret store "${store.name}" deleted successfully`);
        loadStores();
      })
      .catch((err) => {
        showError(apiErrorMessage(err, 'Failed to delete secret store'));
      });
  };

  const { menuElement, openMenu } = useRowActionsMenu<SecretStore>([
    { label: 'View Status', icon: 'pi pi-info-circle', command: statusDialog.open },
    { label: 'Edit', icon: 'pi pi-pencil', command: showEditDialog },
    { label: 'Delete', icon: 'pi pi-trash', command: confirmDelete },
  ]);

  const dialogFooter = (
    <DialogFooter
      onCancel={() => setDialogVisible(false)}
      onConfirm={saveStore}
      confirmLabel={editMode ? 'Save' : 'Create'}
      confirmDisabled={testing || !formValid}
      cancelDisabled={testing}
      busy={saving}
      leading={
        <Button
          severity="secondary"
          outlined
          icon={testing ? 'pi pi-spin pi-spinner' : 'pi pi-check-circle'}
          label="Test Connection"
          onClick={testConnection}
          disabled={testing || saving || !form.vaultServer}
        />
      }
    />
  );

  return (
    <div>
      {/* Top Bar */}
      <PageHeader
        title="Secret Stores"
        actions={
          <button className="create-btn" onClick={showCreateDialog}>
            <i className="pi pi-plus"></i>
            <span>Add secret store</span>
          </button>
        }
      />

      <SearchFilter
        value={globalFilter}
        onChange={setGlobalFilter}
        placeholder="Filter stores..."
      />

      {/* Data Table */}
      <div className="table-wrapper">
        <DataTable
          value={stores}
          loading={loading}
          globalFilter={globalFilter}
          globalFilterFields={['name', 'provider', 'status', 'vault.server']}
          className="minimal-table"
          dataKey="name"
          rowClassName={() => 'cluster-row'}
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-8 text-[14px] text-fg-secondary">
              <i className="pi pi-lock text-[1.2rem] opacity-50"></i>
              {/* Inviting the user to add a store the cluster cannot store is
                  worse than saying nothing: the dialog would fail on save. */}
              <span>
                {unavailable ? (
                  <>
                    Vault integration is not installed on this cluster ({unavailable}), so secret
                    stores cannot be configured from here.
                  </>
                ) : (
                  <>
                    No secret stores configured. Click <strong>Add secret store</strong> to connect
                    one.
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
            body={(store: SecretStore) => (
              <>
                <span className="font-medium">{store.name}</span>
                {store.isDefault && <StatusTag value="default" tone="info" className="ml-2" />}
              </>
            )}
          />
          <Column
            header="Provider"
            field="provider"
            style={{ width: '12%' }}
            body={(store: SecretStore) => (
              <span className="inline-flex items-center gap-1.5 rounded-xs border border-border-light bg-surface-secondary px-2 py-[3px] text-[12px] font-medium text-fg-secondary capitalize">
                <i className="pi pi-shield text-[11px]"></i>
                {store.provider}
              </span>
            )}
          />
          <Column
            header="Server"
            style={{ width: '28%' }}
            className="max-w-0 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-fg-secondary mono"
            body={(store: SecretStore) => (
              <span title={store.vault?.server || ''}>{store.vault?.server || '-'}</span>
            )}
          />
          <Column
            header="Status"
            field="status"
            style={{ width: '10%' }}
            body={(store: SecretStore) => (
              <span title={store.lastError || ''}>
                <StatusTag
                  value={store.status}
                  tone={getStatusTone(store.status)}
                  pulse={store.status === 'Pending'}
                />
              </span>
            )}
          />
          <Column
            header="Last Checked"
            style={{ width: '18%' }}
            className="text-[13px] whitespace-nowrap text-fg-secondary"
            body={(store: SecretStore) =>
              store.lastCheckedAt ? formatMediumDateTime(store.lastCheckedAt) : '-'
            }
          />
          <Column
            style={{ width: '12%', textAlign: 'right' }}
            body={(store: SecretStore) => (
              <div className="actions">
                <Button
                  icon="pi pi-info-circle"
                  text
                  rounded
                  onClick={() => statusDialog.open(store)}
                  title="View status"
                  aria-label={`View status for ${store.name}`}
                />
                <Button
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  aria-label={`Actions for ${store.name}`}
                  onClick={(e) => openMenu(store, e)}
                />
              </div>
            )}
          />
        </DataTable>
        {menuElement}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        header={editMode ? 'Edit secret store' : 'Add secret store'}
        visible={dialogVisible}
        modal
        draggable={false}
        resizable={false}
        style={{ width: '600px' }}
        className="db-dialog"
        closable
        onHide={() => setDialogVisible(false)}
        footer={dialogFooter}
      >
        <div className="dialog-content">
          {/* Store Name */}
          <div className="field">
            <label htmlFor="storeName">Store name</label>
            <InputText
              id="storeName"
              value={form.storeName}
              onChange={(e) => patchForm({ storeName: e.target.value })}
              className={`w-full dialog-input${nameError ? ' border-danger!' : ''}`}
              placeholder="e.g., vault-main"
              disabled={editMode}
            />
            {nameError && <small className="mt-1 block text-[12px] text-danger">{nameError}</small>}
          </div>

          <hr className={DIVIDER_CLASS} />
          <h4 className={SECTION_TITLE_CLASS}>Vault Connection</h4>

          {/* Server */}
          <div className="field">
            <label htmlFor="vaultServer">Server URL</label>
            <InputText
              id="vaultServer"
              value={form.vaultServer}
              onChange={(e) => patchForm({ vaultServer: e.target.value })}
              className="w-full dialog-input"
              placeholder="https://vault.example.com:8200"
            />
          </div>

          {/* Path */}
          <div className="field">
            <label htmlFor="vaultPath">Secret path</label>
            <InputText
              id="vaultPath"
              value={form.vaultPath}
              onChange={(e) => patchForm({ vaultPath: e.target.value })}
              className="w-full dialog-input"
              placeholder="e.g., secret"
            />
          </div>

          {/* Version */}
          <div className="field">
            <label id="vaultVersion-label">KV version</label>
            <div
              className={MODE_SWITCH_CLASS}
              role="radiogroup"
              aria-labelledby="vaultVersion-label"
            >
              <button
                className={modeBtnClass(form.vaultVersion === 'v2')}
                onClick={() => patchForm({ vaultVersion: 'v2' })}
                role="radio"
                aria-checked={form.vaultVersion === 'v2'}
              >
                v2
              </button>
              <button
                className={modeBtnClass(form.vaultVersion === 'v1')}
                onClick={() => patchForm({ vaultVersion: 'v1' })}
                role="radio"
                aria-checked={form.vaultVersion === 'v1'}
              >
                v1
              </button>
            </div>
          </div>

          {/* CA Bundle */}
          <div className="field">
            <label htmlFor="caBundle">
              CA Bundle <span className="optional">(optional)</span>
            </label>
            <InputTextarea
              id="caBundle"
              value={form.caBundle}
              onChange={(e) => patchForm({ caBundle: e.target.value })}
              className="w-full dialog-input resize-y text-[12px]! mono"
              placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
              rows={3}
            />
          </div>

          <hr className={DIVIDER_CLASS} />
          <h4 className={SECTION_TITLE_CLASS}>
            Authentication{' '}
            {editMode && <span className="optional">(leave empty to keep existing)</span>}
          </h4>

          {/* Auth Type Switch */}
          <div className={MODE_SWITCH_CLASS} role="radiogroup" aria-label="Authentication type">
            {AUTH_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={modeBtnClass(form.authType === opt.value)}
                onClick={() => patchForm({ authType: opt.value })}
                role="radio"
                aria-checked={form.authType === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Token Auth */}
          {form.authType === 'token' && (
            <div className="field">
              <label htmlFor="authToken">Vault Token</label>
              <InputText
                id="authToken"
                value={form.authToken}
                onChange={(e) => patchForm({ authToken: e.target.value })}
                className="w-full dialog-input"
                type="password"
                placeholder={
                  editMode ? '(existing token preserved - leave empty to keep)' : 'hvs.XXXX...'
                }
              />
            </div>
          )}

          {/* Kubernetes Auth */}
          {form.authType === 'kubernetes' && (
            <>
              <div className="field">
                <label htmlFor="authMountPath">
                  Mount path <span className="optional">(optional)</span>
                </label>
                <InputText
                  id="authMountPath"
                  value={form.authMountPath}
                  onChange={(e) => patchForm({ authMountPath: e.target.value })}
                  className="w-full dialog-input"
                  placeholder="kubernetes"
                />
              </div>
              <div className="field">
                <label htmlFor="authRole">Role</label>
                <InputText
                  id="authRole"
                  value={form.authRole}
                  onChange={(e) => patchForm({ authRole: e.target.value })}
                  className="w-full dialog-input"
                  placeholder="e.g., my-app-role"
                />
              </div>
            </>
          )}

          {/* Options */}
          <hr className={DIVIDER_CLASS} />
          <div className="mb-5 flex items-center gap-2">
            <Checkbox
              checked={form.isDefault}
              onChange={(e) => patchForm({ isDefault: !!e.checked })}
              inputId="isDefault"
            />
            <label htmlFor="isDefault" className="m-0 cursor-pointer text-[14px] text-fg">
              Set as default store for this project
            </label>
          </div>
        </div>
      </Dialog>

      <StatusDialog
        visible={statusDialog.visible}
        selectedName={statusDialog.selectedName}
        loading={statusDialog.loading}
        detail={statusDialog.detail}
        tone={statusDialog.detail ? getStatusTone(statusDialog.detail.status) : 'info'}
        checkedLabel="Last checked"
        checkedAt={statusDialog.detail?.lastCheckedAt}
        onHide={statusDialog.close}
        onRefresh={statusDialog.refresh}
      />

      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="secret store"
        message={
          deleteTarget && (
            <>
              This will remove <strong>{deleteTarget.name}</strong>. This action cannot be undone.
            </>
          )
        }
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteStore(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <Toast ref={toast} position="bottom-right" />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import {
  connectionApi,
  type Connection,
  type ConnectionCatalog,
  type ConnectionConsumer,
  type ConnectionRequest,
  type ConnectionTestResult,
  type ContractDescriptor,
  type ConnectionValues,
} from '../../../core/api/connection-api';
import { apiErrorMessage, formatMediumDateTime } from '../services/service-utils';
import { connectionStatusTone } from './connection-status';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';
import { StatusTag } from '../../../shared/components/status-tag';
import { DynamicSchemaForm } from '../../../shared/components/dynamic-schema-form';
import { usePolledResources } from '../../../shared/hooks/use-polled-resources';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
import { ConnectionDetailDialog } from './connection-detail-dialog';
import { CredentialsBlock, type CredentialsMode } from './credentials-block';
import { ConnectionTestReport } from './connection-test-result';
import { useToastMessages } from '../../../shared/hooks/use-toast-messages';
import { useRowActionsMenu } from '../../../shared/hooks/use-row-actions-menu';
import { k8sNameError } from '../../../shared/utils/k8s-names';
import { DialogFooter } from '../../../shared/components/dialog-footer';
import DeleteConfirmDialog from '../../../shared/components/delete-confirm-dialog';

const isConnectionChanged = (incoming: Connection, current: Connection) =>
  incoming.name !== current.name ||
  incoming.status !== current.status ||
  incoming.message !== current.message ||
  incoming.description !== current.description;

/** Connections to resources living outside the platform, a corporate
 *  PostgreSQL or an S3 bucket, declared by the user and consumable by the
 *  services deployed in this project. */
export function ExternalConnectionList() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError } = useToastMessages();

  const api = useMemo(
    () => connectionApi.project(projectId),
    [projectId],
  );

  const [catalog, setCatalog] = useState<ConnectionCatalog | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  // Who consumes the connection about to be deleted. Loaded when the dialog
  // opens: the answer only exists on the cluster, and it changes.
  const [consumers, setConsumers] = useState<ConnectionConsumer[] | null>(null);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [detail, setDetail] = useState<Connection | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [typeName, setTypeName] = useState('');
  const [values, setValues] = useState<ConnectionValues>({});
  // Values the form starts from. Kept apart from `values`, which the form owns
  // and streams back on every keystroke: feeding those back in as initial
  // values would restart the form's own initialisation effect on each change.
  const [initialValues, setInitialValues] = useState<ConnectionValues>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  // Credentials either get typed in, and the console writes a Secret, or they
  // already live in one, typically projected from a vault by External Secrets.
  const [credentialsMode, setCredentialsMode] = useState<CredentialsMode>('enter');
  const [existingSecret, setExistingSecret] = useState('');

  const fetchList = useCallback(() => api.list(), [api]);

  const {
    items: connections,
    loading,
    reload,
  } = usePolledResources(
    projectId,
    fetchList,
    isConnectionChanged,
    useCallback(() => showError('Failed to load connections'), [showError]),
  );

  useEffect(() => {
    connectionApi
      .catalog()
      .then(setCatalog)
      .catch(() => showError('Failed to load the contracts'));
  }, [showError]);

  const creatableTypes = useMemo(
    () => (catalog?.types ?? []).filter((type) => type.external),
    [catalog],
  );
  const selectedType: ContractDescriptor | undefined = useMemo(
    () => creatableTypes.find((type) => type.name === typeName),
    [creatableTypes, typeName],
  );

  // Memoised: DynamicSchemaForm re-initialises whenever the schema's identity
  // changes, so handing it a fresh object each render would loop.
  const schema = useMemo(() => (selectedType ? toDynamicSchema(selectedType) : null), [selectedType]);

  const crdAvailable = catalog?.crdAvailable ?? true;
  const nameError = k8sNameError(name);
  const missingFields = selectedType ? missingRequiredFields(selectedType, values) : [];
  const credentialFields = selectedType?.fields.filter((field) => field.secret) ?? [];
  // On an edit the stored credentials are kept when nothing is retyped, so a
  // blank field is not a missing one.
  const missingCredentials =
    credentialsMode === 'existing'
      ? existingSecret
        ? []
        : ['Secret name']
      : editMode
        ? []
        : credentialFields.filter((f) => f.required && !values[f.name]).map((f) => f.label);
  // Testing sends only what the form holds, the endpoint cannot read a Secret,
  // so credentials must be present even on an edit and even when the connection
  // points at an existing Secret.
  const missingToTest = [
    ...missingFields,
    ...credentialFields.filter((f) => f.required && !values[f.name]).map((f) => f.label),
  ];
  const formValid =
    Boolean(selectedType) &&
    Boolean(name) &&
    !nameError &&
    missingFields.length === 0 &&
    missingCredentials.length === 0;

  const openCreateDialog = () => {
    setEditMode(false);
    setName('');
    setDescription('');
    setTypeName(creatableTypes[0]?.name ?? '');
    setValues({});
    setInitialValues({});
    setTestResult(null);
    setCredentialsMode('enter');
    setExistingSecret('');
    setDialogVisible(true);
  };

  const openEditDialog = (connection: Connection) => {
    setEditMode(true);
    setName(connection.name);
    setDescription(connection.description ?? '');
    setTypeName(connection.type);
    // Credentials are absent from the response by design, so they start blank
    // and are only written when the user types a new one.
    setValues({ ...connection.values });
    setInitialValues({ ...connection.values });
    setTestResult(null);
    // The server records which of the two it is, so the dialog reopens in the
    // right mode instead of guessing from the Secret's name.
    const secret = connection.credentialsSecret;
    const pointsElsewhere = Boolean(secret) && !secret!.owned;
    setCredentialsMode(pointsElsewhere ? 'existing' : 'enter');
    setExistingSecret(pointsElsewhere ? secret!.name : '');
    setDialogVisible(true);
  };

  const buildRequest = (): ConnectionRequest => ({
    name,
    type: typeName,
    description: description || undefined,
    values: selectedType ? omitBlankSecrets(selectedType, values) : values,
    existingSecret: credentialsMode === 'existing' ? existingSecret : undefined,
  });

  const testConnection = () => {
    setTesting(true);
    setTestResult(null);
    api
      .test({ type: typeName, values: buildRequest().values })
      .then((result) => {
        setTesting(false);
        setTestResult(result);
      })
      .catch((err) => {
        setTesting(false);
        showError(apiErrorMessage(err, 'Could not run the connection test'));
      });
  };

  const saveConnection = () => {
    setSaving(true);
    const request = buildRequest();
    const save = editMode ? api.update(name, request) : api.create(request);

    save
      .then(() => {
        setSaving(false);
        setDialogVisible(false);
        showSuccess(`Connection "${name}" ${editMode ? 'updated' : 'created'} successfully`);
        reload();
      })
      .catch((err) => {
        setSaving(false);
        showError(apiErrorMessage(err, `Failed to ${editMode ? 'update' : 'create'} connection`));
      });
  };

  const deleteConnection = (connection: Connection) => {
    api
      .delete(connection.name)
      .then(() => {
        showSuccess(`Connection "${connection.name}" deleted successfully`);
        reload();
      })
      .catch((err) => showError(apiErrorMessage(err, 'Failed to delete connection')));
  };

  const askDelete = (connection: Connection) => {
    setDeleteTarget(connection);
    setConsumers(null);
    connectionApi
      .consumers(projectId, connection.name)
      .then(setConsumers)
      // Not knowing is not the same as nobody: the dialog says so.
      .catch(() => setConsumers(null));
  };

  const { menuElement, openMenu } = useRowActionsMenu<Connection>([
    { label: 'Details', icon: 'pi pi-info-circle', command: setDetail },
    { label: 'Edit', icon: 'pi pi-pencil', command: openEditDialog },
    { label: 'Delete', icon: 'pi pi-trash', command: askDelete },
  ]);

  const onCopied = (what: string) =>
    what ? showSuccess(`Copied ${what}`) : showError('Could not copy to the clipboard');

  const dialogFooter = (
    <DialogFooter
      onCancel={() => setDialogVisible(false)}
      onConfirm={saveConnection}
      confirmLabel={editMode ? 'Save' : 'Create'}
      confirmDisabled={testing || !formValid}
      cancelDisabled={testing}
      busy={saving}
      leading={
        <Button
          severity="secondary"
          outlined
          icon={testing ? 'pi pi-spin pi-spinner' : 'pi pi-check-circle'}
          label="Test connection"
          onClick={testConnection}
          disabled={testing || saving || !selectedType || missingToTest.length > 0}
          tooltip={
            missingToTest.length > 0
              ? `Fill in ${missingToTest.join(', ')} to test the connection`
              : undefined
          }
        />
      }
    />
  );

  return (
    <div>
      <Toast ref={toast} position="bottom-right" />

      <PageHeader
        title="External connections"
        actions={
          <button className="create-btn" onClick={openCreateDialog} disabled={!crdAvailable}>
            <i className="pi pi-plus"></i>
            <span>Add connection</span>
          </button>
        }
      />

      {!crdAvailable && (
        // The CRDs ship with a KuboCD version the platform does not run yet.
        // Say so plainly rather than letting the user fill a form that cannot
        // be saved.
        <Message
          severity="info"
          className="mb-4 w-full justify-start"
          text="External connections need the KuboCD connection CRDs, which are not installed on this cluster yet. Internal connections are unaffected."
        />
      )}

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
          globalFilterFields={['name', 'type', 'description', 'status']}
          className="minimal-table"
          dataKey="name"
          rowClassName={() => 'cluster-row cursor-pointer'}
          onRowClick={(event) => setDetail(event.data as Connection)}
          emptyMessage={
            <div className="flex items-center justify-center gap-2 p-8 text-[14px] text-fg-secondary">
              <i className="pi pi-cloud text-[1.2rem] opacity-50"></i>
              <span>
                No external connection yet. Click <strong>Add connection</strong> to declare one.
              </span>
            </div>
          }
        >
          <Column
            header="Name"
            field="name"
            style={{ width: '22%' }}
            body={(connection: Connection) => (
              <span className="font-medium">{connection.name}</span>
            )}
          />
          <Column
            header="Type"
            field="type"
            style={{ width: '16%' }}
            body={(connection: Connection) => (
              <span className="inline-flex items-center gap-1.5 rounded-xs border border-border-light bg-surface-secondary px-2 py-[3px] text-[12px] font-medium text-fg-secondary">
                <i className="pi pi-cloud text-[11px]"></i>
                {catalog?.types.find((t) => t.name === connection.type)?.displayName ??
                  connection.type}
              </span>
            )}
          />
          <Column
            header="Description"
            style={{ width: '28%' }}
            className="max-w-0 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-fg-secondary"
            body={(connection: Connection) => (
              <span title={connection.description || ''}>{connection.description || '-'}</span>
            )}
          />
          <Column
            header="Status"
            field="status"
            style={{ width: '12%' }}
            body={(connection: Connection) => (
              <span title={connection.message || ''}>
                <StatusTag
                  value={connection.status || 'Unknown'}
                  tone={connectionStatusTone(connection.status)}
                />
              </span>
            )}
          />
          <Column
            header="Created"
            style={{ width: '14%' }}
            className="text-[13px] whitespace-nowrap text-fg-secondary"
            body={(connection: Connection) =>
              connection.createdAt ? formatMediumDateTime(connection.createdAt) : '-'
            }
          />
          <Column
            style={{ width: '8%', textAlign: 'right' }}
            body={(connection: Connection) => (
              <div className="actions">
                <Button
                  icon="pi pi-ellipsis-v"
                  text
                  rounded
                  aria-label={`Actions for ${connection.name}`}
                  onClick={(e) => {
                    // The row opens the detail dialog; the menu must not.
                    e.stopPropagation();
                    openMenu(connection, e);
                  }}
                />
              </div>
            )}
          />
        </DataTable>
        {menuElement}
      </div>

      <Dialog
        header={editMode ? 'Edit connection' : 'Add connection'}
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
          <div className="field">
            <label htmlFor="connectionName">Connection name</label>
            <InputText
              id="connectionName"
              value={name}
              disabled={editMode}
              onChange={(e) => setName(e.target.value)}
              placeholder="corporate-warehouse"
            />
            {nameError && <small className="p-error">{nameError}</small>}
          </div>

          <div className="field">
            <label htmlFor="contract">Type</label>
            <Dropdown
              inputId="contract"
              value={typeName}
              disabled={editMode}
              options={creatableTypes.map((type) => ({
                label: type.displayName,
                value: type.name,
              }))}
              onChange={(e) => {
                setTypeName(e.value);
                // The fields of the previous type do not apply to the new one.
                setValues({});
                setInitialValues({});
                setTestResult(null);
              }}
              placeholder="Select a type"
            />
            {selectedType?.description && (
              <small className="text-fg-secondary">{selectedType.description}</small>
            )}
          </div>

          <div className="field">
            <label htmlFor="connectionDescription">Description</label>
            <InputTextarea
              id="connectionDescription"
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this connection is for"
            />
          </div>

          {selectedType && schema && (
            <DynamicSchemaForm
              // Remounting on a type change resets the form to the new
              // schema's defaults instead of carrying stale values over.
              key={`${selectedType.name}-${editMode ? name : 'new'}`}
              schema={schema}
              initialValues={initialValues}
              onParametersChange={(params) => setValues(params as ConnectionValues)}
            />
          )}

          {selectedType && (
            <CredentialsBlock
              contract={selectedType}
              mode={credentialsMode}
              onModeChange={setCredentialsMode}
              values={values}
              onValueChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
              existingSecret={existingSecret}
              onExistingSecretChange={setExistingSecret}
              editMode={editMode}
            />
          )}

          {/* The Save button is disabled until the form is complete. Naming
              what is missing beats leaving the user to hunt for it. */}
          {selectedType && [...missingFields, ...missingCredentials].length > 0 && (
            <small className="field-hint">
              Still to fill in: {[...missingFields, ...missingCredentials].join(', ')}.
            </small>
          )}

          {testResult && <ConnectionTestReport result={testResult} />}
        </div>
      </Dialog>

      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="connection"
        message={
          <>
            {/* The credentials Secret goes with the connection, so the pods
                mounting it fail at their next restart, not right away. Saying
                which services those are is the whole point of this dialog. */}
            {consumers === null ? (
              <span>
                Could not check which services use this connection. Deleting it removes its
                credentials secret, and any service mounting that secret will fail to restart.
              </span>
            ) : consumers.length === 0 ? (
              <span>
                No service of this project is bound to it. Deleting it also removes its
                credentials secret.
              </span>
            ) : (
              <>
                <span>
                  {consumers.length === 1 ? 'This service uses it' : 'These services use it'}:{' '}
                  <strong>{consumers.map((c) => c.service).join(', ')}</strong>. Deleting the
                  connection removes its credentials secret too, so they will fail to start at
                  their next restart.
                </span>
              </>
            )}
          </>
        }
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteConnection(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      <ConnectionDetailDialog
        detail={
          detail && {
            name: detail.name,
            typeDisplay:
              catalog?.types.find((t) => t.name === detail.type)?.displayName ?? detail.type,
            icon: catalog?.types.find((t) => t.name === detail.type)?.icon,
            description: detail.description,
            status: detail.status,
            namespace: detail.namespace,
            message: detail.message,
            values: detail.values,
            credentialsSecret: detail.credentialsSecret,
          }
        }
        visible={detail !== null}
        onHide={() => setDetail(null)}
        onCopied={onCopied}
      />
    </div>
  );
}

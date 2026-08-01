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
  type ConnectionRequest,
  type ConnectionScope,
  type ConnectionTestResult,
  type ConnectionType,
  type ConnectionValues,
} from '../../../core/api/connection-api';
import { apiErrorMessage, formatMediumDateTime } from '../services/service-utils';
import { connectionStatusTone, testResultIcon } from './connection-status';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';
import { StatusTag } from '../../../shared/components/status-tag';
import { DynamicSchemaForm } from '../../../shared/components/dynamic-schema-form';
import { usePolledResources } from '../../../shared/hooks/use-polled-resources';
import SearchFilter from '../../../shared/components/search-filter';
import { PageHeader } from '../../../shared/components/page-header';
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

interface ExternalConnectionListProps {
  /** 'platform' addresses the cluster-wide connections shared by every
   *  project; it has no project in its route. */
  scope?: ConnectionScope;
}

/** Connections to resources living outside the platform — a corporate
 *  PostgreSQL, an S3 bucket — declared by the user and consumable by the
 *  services deployed here. */
export function ExternalConnectionList({ scope = 'project' }: ExternalConnectionListProps) {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { toast, showSuccess, showError } = useToastMessages();

  const api = useMemo(
    () => (scope === 'platform' ? connectionApi.platform() : connectionApi.project(projectId)),
    [scope, projectId],
  );

  const [catalog, setCatalog] = useState<ConnectionCatalog | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
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

  // The platform scope is not project-scoped, but usePolledResources keys on a
  // project id; a constant stands in so polling still starts.
  const pollKey = scope === 'platform' ? 'platform' : projectId;
  const fetchList = useCallback(() => api.list(), [api]);

  const {
    items: connections,
    loading,
    reload,
  } = usePolledResources(
    pollKey,
    fetchList,
    isConnectionChanged,
    useCallback(() => showError('Failed to load connections'), [showError]),
  );

  useEffect(() => {
    connectionApi
      .catalog()
      .then(setCatalog)
      .catch(() => showError('Failed to load the connection types'));
  }, [showError]);

  const creatableTypes = useMemo(
    () => (catalog?.types ?? []).filter((type) => type.external),
    [catalog],
  );
  const selectedType: ConnectionType | undefined = useMemo(
    () => creatableTypes.find((type) => type.name === typeName),
    [creatableTypes, typeName],
  );

  // Memoised: DynamicSchemaForm re-initialises whenever the schema's identity
  // changes, so handing it a fresh object each render would loop.
  const schema = useMemo(
    () => (selectedType ? toDynamicSchema(selectedType, editMode) : null),
    [selectedType, editMode],
  );

  const crdAvailable = catalog?.crdAvailable ?? true;
  const nameError = k8sNameError(name);
  const missingFields = selectedType ? missingRequiredFields(selectedType, values, editMode) : [];
  // Testing sends only what the form holds — the endpoint cannot read the
  // stored Secret — so a credential must be present even on an edit, where
  // saving would have been happy to keep the stored one.
  const missingToTest = selectedType ? missingRequiredFields(selectedType, values, false) : [];
  const formValid = Boolean(selectedType) && Boolean(name) && !nameError && missingFields.length === 0;

  const openCreateDialog = () => {
    setEditMode(false);
    setName('');
    setDescription('');
    setTypeName(creatableTypes[0]?.name ?? '');
    setValues({});
    setInitialValues({});
    setTestResult(null);
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
    setDialogVisible(true);
  };

  const buildRequest = (): ConnectionRequest => ({
    name,
    type: typeName,
    description: description || undefined,
    values: selectedType ? omitBlankSecrets(selectedType, values) : values,
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

  const { menuElement, openMenu } = useRowActionsMenu<Connection>([
    { label: 'Edit', icon: 'pi pi-pencil', command: openEditDialog },
    { label: 'Delete', icon: 'pi pi-trash', command: setDeleteTarget },
  ]);

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
        title={scope === 'platform' ? 'Platform connections' : 'External connections'}
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
          rowClassName={() => 'cluster-row'}
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
                  onClick={(e) => openMenu(connection, e)}
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
            <label htmlFor="connectionType">Type</label>
            <Dropdown
              inputId="connectionType"
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

          {testResult && (
            <Message
              severity={testResult.success ? 'success' : 'error'}
              className="mt-2 w-full justify-start"
              icon={testResultIcon(testResult)}
              text={`${testResult.message} (${testResult.durationMs} ms)`}
            />
          )}
        </div>
      </Dialog>

      <DeleteConfirmDialog
        resourceName={deleteTarget?.name ?? null}
        resourceKind="connection"
        message="Services configured to use this connection will no longer resolve it."
        onHide={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteConnection(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

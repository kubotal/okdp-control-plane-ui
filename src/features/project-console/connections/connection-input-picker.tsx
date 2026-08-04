import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import {
  connectionApi,
  type ConnectionType,
  type ConnectionValues,
  type ConnectionTestResult,
  type SelectableConnection,
} from '../../../core/api/connection-api';
import type { PackageInput } from '../../../core/api/service-api';
import { DynamicSchemaForm } from '../../../shared/components/dynamic-schema-form';
import { DialogFooter } from '../../../shared/components/dialog-footer';
import { k8sNameError } from '../../../shared/utils/k8s-names';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';
import { testResultIcon } from './connection-status';

/** Internal sentinel for "no connection" — PrimeReact's Dropdown mishandles an
 *  option whose value is the empty string, so the option carries this value and
 *  the picker reports '' to its parent: the package resolves an empty parameter
 *  to a name nothing can be called, and skips the binding. */
const NONE = '__none__';

interface PickerChoice {
  label: string;
  value: string;
  description?: string;
}

/**
 * One picker per input the service's package declares: choose an existing
 * connection of the right contract (the project's and the platform's, managed
 * ones included), leave it empty when the package allows, or create a new
 * connection on the spot — same form and same Test button as the Connections
 * page, with the type fixed by the input's contract.
 */
export function ConnectionInputPicker({
  projectId,
  input,
  value,
  onChange,
}: {
  projectId: string;
  input: PackageInput;
  value: string;
  onChange: (connectionName: string) => void;
}) {
  const [selectable, setSelectable] = useState<SelectableConnection[]>([]);
  const [connectionType, setConnectionType] = useState<ConnectionType | null>(null);
  const [createVisible, setCreateVisible] = useState(false);

  const reload = useCallback(() => {
    connectionApi
      .selectable(projectId, input.interface)
      .then(setSelectable)
      .catch(() => setSelectable([]));
  }, [projectId, input.interface]);

  useEffect(() => {
    reload();
    connectionApi
      .catalog()
      .then((catalog) => {
        setConnectionType(catalog.types.find((t) => t.name === input.interface) ?? null);
      })
      .catch(() => setConnectionType(null));
  }, [reload, input.interface]);

  const options = useMemo<PickerChoice[]>(() => {
    const choices: PickerChoice[] = selectable.map((connection) => ({
      label:
        connection.scope === 'platform' ? `${connection.name} (platform)` : connection.name,
      value: connection.name,
      description: connection.managed
        ? `Provided by ${connection.providedBy || 'a deployed service'}`
        : connection.description,
    }));
    if (input.optional) {
      choices.unshift({ label: 'None', value: NONE, description: 'Deploy without this connection' });
    }
    return choices;
  }, [selectable, input.optional]);

  // An optional input starts (and stays, unless picked) at None.
  const displayedValue = input.optional ? value || NONE : value || undefined;

  return (
    <div className="form-field" data-testid={`connection-input-${input.alias}`}>
      <div className="field-head">
        <label style={{ margin: 0 }}>
          Connection — {input.alias}
          <span className="muted-text small"> ({input.interface})</span>
        </label>
        {/* Creating is only offered for contracts a user may declare by hand:
            an internal-only type (trino, ...) exists because a service does. */}
        {connectionType?.external && (
          <Button
            type="button"
            label="New connection"
            icon="pi pi-plus"
            text
            onClick={() => setCreateVisible(true)}
          />
        )}
      </div>
      <small className="field-hint" style={{ marginTop: 0, marginBottom: '10px' }}>
        {input.description ||
          (input.optional
            ? 'Optional: pick an existing connection, or leave it to None.'
            : 'Required: this service needs a connection of this type.')}
      </small>
      <Dropdown
        value={displayedValue}
        options={options}
        optionLabel="label"
        optionValue="value"
        placeholder={
          options.length === 0 ? 'No compatible connection available' : 'Select a connection'
        }
        appendTo={document.body}
        className="w-full"
        onChange={(e) => onChange(e.value === NONE ? '' : (e.value as string))}
        itemTemplate={(option: PickerChoice) => (
          <div>
            <div>{option.label}</div>
            {option.description && (
              <div className="muted-text small">{option.description}</div>
            )}
          </div>
        )}
      />

      {connectionType && (
        <InlineConnectionCreate
          projectId={projectId}
          connectionType={connectionType}
          visible={createVisible}
          onHide={() => setCreateVisible(false)}
          onCreated={(name) => {
            setCreateVisible(false);
            reload();
            onChange(name);
          }}
        />
      )}
    </div>
  );
}

/** The connection-creation dialog, reduced to what the deploy flow needs: the
 *  type is fixed by the input's contract, and the Test button probes the live
 *  endpoint before anything is saved — same server call as the Connections
 *  page, so the behaviour cannot drift. */
function InlineConnectionCreate({
  projectId,
  connectionType,
  visible,
  onHide,
  onCreated,
}: {
  projectId: string;
  connectionType: ConnectionType;
  visible: boolean;
  onHide: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<ConnectionValues>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState('');

  const schema = useMemo(() => toDynamicSchema(connectionType), [connectionType]);
  const nameError = name ? k8sNameError(name) : null;
  const formValid =
    !!name && !nameError && missingRequiredFields(connectionType, values).length === 0;

  const api = connectionApi.project(projectId);

  const test = () => {
    setTesting(true);
    setTestResult(null);
    api
      .test({ type: connectionType.name, values: omitBlankSecrets(connectionType, values) })
      .then(setTestResult)
      .catch(() => setTestResult({ success: false, message: 'Test request failed', durationMs: 0 }))
      .finally(() => setTesting(false));
  };

  const create = () => {
    setSaving(true);
    setError('');
    api
      .create({
        name,
        type: connectionType.name,
        values: omitBlankSecrets(connectionType, values),
      })
      .then(() => {
        setSaving(false);
        setName('');
        setTestResult(null);
        onCreated(name);
      })
      .catch((err: unknown) => {
        setSaving(false);
        const detail =
          err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
        setError(detail || 'Failed to create the connection');
      });
  };

  return (
    <Dialog
      header={`New ${connectionType.displayName} connection`}
      visible={visible}
      modal
      draggable={false}
      resizable={false}
      style={{ width: '560px' }}
      className="db-dialog"
      onHide={onHide}
      footer={
        <DialogFooter
          onCancel={onHide}
          onConfirm={create}
          confirmLabel="Create and select"
          confirmDisabled={testing || !formValid}
          cancelDisabled={testing || saving}
          busy={saving}
          leading={
            <Button
              type="button"
              label="Test"
              icon="pi pi-bolt"
              outlined
              loading={testing}
              disabled={!formValid || saving}
              onClick={test}
            />
          }
        />
      }
    >
      <div className="dialog-content">
        <div className="form-field">
          <label htmlFor="inline-conn-name">Connection name</label>
          <InputText
            id="inline-conn-name"
            className="mono"
            value={name}
            placeholder="e.g. corporate-warehouse"
            onChange={(e) => setName(e.target.value)}
          />
          {nameError && <small className="field-hint err">{nameError}</small>}
        </div>
        <DynamicSchemaForm schema={schema} onParametersChange={setValues} />
        {testResult && (
          <Message
            severity={testResult.success ? 'success' : 'error'}
            icon={testResultIcon(testResult)}
            text={`${testResult.message} (${testResult.durationMs} ms)`}
          />
        )}
        {error && <Message severity="error" text={error} />}
      </div>
    </Dialog>
  );
}

export default ConnectionInputPicker;

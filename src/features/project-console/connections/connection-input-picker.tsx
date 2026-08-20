import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import {
  connectionApi,
  type ContractDescriptor,
  type ConnectionValues,
  type ConnectionTestResult,
  type SelectableConnection,
} from '../../../core/api/connection-api';
import type { PackageInput } from '../../../core/api/service-api';
import { DynamicSchemaForm } from '../../../shared/components/dynamic-schema-form';
import { DialogFooter } from '../../../shared/components/dialog-footer';
import { k8sNameError } from '../../../shared/utils/k8s-names';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';
import { CredentialsBlock, type CredentialsMode } from './credentials-block';
import { ConnectionTestReport } from './connection-test-result';

/** Internal sentinel for "no connection": PrimeReact's Dropdown mishandles an
 *  option whose value is the empty string, so the option carries this value and
 *  the picker reports '' to its parent: the package resolves an empty parameter
 *  to a name nothing can be called, and skips the binding. */
const NONE = '__none__';

interface PickerChoice {
  status?: string;
  label: string;
  value: string;
  description?: string;
}

/**
 * One picker per input the service's package declares: choose an existing
 * connection of the right contract, managed ones included, leave it empty when
 * the package allows, or create one on the spot: same form and same Test button
 * as the Connections page, with the type fixed by the input's contract.
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
  /** The descriptor answering this contract, when a user may declare one by
   *  hand. Null for an internal-only contract (trino, ...), where nothing is
   *  offered. */
  const [creatableType, setCreatableType] = useState<ContractDescriptor | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** Loading and failure are not the same as "nothing matches": saying "no
   *  compatible connection" while the request is in flight, or after it failed,
   *  sends the user off to create a duplicate of what already exists. */
  const [state, setState] = useState<'loading' | 'error' | 'loaded'>('loading');

  const reload = useCallback(() => {
    setState('loading');
    connectionApi
      .selectable(projectId, input.contract)
      .then((found) => {
        setSelectable(found);
        setState('loaded');
      })
      .catch(() => {
        setSelectable([]);
        setState('error');
      });
  }, [projectId, input.contract]);

  useEffect(() => {
    reload();
    connectionApi
      .catalog()
      .then((catalog) => {
        const found = catalog.types.find((type) => type.name === input.contract);
        // Without the connection CRDs nothing can be persisted, so offering the
        // creation form here would end on a 501 the picker cannot explain.
        setCreatableType(found && found.external && catalog.crdAvailable ? found : null);
      })
      .catch(() => setCreatableType(null));
  }, [reload, input.contract]);

  const options = useMemo<PickerChoice[]>(() => {
    const choices: PickerChoice[] = selectable.map((connection) => ({
      label: connection.name,
      value: connection.name,
      // The status belongs here: a candidate in ERROR is offered like any other,
      // and picking it leaves the release waiting with nothing to explain why.
      status: connection.status,
      description: connection.managed
        ? `Provided by ${connection.providedBy || 'a deployed service'}`
        : connection.description,
    }));
    // "Nothing chosen" is not always "no connection". When the package carries
    // a default, it is a template rendered against the Environment, which is
    // how an Environment says "here, the database is that one". Calling that
    // None, and writing an empty parameter for it, destroyed the inheritance in
    // silence.
    if (input.default) {
      choices.unshift({
        label: 'Inherited from the Environment',
        value: NONE,
        description: 'The Environment decides which connection this service gets',
      });
    } else if (input.optional) {
      choices.unshift({ label: 'None', value: NONE, description: 'Deploy without this connection' });
    }
    return choices;
  }, [selectable, input.optional, input.default]);

  // An optional input, or one the Environment answers for, starts (and stays,
  // unless picked) on that first entry.
  const hasFallback = input.optional || Boolean(input.default);
  const displayedValue = hasFallback ? value || NONE : value || undefined;

  return (
    <div className="form-field" data-testid={`connection-input-${input.alias}`}>
      <div className="field-head">
        <label style={{ margin: 0 }}>
          Connection: {input.alias}
          <span className="muted-text small"> ({input.contract})</span>
        </label>
        {/* Creating is only offered for contracts a user may declare by hand:
            an internal-only contract (trino, ...) exists because a service does. */}
        {creatableType && (
          <Button
            type="button"
            label="New connection"
            icon="pi pi-plus"
            text
            onClick={() => setCreateOpen(true)}
          />
        )}
      </div>
      <small className="field-hint" style={{ marginTop: 0, marginBottom: '10px' }}>
        {input.description ||
          (input.default
            ? 'The Environment provides one by default. Pick another to override it.'
            : input.optional
              ? 'Optional: pick an existing connection, or leave it to None.'
              : 'Required: this service needs a connection of this type.')}
      </small>
      <Dropdown
        value={displayedValue}
        options={options}
        optionLabel="label"
        optionValue="value"
        placeholder={
          state === 'loading'
            ? 'Loading connections...'
            : state === 'error'
              ? 'Could not load connections'
              : options.length === 0
                ? 'No compatible connection available'
                : 'Select a connection'
        }
        disabled={state === 'loading'}
        appendTo={document.body}
        className="w-full"
        onChange={(e) => onChange(e.value === NONE ? '' : (e.value as string))}
        itemTemplate={(option: PickerChoice) => (
          <div>
            <div>
              {option.label}
              {option.status && option.status !== 'READY' && (
                <span className="muted-text small"> [{option.status}]</span>
              )}
            </div>
            {option.description && (
              <div className="muted-text small">{option.description}</div>
            )}
          </div>
        )}
      />

      {createOpen && creatableType && (
        <InlineConnectionCreate
          projectId={projectId}
          contract={creatableType}
          visible={createOpen}
          onHide={() => setCreateOpen(false)}
          onCreated={(name) => {
            setCreateOpen(false);
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
 *  endpoint before anything is saved, through the same server call as the
 *  Connections
 *  page, so the behaviour cannot drift. */
function InlineConnectionCreate({
  projectId,
  contract,
  visible,
  onHide,
  onCreated,
}: {
  projectId: string;
  contract: ContractDescriptor;
  visible: boolean;
  onHide: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<ConnectionValues>({});
  // Credentials are held apart from the schema values: the form owns the
  // latter and re-emits them whole, without the secret fields it never sees.
  const [credentials, setCredentials] = useState<ConnectionValues>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState('');
  const [credentialsMode, setCredentialsMode] = useState<CredentialsMode>('enter');
  const [existingSecret, setExistingSecret] = useState('');

  const schema = useMemo(() => toDynamicSchema(contract), [contract]);
  const nameError = name ? k8sNameError(name) : null;
  const credentialFields = contract.fields.filter((field) => field.secret);
  const missingCredentials =
    credentialsMode === 'existing'
      ? existingSecret
        ? []
        : ['Secret name']
      : credentialFields.filter((f) => f.required && !credentials[f.name]).map((f) => f.label);
  const missingFields = [...missingRequiredFields(contract, values), ...missingCredentials];
  const formValid = !!name && !nameError && missingFields.length === 0;

  const api = connectionApi.project(projectId);

  const test = () => {
    setTesting(true);
    setTestResult(null);
    api
      .test({ type: contract.name, values: omitBlankSecrets(contract, { ...values, ...credentials }) })
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
        type: contract.name,
        values: omitBlankSecrets(contract, { ...values, ...credentials }),
        existingSecret: credentialsMode === 'existing' ? existingSecret : undefined,
      })
      .then(() => {
        setSaving(false);
        setName('');
        setCredentials({});
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
      header={`New ${contract.displayName} connection`}
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
        <CredentialsBlock
          contract={contract}
          mode={credentialsMode}
          onModeChange={setCredentialsMode}
          values={credentials}
          onValueChange={(field, value) => setCredentials((c) => ({ ...c, [field]: value }))}
          existingSecret={existingSecret}
          onExistingSecretChange={setExistingSecret}
        />
        {/* Same reason as the Connections page: a disabled button that says
            nothing leaves the user hunting for the empty field. */}
        {missingFields.length > 0 && (
          <small className="field-hint">Still to fill in: {missingFields.join(', ')}.</small>
        )}
        {testResult && <ConnectionTestReport result={testResult} />}
        {error && <Message severity="error" text={error} />}
      </div>
    </Dialog>
  );
}

export default ConnectionInputPicker;

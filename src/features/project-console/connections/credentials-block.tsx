import { SelectButton } from 'primereact/selectbutton';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import type { ContractDescriptor, ConnectionValues } from '../../../core/api/connection-api';

/** Where the credentials of a connection come from. */
export type CredentialsMode = 'enter' | 'existing';

const MODES = [
  { label: 'Enter credentials', value: 'enter' as const },
  { label: 'Use an existing secret', value: 'existing' as const },
];

/**
 * The credential fields of a connection, kept apart from the rest of the form.
 *
 * Two reasons they are not just more fields in the grid. They do not go to the
 * same place: everything else lands in the Connection spec, in clear, and these
 * land in a Kubernetes Secret. And they need not be typed at all: a Secret
 * projected from a vault by External Secrets already sits in the namespace, and
 * naming it is better than copying a password into a form to have the console
 * write a second copy of it.
 */
export function CredentialsBlock({
  contract,
  mode,
  onModeChange,
  values,
  onValueChange,
  existingSecret,
  onExistingSecretChange,
  editMode = false,
}: {
  contract: ContractDescriptor;
  mode: CredentialsMode;
  onModeChange: (mode: CredentialsMode) => void;
  values: ConnectionValues;
  onValueChange: (name: string, value: string) => void;
  existingSecret: string;
  onExistingSecretChange: (name: string) => void;
  editMode?: boolean;
}) {
  const credentialFields = contract.fields.filter((field) => field.secret);
  if (credentialFields.length === 0) {
    return null;
  }

  return (
    <section className="form-section" data-testid="credentials-block">
      <div className="field-head">
        <label style={{ margin: 0 }}>Credentials</label>
        <span className="muted-text small">Stored in a Kubernetes Secret, never in the connection</span>
      </div>

      <SelectButton
        value={mode}
        options={MODES}
        onChange={(e) => e.value && onModeChange(e.value as CredentialsMode)}
        className="mb-3"
        allowEmpty={false}
      />

      {mode === 'existing' ? (
        <div className="form-field">
          <label htmlFor="existing-secret">Secret name</label>
          <InputText
            id="existing-secret"
            className="mono"
            value={existingSecret}
            placeholder="e.g. warehouse-credentials"
            onChange={(e) => onExistingSecretChange(e.target.value)}
          />
          <small className="field-hint">
            A Secret of this project, whatever created it. It must carry the keys{' '}
            <span className="mono">{credentialFields.map((f) => f.name).join(', ')}</span>. The
            console checks that before saving, and never reads their values.
          </small>
        </div>
      ) : (
        credentialFields.map((field) => (
          <div className="form-field" key={field.name}>
            <label htmlFor={field.name}>
              {field.label}
              {field.required && !editMode && (
                <span className="text-danger" aria-hidden="true">
                  {' *'}
                </span>
              )}
            </label>
            {field.masked ? (
              <Password
                inputId={field.name}
                value={String(values[field.name] ?? '')}
                feedback={false}
                toggleMask
                className="w-full"
                onChange={(e) => onValueChange(field.name, e.target.value)}
              />
            ) : (
              <InputText
                id={field.name}
                value={String(values[field.name] ?? '')}
                placeholder={field.placeholder}
                onChange={(e) => onValueChange(field.name, e.target.value)}
              />
            )}
            {(field.help || (editMode && field.secret)) && (
              <small className="field-hint">
                {field.help}
                {editMode && field.secret ? ' Leave blank to keep the stored value.' : ''}
              </small>
            )}
          </div>
        ))
      )}
    </section>
  );
}

export default CredentialsBlock;

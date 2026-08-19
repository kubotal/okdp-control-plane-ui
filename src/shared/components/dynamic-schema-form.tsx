/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { InputSwitch } from 'primereact/inputswitch';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { connectionApi, type SelectableConnection } from '../../core/api/connection-api';
import { formatLabel } from '../utils/format-label';

/* The dsf-root class scopes the .field-invalid PrimeReact-input override in
   the PrimeReact overrides section of styles.css. */
const FIELD_CLASS = 'mb-5 flex flex-col gap-1.5';
const FIELD_LABEL_CLASS = 'block text-[13px] font-medium tracking-[-0.005em] text-fg-secondary';

export interface SchemaField {
  name: string;
  type: string;
  default: any;
  description?: string;
  title?: string;
  enum?: any[];
  required?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  multipleOf?: number;
  /** Kept for structured values: the shape of an array's items, and whether an
   *  object accepts free keys. Without them a mapping and a datasource list are
   *  indistinguishable. */
  items?: any;
  additionalProperties?: any;
  properties?: any;
  'x-kubocd-connection-ref'?: { contract: string };
  'x-ui-order'?: number;
  'x-ui-group'?: string;
  'x-ui-widget'?: string;
  'x-ui-condition'?: { field: string; value: any };
  'x-ui-advanced'?: boolean;
  'x-ui-columns'?: number;
  'x-ui-col-span'?: number;
  'x-ui-placeholder'?: string;
}

export interface FieldGroup {
  name: string;
  columns: number;
  fields: SchemaField[];
  advancedFields: SchemaField[];
}

export interface DynamicSchemaFormProps {
  schema: any;
  /** Needed to offer the project's connections on nested connectionRef fields
   *  (a datasource naming a trino connection). Omitted, those stay text. */
  projectId?: string;
  initialValues?: Record<string, any>;
  onParametersChange: (params: Record<string, any>) => void;
  /**
   * Called with true when every field passes local validation (currently K8s
   * quantity format on CPU/memory fields). Parent components can wire this
   * to disable the Save/Deploy button.
   */
  onValidityChange?: (valid: boolean) => void;
}

const GROUP_ICONS: Record<string, string> = {
  General: 'pi-sliders-h',
  Networking: 'pi-globe',
  Storage: 'pi-database',
  Security: 'pi-shield',
  Resources: 'pi-server',
  Authentication: 'pi-lock',
};

function getGroupIcon(groupName: string): string {
  return GROUP_ICONS[groupName] || 'pi-cog';
}

/** Structured parameters (a role mapping, a list of datasources) edited as
 *  JSON. The text being typed is kept locally, otherwise every keystroke would
 *  have to parse: a half-written object is not valid JSON. The parsed value is
 *  only pushed up when it parses, so a typo never replaces the structure. */
function JsonField({
  field,
  value,
  invalid,
  onChange,
}: {
  field: SchemaField;
  value: unknown;
  invalid: boolean;
  onChange: (parsed: unknown) => void;
}) {
  const serialize = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'object' && Object.keys(v).length === 0)
      ? ''
      : JSON.stringify(v, null, 2);

  const [text, setText] = useState(() => serialize(value));
  const [badJson, setBadJson] = useState(false);
  // Follow the value while the user is not the one changing it (version switch,
  // schema reload), without fighting their cursor.
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(serialize(value));
     
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setBadJson(false);
      onChange(field.type === 'array' ? [] : {});
      return;
    }
    try {
      onChange(JSON.parse(next));
      setBadJson(false);
    } catch {
      setBadJson(true);
    }
  };

  return (
    <>
      <InputTextarea
        id={field.name}
        value={text}
        rows={4}
        spellCheck={false}
        placeholder={field.type === 'array' ? '[]' : '{}'}
        className={`w-full mono${invalid || badJson ? ' field-invalid' : ''}`}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (!badJson) setText(serialize(value));
        }}
        onChange={(e) => commit(e.target.value)}
      />
      {badJson && <small className="field-hint err">Invalid JSON, the value is not saved.</small>}
    </>
  );
}

/** A free-form map, edited as pairs. This is what a role mapping is: a claim
 *  value on the left, the roles it grants on the right. Several roles are
 *  comma-separated, and the value keeps the shape it had, list or plain string. */
function KeyValueField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const rows = Object.entries(value);
  const asText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
  const asValue = (text: string, previous: unknown) => {
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    return Array.isArray(previous) || parts.length > 1 ? parts : text.trim();
  };

  const replace = (index: number, key: string, raw: string) => {
    const next: Record<string, unknown> = {};
    rows.forEach(([k, v], i) => {
      if (i === index) {
        if (key) next[key] = asValue(raw, v);
      } else {
        next[k] = v;
      }
    });
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map(([key, val], index) => (
        <div key={index} className="flex items-center gap-2">
          <InputText
            className="w-full mono"
            value={key}
            placeholder="OIDC role"
            onChange={(e) => replace(index, e.target.value, asText(val))}
          />
          <span className="text-fg-secondary">&rarr;</span>
          <InputText
            className="w-full mono"
            value={asText(val)}
            placeholder="granted roles, comma-separated"
            onChange={(e) => replace(index, key, e.target.value)}
          />
          <Button
            type="button"
            icon="pi pi-times"
            text
            aria-label={`Retirer ${key}`}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          />
        </div>
      ))}
      <div>
        <Button
          type="button"
          label="Add an entry"
          icon="pi pi-plus"
          text
          onClick={() => onChange({ ...value, '': '' })}
        />
      </div>
    </div>
  );
}

/** A list of objects whose shape the schema knows: one row per entry, one
 *  column per property. A property carrying a connection marker gets the
 *  project's connections of that contract rather than a free-text field, which
 *  is the only way to name one without copying it by hand. */
function ObjectListField({
  field,
  value,
  projectId,
  onChange,
}: {
  field: SchemaField;
  value: any[];
  projectId?: string;
  onChange: (next: any[]) => void;
}) {
  const props: Record<string, any> = field.items?.properties || {};
  const columns = Object.keys(props);
  const [connections, setConnections] = useState<Record<string, SelectableConnection[]>>({});

  // One lookup per contract used by the row, not per row.
  useEffect(() => {
    if (!projectId) return;
    const contracts = columns
      .map((c) => props[c]?.['x-kubocd-connection-ref']?.contract)
      .filter((i): i is string => !!i);
    [...new Set(contracts)].forEach((contract) => {
      connectionApi
        .selectable(projectId, contract)
        .then((found) => setConnections((c) => ({ ...c, [contract]: found })))
        .catch(() => setConnections((c) => ({ ...c, [contract]: [] })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, field.name]);

  const patch = (index: number, column: string, columnValue: any) =>
    onChange(value.map((row, i) => (i === index ? { ...row, [column]: columnValue } : row)));

  return (
    <div className="flex flex-col gap-2">
      {value.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          {columns.map((column) => {
            const contract = props[column]?.['x-kubocd-connection-ref']?.contract;
            return (
              <div key={column} className="flex-1">
                <label className="text-[12px] text-fg-secondary">{formatLabel(column)}</label>
                {contract ? (
                  <Dropdown
                    value={row[column] ?? null}
                    options={(connections[contract] || []).map((c) => ({
                      label: c.name,
                      value: c.name,
                    }))}
                    optionLabel="label"
                    optionValue="value"
                    placeholder={`Connexion ${contract}`}
                    appendTo={document.body}
                    className="w-full"
                    onChange={(e) => patch(index, column, e.value)}
                  />
                ) : (
                  <InputText
                    className="w-full"
                    value={row[column] ?? ''}
                    placeholder={props[column]?.default ?? ''}
                    onChange={(e) => patch(index, column, e.target.value)}
                  />
                )}
              </div>
            );
          })}
          <Button
            type="button"
            icon="pi pi-times"
            text
            aria-label="Retirer la ligne"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <div>
        <Button
          type="button"
          label="Ajouter"
          icon="pi pi-plus"
          text
          onClick={() => onChange([...value, {}])}
        />
      </div>
    </div>
  );
}

function resolveWidget(field: SchemaField): string {
  const widget = field['x-ui-widget'];
  if (widget) return widget;

  if (field.enum && field.enum.length > 0) return 'select';
  if (field.type === 'boolean') return 'toggle';
  if (field.type === 'integer' || field.type === 'number') return 'number';
  // A structured value in a text input renders as [object Object], and editing
  // it would replace the structure by that string.
  if (field.type === 'array' && field.items?.properties) return 'object-list';
  if (field.type === 'object' && Object.keys(field.properties || {}).length === 0) return 'key-value';
  if (field.type === 'object' || field.type === 'array') return 'yaml';
  return 'text';
}

/** How a numeric field is displayed. Two things a general-purpose number input
 *  gets wrong here: thousands separators turn port 5432 into "5,432", and a
 *  forced decimal turns it into "5432.0". Neither is a number anyone typed.
 *  Decimals are allowed but never imposed, so a replica count stays whole and
 *  a CPU request can still be 0.5. */
function fractionProps(field: SchemaField) {
  return {
    useGrouping: false,
    minFractionDigits: undefined,
    maxFractionDigits: field.type === 'number' ? 3 : 0,
  };
}

function toOptions(enumValues: any[]): { label: string; value: any }[] {
  return enumValues.map((v) => ({ label: String(v), value: v }));
}

function buildFields(schema: any): SchemaField[] {
  const properties = schema?.properties || {};
  const required = new Set<string>(schema?.required || []);

  const fields: SchemaField[] = Object.entries(properties).map(([name, def]: [string, any]) => ({
    name,
    type: def.type || 'string',
    default: def.default,
    description: def.description,
    title: def.title,
    enum: def.enum,
    required: required.has(name),
    minimum: def.minimum,
    maximum: def.maximum,
    minLength: def.minLength,
    maxLength: def.maxLength,
    pattern: def.pattern,
    multipleOf: def.multipleOf,
    items: def.items,
    additionalProperties: def.additionalProperties,
    properties: def.properties,
    'x-kubocd-connection-ref': def['x-kubocd-connection-ref'],
    'x-ui-order': def['x-ui-order'] ?? 999,
    'x-ui-group': def['x-ui-group'] || 'General',
    'x-ui-widget': def['x-ui-widget'],
    'x-ui-condition': def['x-ui-condition'],
    'x-ui-advanced': def['x-ui-advanced'] || false,
    'x-ui-columns': def['x-ui-columns'],
    'x-ui-col-span': def['x-ui-col-span'],
    'x-ui-placeholder': def['x-ui-placeholder'],
  }));

  const visibleFields = fields.filter((f) => f['x-ui-widget'] !== 'profile-editor');
  visibleFields.sort((a, b) => a['x-ui-order']! - b['x-ui-order']!);
  return visibleFields;
}

function buildGroups(visibleFields: SchemaField[]): FieldGroup[] {
  const groupMap = new Map<string, FieldGroup>();
  const groupOrder: string[] = [];

  for (const field of visibleFields) {
    const groupName = field['x-ui-group']!;
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {
        name: groupName,
        columns: field['x-ui-columns'] || 1,
        fields: [],
        advancedFields: [],
      });
      groupOrder.push(groupName);
    }
    const group = groupMap.get(groupName)!;
    if (field['x-ui-columns'] && field['x-ui-columns'] > group.columns) {
      group.columns = field['x-ui-columns'];
    }
    if (field['x-ui-advanced']) {
      group.advancedFields.push(field);
    } else {
      group.fields.push(field);
    }
  }

  return groupOrder.map((name) => groupMap.get(name)!);
}

function initialFormValues(
  fields: SchemaField[],
  initialValues: Record<string, any>,
): Record<string, any> {
  const values: Record<string, any> = {};
  for (const f of fields) {
    if (initialValues[f.name] !== undefined) {
      values[f.name] = initialValues[f.name];
    } else if (f.type === 'array') {
      values[f.name] = Array.isArray(f.default) ? [...f.default] : [];
    } else {
      values[f.name] =
        f.default ??
        (f.type === 'boolean' ? false : f.type === 'number' || f.type === 'integer' ? 0 : '');
    }
  }
  return values;
}

// A K8s resource.Quantity accepts:
//   - a bare decimal: "1", "1.5"
//   - decimal + binary SI suffix: "500Mi", "2Gi", "10Ki"
//   - decimal + metric SI suffix: "500m" (milli for CPU), "1k", "1G"
//   - scientific notation: "1.5e3"
// Empty values are allowed — a missing optional parameter falls back to
// the schema default server-side.
const K8S_QUANTITY_RE = /^[0-9]+(\.[0-9]+)?(m|n|u|[kKMGTPE]i?|e[-+]?[0-9]+)?$/;

function isQuantityField(field: SchemaField): boolean {
  if (field.type !== 'string') return false;
  // Enum values are server-chosen, never free-form quantities.
  if (field.enum && field.enum.length > 0) return false;
  // formatLabel splits camelCase/underscores so \bmemory\b matches "driverMemory".
  const hay =
    `${formatLabel(field.name)} ${field.description ?? ''} ${field.title ?? ''}`.toLowerCase();
  return /\b(cpu|memory|mem)\b/.test(hay) || /request|limit/.test(field.name.toLowerCase());
}

function validateField(field: SchemaField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (!isQuantityField(field)) return '';
  const v = String(value).trim();
  if (!K8S_QUANTITY_RE.test(v)) {
    return `Invalid Kubernetes quantity. Use a number with an optional suffix (e.g. "500Mi", "2Gi", "500m", "1").`;
  }
  return '';
}

// A bare digit is a VALID quantity (bytes for memory, cores for CPU) but is
// often a unit slip, and schema defaults such as "1" core are legitimate:
// this nudges without blocking the deploy.
function warnField(field: SchemaField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (!isQuantityField(field)) return '';
  const v = String(value).trim();
  if (!K8S_QUANTITY_RE.test(v)) return '';
  if (/^[0-9]+(\.[0-9]+)?$/.test(v)) {
    const lower = field.name.toLowerCase();
    if (lower.includes('memory') || lower.includes('mem')) {
      return `"${v}" is read as ${v} byte(s). Did you mean "${v}Mi" or "${v}Gi"?`;
    }
    if (lower.includes('cpu')) {
      return `"${v}" is read as ${v} core(s). Add an "m" suffix for milli-cores if that is not intended.`;
    }
  }
  return '';
}

// One-level (non-transitive) x-ui-condition semantics, shared by render,
// validation and emission so a hidden field can neither block submission
// nor leak its stale value into the emitted params.
function isVisible(field: SchemaField, values: Record<string, any>): boolean {
  const cond = field['x-ui-condition'];
  if (!cond) return true;
  return values[cond.field] === cond.value;
}

// Stable default — an inline `{}` default would change identity on every
// parent render and re-trigger the values-rebuild effect in a loop.
const EMPTY_VALUES: Record<string, any> = {};

export function DynamicSchemaForm({
  schema,
  projectId,
  initialValues = EMPTY_VALUES,
  onParametersChange,
  onValidityChange,
}: DynamicSchemaFormProps) {
  const fields = useMemo(() => (schema ? buildFields(schema) : []), [schema]);
  const groups = useMemo(() => buildGroups(fields), [fields]);

  const [values, setValues] = useState<Record<string, any>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});

  // Rebuild values when the schema or the initial values change
  useEffect(() => {
    if (schema) {
      setValues(initialFormValues(fields, initialValues));
    }
  }, [schema, fields, initialValues]);

  const fieldsByName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (!isVisible(field, values)) continue;
      const msg = validateField(field, values[field.name]);
      if (msg) errors[field.name] = msg;
    }
    return errors;
  }, [fields, values]);

  const fieldWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    for (const field of fields) {
      if (!isVisible(field, values)) continue;
      const msg = warnField(field, values[field.name]);
      if (msg) warnings[field.name] = msg;
    }
    return warnings;
  }, [fields, values]);

  // Emit on every change, including initialization (legacy behavior).
  // Refs keep parent re-renders from re-triggering the effect.
  const onParametersChangeRef = useRef(onParametersChange);
  onParametersChangeRef.current = onParametersChange;
  const onValidityChangeRef = useRef(onValidityChange);
  onValidityChangeRef.current = onValidityChange;

  useEffect(() => {
    onValidityChangeRef.current?.(Object.keys(fieldErrors).length === 0);

    const filtered: Record<string, any> = {};
    for (const [key, val] of Object.entries(values)) {
      // Unknown keys (no matching field) are treated as visible.
      const field = fieldsByName.get(key);
      if (field && !isVisible(field, values)) continue;
      if (Array.isArray(val) || (val !== '' && val !== null && val !== undefined)) {
        filtered[key] = val;
      }
    }
    onParametersChangeRef.current(filtered);
  }, [values, fieldErrors, fieldsByName]);

  const setValue = (name: string, value: any) => {
    setValues((v) => ({ ...v, [name]: value }));
  };

  const isFieldVisible = (field: SchemaField): boolean => isVisible(field, values);

  const toggleAdvanced = (groupName: string) => {
    setAdvancedOpen((open) => ({ ...open, [groupName]: !open[groupName] }));
  };

  const renderWidget = (field: SchemaField) => {
    const value = values[field.name];
    // The field-invalid CSS targets the element carrying the class, so it is
    // passed into each widget rather than set on a wrapper.
    const invalid = fieldErrors[field.name] ? ' field-invalid' : '';
    switch (resolveWidget(field)) {
      case 'password':
        return (
          <Password
            inputId={field.name}
            value={value ?? ''}
            placeholder={field['x-ui-placeholder'] || ''}
            feedback={false}
            toggleMask
            className="w-full"
            inputClassName={invalid ? 'field-invalid' : undefined}
            onChange={(e) => setValue(field.name, e.target.value)}
          />
        );
      case 'object-list':
        return (
          <ObjectListField
            field={field}
            value={Array.isArray(value) ? value : []}
            projectId={projectId}
            onChange={(next) => setValue(field.name, next)}
          />
        );
      case 'key-value':
        return (
          <KeyValueField
            value={value && typeof value === 'object' ? (value as Record<string, unknown>) : {}}
            onChange={(next) => setValue(field.name, next)}
          />
        );
      case 'yaml':
        return (
          <JsonField
            field={field}
            value={value}
            invalid={!!fieldErrors[field.name]}
            onChange={(parsed) => setValue(field.name, parsed)}
          />
        );
      case 'textarea':
        return (
          <InputTextarea
            id={field.name}
            value={value ?? ''}
            placeholder={field['x-ui-placeholder'] || ''}
            rows={3}
            className={`w-full${invalid}`}
            onChange={(e) => setValue(field.name, e.target.value)}
          />
        );
      case 'select':
        return (
          <Dropdown
            inputId={field.name}
            value={value}
            options={toOptions(field.enum!)}
            optionLabel="label"
            optionValue="value"
            placeholder={field['x-ui-placeholder'] || 'Select...'}
            className={`w-full${invalid}`}
            onChange={(e) => setValue(field.name, e.value)}
          />
        );
      case 'stepper':
        return (
          <InputNumber
            inputId={field.name}
            value={value ?? null}
            showButtons
            buttonLayout="horizontal"
            step={field.multipleOf || 1}
            min={field.minimum}
            max={field.maximum}
            {...fractionProps(field)}
            incrementButtonIcon="pi pi-plus"
            decrementButtonIcon="pi pi-minus"
            className="w-full"
            onValueChange={(e) => setValue(field.name, e.value)}
          />
        );
      case 'number':
        return (
          <InputNumber
            inputId={field.name}
            value={value ?? null}
            min={field.minimum}
            max={field.maximum}
            step={field.multipleOf || 1}
            {...fractionProps(field)}
            className="w-full"
            onValueChange={(e) => setValue(field.name, e.value)}
          />
        );
      case 'toggle':
        return <InputSwitch checked={!!value} onChange={(e) => setValue(field.name, e.value)} />;
      case 'url':
        return (
          <InputText
            id={field.name}
            type="url"
            value={value ?? ''}
            placeholder={field['x-ui-placeholder'] || ''}
            className={`w-full${invalid}`}
            onChange={(e) => setValue(field.name, e.target.value)}
          />
        );
      default:
        return (
          <InputText
            id={field.name}
            type="text"
            value={value ?? ''}
            placeholder={field['x-ui-placeholder'] || ''}
            className={`w-full${invalid}`}
            onChange={(e) => setValue(field.name, e.target.value)}
          />
        );
    }
  };

  const renderFieldGrid = (group: FieldGroup, groupFields: SchemaField[]) => (
    <div
      className="grid gap-x-5 gap-y-5"
      style={{ gridTemplateColumns: group.columns === 2 ? '1fr 1fr' : '1fr' }}
    >
      {groupFields.map(
        (field) =>
          isFieldVisible(field) && (
            <div
              key={field.name}
              className={FIELD_CLASS}
              style={{
                gridColumn:
                  (field['x-ui-col-span'] || 1) > 1
                    ? `span ${field['x-ui-col-span'] || 1}`
                    : undefined,
              }}
            >
              <label htmlFor={field.name} className={FIELD_LABEL_CLASS}>
                {field.title || formatLabel(field.name)}
                {/* Without this the only sign a field is mandatory is a Save
                    button that stays grey, with nothing saying which one. */}
                {field.required && (
                  <span className="text-danger" aria-hidden="true">
                    {' *'}
                  </span>
                )}
              </label>
              {renderWidget(field)}
              {fieldErrors[field.name] && (
                <small className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-danger">
                  <i className="pi pi-exclamation-triangle text-[13px]"></i>
                  {fieldErrors[field.name]}
                </small>
              )}
              {!fieldErrors[field.name] && fieldWarnings[field.name] && (
                <small className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
                  <i className="pi pi-exclamation-triangle text-[13px]"></i>
                  {fieldWarnings[field.name]}
                </small>
              )}
              {field.description && <small className="field-help">{field.description}</small>}
            </div>
          ),
      )}
    </div>
  );

  if (groups.length === 0) {
    return (
      <div className="dsf-root">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-light bg-surface-secondary p-5 text-[14px] text-fg-secondary">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-blue-light">
            <i className="pi pi-info-circle text-[1rem] text-accent-blue"></i>
          </div>
          <span>This service has no configurable parameters.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dsf-root">
      <div className="flex flex-col gap-0">
        {groups.map((group, i) => (
          <div
            key={group.name}
            className="animate-[fadeInUp_0.4s_cubic-bezier(0.22,1,0.36,1)_backwards] pb-7 not-last:mb-7 not-last:border-b not-last:border-b-border-light"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            {(groups.length > 1 || group.name !== 'General') && (
              <div className="mb-5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50">
                  <i className={`pi ${getGroupIcon(group.name)} text-[0.85rem] text-primary`}></i>
                </div>
                <h4 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-fg">
                  {group.name}
                </h4>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {renderFieldGrid(group, group.fields)}

              {group.advancedFields.length > 0 && (
                <>
                  <button
                    type="button"
                    className="group mt-5 mb-2 flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0"
                    onClick={() => toggleAdvanced(group.name)}
                  >
                    <span className="h-px flex-1 bg-border-light"></span>
                    <span className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-[12px] font-medium whitespace-nowrap text-primary transition-colors duration-250 ease-smooth group-hover:bg-primary-100">
                      <i
                        className={`pi ${
                          advancedOpen[group.name] ? 'pi-chevron-up' : 'pi-chevron-down'
                        } text-[10px]`}
                      ></i>
                      {advancedOpen[group.name] ? 'Hide' : 'Show'} advanced options
                    </span>
                    <span className="h-px flex-1 bg-border-light"></span>
                  </button>
                  {advancedOpen[group.name] && (
                    <div className="animate-[fadeInUp_0.3s_cubic-bezier(0.22,1,0.36,1)] pt-2">
                      {renderFieldGrid(group, group.advancedFields)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

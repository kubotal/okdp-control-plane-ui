import type { ConnectionType, ConnectionValues } from '../../../core/api/connection-api';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Adapts a connection type descriptor to the schema shape DynamicSchemaForm
 *  consumes, so connection forms look and behave like the service deployment
 *  forms instead of introducing a second form generator.
 *
 *  On an edit, credentials are not pre-filled — the API never returns them —
 *  and leaving one blank keeps the stored value, which `omitBlankSecrets`
 *  below relies on. */
export function toDynamicSchema(type: ConnectionType, editMode = false): any {
  const properties: Record<string, any> = {};

  type.fields.forEach((field, index) => {
    properties[field.name] = {
      // The form has no notion of enum as a type: it is a string constrained
      // by `enum`, which resolveWidget turns into a select.
      type: field.type === 'enum' ? 'string' : field.type,
      title: field.label,
      default: field.default,
      description: secretHelp(field.secret, field.help, editMode),
      enum: field.options,
      minimum: field.min,
      maximum: field.max,
      'x-ui-order': index,
      'x-ui-widget': field.secret ? 'password' : undefined,
      'x-ui-placeholder': field.placeholder,
    };
  });

  return {
    properties,
    // A credential already stored is not demanded again on an edit.
    required: type.fields
      .filter((field) => field.required && !(editMode && field.secret))
      .map((field) => field.name),
  };
}

function secretHelp(secret: boolean | undefined, help: string | undefined, editMode: boolean) {
  if (secret && editMode) {
    return help ? `${help} Leave blank to keep the stored value.` : 'Leave blank to keep the stored value.';
  }
  return help;
}

/** Names of the fields the user must fill in, for the Save button's state.
 *  DynamicSchemaForm reports format errors but does not enforce required. */
export function missingRequiredFields(
  type: ConnectionType,
  values: ConnectionValues,
  editMode = false,
): string[] {
  return type.fields
    .filter((field) => field.required && !(editMode && field.secret))
    .filter((field) => {
      const value = values[field.name];
      return value === undefined || value === null || value === '';
    })
    .map((field) => field.label);
}

/** Drops the credentials left blank so that an edit does not overwrite the
 *  stored ones with empty strings. */
export function omitBlankSecrets(type: ConnectionType, values: ConnectionValues): ConnectionValues {
  const secretFields = new Set(type.fields.filter((f) => f.secret).map((f) => f.name));
  const result: ConnectionValues = {};

  for (const [name, value] of Object.entries(values)) {
    if (secretFields.has(name) && (value === '' || value === undefined || value === null)) {
      continue;
    }
    result[name] = value;
  }
  return result;
}

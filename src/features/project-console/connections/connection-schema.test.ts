import { describe, it, expect } from 'vitest';
import type { ConnectionType } from '../../../core/api/connection-api';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';

const POSTGRES: ConnectionType = {
  name: 'postgresql',
  displayName: 'PostgreSQL',
  description: 'PostgreSQL database server.',
  icon: 'pi pi-database',
  category: 'database',
  external: true,
  fields: [
    { name: 'host', label: 'Host', type: 'string', required: true, placeholder: 'db.example.com' },
    { name: 'port', label: 'Port', type: 'number', required: true, default: 5432, min: 1, max: 65535 },
    { name: 'password', label: 'Password', type: 'string', required: true, secret: true },
    {
      name: 'sslMode',
      label: 'SSL mode',
      type: 'enum',
      required: true,
      default: 'require',
      options: ['disable', 'require'],
    },
  ],
};

describe('toDynamicSchema', () => {
  it('maps each field to the property shape DynamicSchemaForm consumes', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.host).toMatchObject({
      type: 'string',
      title: 'Host',
      'x-ui-placeholder': 'db.example.com',
    });
    expect(schema.properties.port).toMatchObject({ type: 'number', minimum: 1, maximum: 65535 });
  });

  it('renders an enum as a constrained string so the form shows a select', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.sslMode.type).toBe('string');
    expect(schema.properties.sslMode.enum).toEqual(['disable', 'require']);
  });

  it('marks credentials with the password widget so they are never shown in clear', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.password['x-ui-widget']).toBe('password');
    expect(schema.properties.host['x-ui-widget']).toBeUndefined();
  });

  it('preserves the declared field order', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.host['x-ui-order']).toBeLessThan(schema.properties.port['x-ui-order']);
  });

  it('requires every required field when creating', () => {
    expect(toDynamicSchema(POSTGRES).required).toEqual(['host', 'port', 'password', 'sslMode']);
  });

  it('stops requiring a credential when editing, since it is already stored', () => {
    const schema = toDynamicSchema(POSTGRES, true);

    expect(schema.required).toEqual(['host', 'port', 'sslMode']);
    expect(schema.properties.password.description).toContain('Leave blank to keep');
  });
});

describe('missingRequiredFields', () => {
  it('reports the labels of the fields left empty', () => {
    const missing = missingRequiredFields(POSTGRES, { port: 5432, sslMode: 'require' });

    expect(missing).toEqual(['Host', 'Password']);
  });

  it('accepts a fully filled form', () => {
    const missing = missingRequiredFields(POSTGRES, {
      host: 'db.example.com',
      port: 5432,
      password: 's3cret',
      sslMode: 'require',
    });

    expect(missing).toEqual([]);
  });

  it('does not demand a credential when editing', () => {
    const missing = missingRequiredFields(
      POSTGRES,
      { host: 'db.example.com', port: 5432, sslMode: 'require' },
      true,
    );

    expect(missing).toEqual([]);
  });
});

describe('omitBlankSecrets', () => {
  it('drops a credential left blank so the stored one survives the edit', () => {
    const values = omitBlankSecrets(POSTGRES, {
      host: 'db.example.com',
      port: 5432,
      password: '',
      sslMode: 'require',
    });

    expect(values).not.toHaveProperty('password');
    expect(values).toMatchObject({ host: 'db.example.com', port: 5432 });
  });

  it('keeps a credential the user actually typed', () => {
    const values = omitBlankSecrets(POSTGRES, { host: 'db.example.com', password: 'new-one' });

    expect(values.password).toBe('new-one');
  });

  it('keeps a non-secret field that is legitimately empty', () => {
    const values = omitBlankSecrets(POSTGRES, { host: '' });

    expect(values).toHaveProperty('host', '');
  });
});

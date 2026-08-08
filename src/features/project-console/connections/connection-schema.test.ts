import { describe, it, expect } from 'vitest';
import type { ConnectionType } from '../../../core/api/connection-api';
import { missingRequiredFields, omitBlankSecrets, toDynamicSchema } from './connection-schema';

const POSTGRES: ConnectionType = {
  name: 'database-server',
  displayName: 'PostgreSQL',
  description: 'PostgreSQL database server.',
  icon: 'pi pi-database',
  category: 'database',
  external: true,
  fields: [
    { name: 'host', label: 'Host', type: 'string', required: true, placeholder: 'db.example.com' },
    { name: 'port', label: 'Port', type: 'number', required: true, default: 5432, min: 1, max: 65535 },
    { name: 'username', label: 'User', type: 'string', required: true, secret: true },
    { name: 'password', label: 'Password', type: 'string', required: true, secret: true, masked: true },
    {
      name: 'sslMode',
      label: 'SSL mode',
      type: 'enum',
      required: true,
      default: 'require',
      options: ['disable', 'require'],
    },
    {
      name: 'driver',
      label: 'JDBC driver',
      type: 'string',
      required: true,
      derived: { from: 'engine', map: { postgresql: 'org.postgresql.Driver' } },
    },
    {
      name: 'tls',
      label: 'TLS mode',
      type: 'enum',
      required: true,
      options: ['preferred', 'true'],
      showWhen: { field: 'engine', value: 'mysql' },
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

  // Credentials do not go where the other values go: they land in a Secret,
  // and they may not need typing at all when one already exists. CredentialsBlock
  // renders them, so they are absent from this schema.
  it('leaves the credentials out of the form schema', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.password).toBeUndefined();
    expect(schema.properties.username).toBeUndefined();
    expect(schema.properties.host).toBeDefined();
  });

  it('leaves a derived field out of the form, and out of what it demands', () => {
    const schema = toDynamicSchema(POSTGRES);

    // The server recomputes it from the engine on save; a form letting the two
    // disagree only produces connections nothing can open.
    expect(schema.properties.driver).toBeUndefined();
    expect(schema.required).not.toContain('driver');
  });

  it('carries a conditional field through as a form condition', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.tls['x-ui-condition']).toEqual({ field: 'engine', value: 'mysql' });
  });

  it('preserves the declared field order', () => {
    const schema = toDynamicSchema(POSTGRES);

    expect(schema.properties.host['x-ui-order']).toBeLessThan(schema.properties.port['x-ui-order']);
  });

  it('requires every required field when creating', () => {
    // tls stays in the list: it is required when it applies, and the form
    // decides whether it applies from its condition. Credentials are not here.
    expect(toDynamicSchema(POSTGRES).required).toEqual(['host', 'port', 'sslMode', 'tls']);
  });

});

describe('missingRequiredFields', () => {
  it('reports the labels of the fields left empty', () => {
    const missing = missingRequiredFields(POSTGRES, { port: 5432, sslMode: 'require' });

    expect(missing).toEqual(['Host']);
  });

  it('accepts a fully filled form', () => {
    const missing = missingRequiredFields(POSTGRES, {
      host: 'db.example.com',
      port: 5432,
      username: 'reader',
      password: 's3cret',
      sslMode: 'require',
    });

    expect(missing).toEqual([]);
  });

  it('does not demand a field the chosen engine rules out', () => {
    // tls only applies to MySQL, so on a PostgreSQL form it is not on screen —
    // demanding it would grey out Save with nothing to click on.
    const missing = missingRequiredFields(POSTGRES, {
      engine: 'postgresql',
      host: 'db.example.com',
      port: 5432,
      username: 'reader',
      password: 's3cret',
      sslMode: 'require',
    });

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

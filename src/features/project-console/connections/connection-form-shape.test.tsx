import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConnectionType } from '../../../core/api/connection-api';
import { DynamicSchemaForm } from '../../../shared/components/dynamic-schema-form';
import { toDynamicSchema } from './connection-schema';

/**
 * The database-server descriptor as the server actually ships it, copied from
 * GET /api/connection-types. The unit tests around toDynamicSchema use a small
 * fixture; this one checks what a user really sees, so a change to the shipped
 * descriptor that breaks the form fails here rather than on the sandbox.
 */
const DATABASE_SERVER: ConnectionType = {
  name: 'database-server',
  displayName: 'SQL database',
  description: 'SQL database server. The engine tells consuming packages how to address it.',
  icon: 'pi pi-database',
  category: 'database',
  external: true,
  fields: [
    {
      name: 'engine',
      label: 'Engine',
      type: 'enum',
      required: true,
      default: 'postgresql',
      options: ['postgresql', 'mysql'],
    },
    {
      name: 'driver',
      label: 'JDBC driver',
      type: 'string',
      required: true,
      derived: {
        from: 'engine',
        map: { postgresql: 'org.postgresql.Driver', mysql: 'com.mysql.cj.jdbc.Driver' },
      },
    },
    { name: 'host', label: 'Host', type: 'string', required: true },
    { name: 'port', label: 'Port', type: 'number', required: true, default: 5432, min: 1, max: 65535 },
    { name: 'dbName', label: 'Database', type: 'string', required: true },
    { name: 'username', label: 'User', type: 'string', required: true, secret: true },
    { name: 'password', label: 'Password', type: 'string', required: true, secret: true, masked: true },
    {
      name: 'sslMode',
      label: 'TLS mode',
      type: 'enum',
      required: false,
      default: 'prefer',
      options: ['prefer', 'require', 'verify-ca', 'verify-full', 'disable'],
      showWhen: { field: 'engine', value: 'postgresql' },
    },
    {
      name: 'tls',
      label: 'TLS mode',
      type: 'enum',
      required: false,
      options: ['false', 'preferred', 'true', 'skip-verify'],
      showWhen: { field: 'engine', value: 'mysql' },
    },
  ],
};

function renderForm(initialValues: Record<string, unknown> = {}) {
  return render(
    <DynamicSchemaForm
      schema={toDynamicSchema(DATABASE_SERVER)}
      initialValues={initialValues}
      onParametersChange={vi.fn()}
    />,
  );
}

describe('the database-server form as a user sees it', () => {
  it('does not ask for the JDBC driver, which follows from the engine', () => {
    renderForm();

    expect(screen.queryByLabelText(/JDBC driver/)).not.toBeInTheDocument();
  });

  it('shows only the TLS wording of the chosen engine', () => {
    renderForm();

    // Both fields are labelled "TLS mode": the PostgreSQL one and the MySQL
    // one. Exactly one must be on screen, or the user picks the wrong list.
    expect(screen.getAllByLabelText(/TLS mode/)).toHaveLength(1);
    expect(screen.getByLabelText(/TLS mode/)).toHaveValue('prefer');
  });

  it('marks the mandatory fields, so a greyed-out Save button is explainable', () => {
    renderForm();

    // The mark sits on the label, next to the field name.
    expect(screen.getByText(/^Host/).textContent).toContain('*');
  });

  it('shows a port as a port, without a thousands separator or a decimal', () => {
    renderForm();

    // 5432 formatted by locale reads "5,432" or "5 432", and a forced decimal
    // reads "5432.0". Neither is a port number.
    expect(screen.getByLabelText(/^Port/)).toHaveValue('5432');
  });

  it('does not ask for the credentials, which the credentials block renders', () => {
    renderForm();

    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^User/)).not.toBeInTheDocument();
  });

  it('offers the MySQL wording, and only it, on a MySQL connection', () => {
    renderForm({ engine: 'mysql' });

    const tls = screen.getAllByLabelText(/TLS mode/);
    expect(tls).toHaveLength(1);
    // The MySQL list, not the PostgreSQL one: 'prefer' is not a MySQL value.
    expect(tls[0]).not.toHaveValue('prefer');
  });
});

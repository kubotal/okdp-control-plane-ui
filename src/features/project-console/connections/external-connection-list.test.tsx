import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Connection, ConnectionCatalog } from '../../../core/api/connection-api';

const catalog = vi.fn();
const consumers = vi.fn();
const list = vi.fn();
const create = vi.fn();
const test = vi.fn();
const remove = vi.fn();

vi.mock('../../../core/api/connection-api', () => ({
  connectionApi: {
    catalog: () => catalog(),
    consumers: (projectId: string, name: string) => consumers(projectId, name),
    project: () => ({ list, create, test, delete: remove, update: vi.fn() }),
    platform: () => ({ list, create, test, delete: remove, update: vi.fn() }),
  },
}));
// Decouples the delete dialog from the localStorage-backed preferences store.
vi.mock('../../../core/preferences/confirm-prefs-context', () => ({
  useConfirmPrefs: () => ({ typedDeleteEnabled: false, setTypedDeleteEnabled: vi.fn() }),
}));

import { ExternalConnectionList } from './external-connection-list';

const CATALOG: ConnectionCatalog = {
  crdAvailable: true,
  types: [
    {
      name: 'database-server',
      displayName: 'PostgreSQL',
      description: 'PostgreSQL database server.',
      icon: 'pi pi-database',
      category: 'database',
      external: true,
      fields: [
        { name: 'host', label: 'Host', type: 'string', required: true },
        { name: 'password', label: 'Password', type: 'string', required: true, secret: true },
      ],
    },
    {
      // Only ever discovered from a deployed service: it must not be offered
      // in the creation form.
      name: 'trino',
      displayName: 'Trino',
      description: 'Trino distributed SQL query engine.',
      icon: 'pi pi-server',
      category: 'query-engine',
      external: false,
      fields: [{ name: 'host', label: 'Host', type: 'string', required: true }],
    },
  ],
};

const WAREHOUSE: Connection = {
  name: 'warehouse',
  type: 'database-server',
  scope: 'project',
  namespace: 'demo',
  description: 'Corporate warehouse',
  status: 'Ready',
  values: { host: 'db.example.com' },
  secretFields: ['password'],
};

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/projects/demo/connections']}>
      <Routes>
        <Route path="/projects/:projectId/connections" element={<ExternalConnectionList />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Opens the creation dialog and fills the PostgreSQL fields, which the Test
 *  button requires — including the credential, since the test endpoint only
 *  ever sees what the form holds. */
async function openFilledDialog(name = 'warehouse-2') {
  fireEvent.click(screen.getByRole('button', { name: /Add connection/ }));

  await waitFor(() => expect(screen.getByLabelText('Connection name')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/^Host\b/), { target: { value: 'db.example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password\b/), { target: { value: 's3cret' } });
}

describe('ExternalConnectionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.mockResolvedValue(CATALOG);
    list.mockResolvedValue([WAREHOUSE]);
    create.mockResolvedValue(WAREHOUSE);
    remove.mockResolvedValue(undefined);
    consumers.mockResolvedValue([]);
  });

  it('lists the declared connections with their type', async () => {
    renderList();

    expect(await screen.findByText('warehouse')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Corporate warehouse')).toBeInTheDocument();
  });

  it('explains the situation and blocks creation while the CRDs are missing', async () => {
    catalog.mockResolvedValue({ ...CATALOG, crdAvailable: false });

    renderList();

    expect(await screen.findByText(/connection CRDs, which are not installed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add connection/ })).toBeDisabled();
  });

  it('offers no such warning once the CRDs are installed', async () => {
    renderList();
    await screen.findByText('warehouse');

    expect(screen.queryByText(/not installed/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add connection/ })).toBeEnabled();
  });

  it('only offers the types a user may declare by hand', async () => {
    renderList();
    await screen.findByText('warehouse');

    fireEvent.click(screen.getByRole('button', { name: /Add connection/ }));

    // The dropdown shows the selected type; Trino must never become one.
    await waitFor(() => expect(screen.getByLabelText('Type')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Type'));
    await waitFor(() => expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0));
    expect(screen.queryByText('Trino')).not.toBeInTheDocument();
  });

  it('reports a failed connection test with its reason instead of a raw error', async () => {
    test.mockResolvedValue({
      success: false,
      message: 'The server refused these credentials.',
      reason: 'auth-failed',
      durationMs: 42,
    });

    renderList();
    await screen.findByText('warehouse');
    await openFilledDialog();

    fireEvent.click(screen.getByRole('button', { name: /Test connection/ }));

    expect(
      await screen.findByText(/The server refused these credentials\. \(42 ms\)/),
    ).toBeInTheDocument();
  });

  it('reports a successful test', async () => {
    test.mockResolvedValue({ success: true, message: 'Connection successful.', durationMs: 12 });

    renderList();
    await screen.findByText('warehouse');
    await openFilledDialog();

    fireEvent.click(screen.getByRole('button', { name: /Test connection/ }));

    expect(await screen.findByText(/Connection successful\. \(12 ms\)/)).toBeInTheDocument();
  });

  it('will not test until every field, credential included, is filled', async () => {
    renderList();
    await screen.findByText('warehouse');
    fireEvent.click(screen.getByRole('button', { name: /Add connection/ }));

    await waitFor(() => expect(screen.getByLabelText(/^Host\b/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Test connection/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Host\b/), { target: { value: 'db.example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password\b/), { target: { value: 's3cret' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Test connection/ })).toBeEnabled(),
    );
  });

  it('shows an explicit empty state when nothing is declared', async () => {
    list.mockResolvedValue([]);

    renderList();

    expect(await screen.findByText(/No external connection yet/)).toBeInTheDocument();
  });

  // Deleting a connection takes its credentials Secret with it, and the pods
  // mounting that Secret fail at their next restart, far from this dialog. The
  // controller publishes who consumes what, so the dialog can name them.
  it('names the services bound to a connection before deleting it', async () => {
    consumers.mockResolvedValue([
      { service: 'hms', releaseName: 'demo-hms', status: 'READY', effective: true },
      { service: 'superset', releaseName: 'demo-superset', status: 'WAIT_ICNX', effective: false },
    ]);

    renderList();
    await screen.findByText('warehouse');
    fireEvent.click(screen.getByLabelText('Actions for warehouse'));
    fireEvent.click(await screen.findByText('Delete'));

    expect(await screen.findByText(/hms, superset/)).toBeInTheDocument();
    expect(screen.getByText(/fail to start at their next restart/)).toBeInTheDocument();
  });

  it('says so plainly when nothing is bound to it', async () => {
    renderList();
    await screen.findByText('warehouse');
    fireEvent.click(screen.getByLabelText('Actions for warehouse'));
    fireEvent.click(await screen.findByText('Delete'));

    expect(await screen.findByText(/No service of this project is bound to it/)).toBeInTheDocument();
  });

  // Not knowing is not the same as nobody, and the dialog must not imply it.
  it('does not claim the connection is unused when the check failed', async () => {
    consumers.mockRejectedValue(new Error('boom'));

    renderList();
    await screen.findByText('warehouse');
    fireEvent.click(screen.getByLabelText('Actions for warehouse'));
    fireEvent.click(await screen.findByText('Delete'));

    expect(await screen.findByText(/Could not check which services use/)).toBeInTheDocument();
  });
});

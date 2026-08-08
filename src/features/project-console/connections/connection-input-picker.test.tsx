import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ConnectionCatalog, SelectableConnection } from '../../../core/api/connection-api';
import type { PackageInput } from '../../../core/api/service-api';

const catalog = vi.fn();
const selectable = vi.fn();
const create = vi.fn();
const test = vi.fn();

vi.mock('../../../core/api/connection-api', () => ({
  connectionApi: {
    catalog: () => catalog(),
    selectable: (...args: unknown[]) => selectable(...args),
    project: () => ({ create, test }),
  },
}));

import { ConnectionInputPicker } from './connection-input-picker';

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
      fields: [{ name: 'host', label: 'Host', type: 'string', required: true }],
    },
    {
      name: 'trino',
      displayName: 'Trino',
      description: 'Trino query engine.',
      icon: 'pi pi-server',
      category: 'query-engine',
      external: false,
      fields: [],
    },
  ],
};

const SELECTABLE: SelectableConnection[] = [
  {
    name: 'rnacentral',
    scope: 'project',
    type: 'database-server',
    status: 'READY',
    description: 'Public database',
    managed: false,
  },
  {
    name: 'shared-pg',
    scope: 'platform',
    type: 'database-server',
    status: 'READY',
    managed: false,
  },
];

const INPUT: PackageInput = {
  alias: 'warehouse',
  interface: 'database-server',
  parameter: 'pgConnection',
  optional: true,
};

function renderPicker(input: PackageInput = INPUT, value = '', onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <ConnectionInputPicker projectId="demo" input={input} value={value} onChange={onChange} />,
    ),
  };
}

describe('ConnectionInputPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.mockResolvedValue(CATALOG);
    selectable.mockResolvedValue(SELECTABLE);
  });

  it('should offer the compatible connections, platform ones labelled', async () => {
    renderPicker();
    await waitFor(() => expect(selectable).toHaveBeenCalledWith('demo', 'database-server'));

    fireEvent.click(screen.getByRole('button', { name: /Select a connection/ }));

    expect(await screen.findByText('rnacentral')).toBeInTheDocument();
    expect(screen.getByText('shared-pg (platform)')).toBeInTheDocument();
  });

  it('should offer None when the package tolerates no connection', async () => {
    renderPicker();
    await waitFor(() => expect(selectable).toHaveBeenCalled());

    // Selected label and panel entry both say None — an optional input
    // defaults to it before any pick.
    expect((await screen.findAllByText('None')).length).toBeGreaterThan(0);
  });

  it('should not offer None on a required input', async () => {
    renderPicker({ ...INPUT, optional: false });
    await waitFor(() => expect(selectable).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Select a connection/ }));

    expect(await screen.findByText('rnacentral')).toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('should report the chosen connection name', async () => {
    const { onChange } = renderPicker();
    await waitFor(() => expect(selectable).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Select a connection/ }));
    fireEvent.click(await screen.findByText('rnacentral'));

    expect(onChange).toHaveBeenCalledWith('rnacentral');
  });

  it('should offer creating a connection for a user-declarable contract', async () => {
    renderPicker();

    expect(await screen.findByRole('button', { name: /New connection/ })).toBeInTheDocument();
  });

  // A trino connection exists because a Trino is deployed — there is nothing
  // a user could type into a creation form.
  it('should not offer creating for an internal-only contract', async () => {
    renderPicker({ alias: 'engine', interface: 'trino', parameter: 'trinoConnection', optional: true });
    await waitFor(() => expect(catalog).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /New connection/ })).not.toBeInTheDocument();
  });

  it('should create on the spot, then select the new connection', async () => {
    create.mockResolvedValue({ name: 'fresh-pg' });
    const { onChange } = renderPicker();

    fireEvent.click(await screen.findByRole('button', { name: /New connection/ }));
    fireEvent.change(screen.getByLabelText('Connection name'), {
      target: { value: 'fresh-pg' },
    });
    fireEvent.change(await screen.findByLabelText(/^Host\b/), {
      target: { value: 'db.corp.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and select/ }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'fresh-pg', type: 'database-server' }),
      ),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('fresh-pg'));
  });
});

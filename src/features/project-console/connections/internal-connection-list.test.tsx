import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { InternalConnection } from '../../../core/api/connection-api';

const listInternal = vi.fn();
vi.mock('../../../core/api/connection-api', () => ({
  connectionApi: {
    listInternal: (projectId: string) => listInternal(projectId),
  },
}));

import { InternalConnectionList } from './internal-connection-list';

const TRINO: InternalConnection = {
  name: 'demo-trino',
  type: 'trino',
  typeDisplay: 'Trino',
  icon: 'pi pi-server',
  category: 'query-engine',
  service: 'trino',
  releaseName: 'demo-trino',
  namespace: 'demo',
  status: 'Ready',
  endpoint: 'demo-trino.demo.svc.cluster.local:8080',
  host: 'demo-trino.demo.svc.cluster.local',
  port: 8080,
  values: {},
  managed: false,
};

const STORAGE: InternalConnection = {
  ...TRINO,
  name: 'demo-seaweedfs',
  type: 's3',
  typeDisplay: 'S3 object storage',
  service: 'seaweedfs',
  releaseName: 'demo-seaweedfs',
  endpoint: 'demo-seaweedfs.demo.svc.cluster.local:8333',
  host: 'demo-seaweedfs.demo.svc.cluster.local',
  port: 8333,
};

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/projects/demo/connections']}>
      <Routes>
        <Route path="/projects/:projectId/connections" element={<InternalConnectionList />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InternalConnectionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listInternal.mockResolvedValue([TRINO, STORAGE]);
  });

  it('lists what the project services expose, with their in-cluster endpoint', async () => {
    renderList();

    expect(await screen.findByText('demo-trino')).toBeInTheDocument();
    expect(screen.getByText('Trino')).toBeInTheDocument();
    expect(screen.getByText('demo-trino.demo.svc.cluster.local:8080')).toBeInTheDocument();
  });

  it('filters the list, so a Trino is findable among a project’s services', async () => {
    renderList();
    await screen.findByText('demo-trino');
    expect(screen.getByText('demo-seaweedfs')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Filter connections...'), {
      target: { value: 'trino' },
    });

    await waitFor(() => expect(screen.queryByText('demo-seaweedfs')).not.toBeInTheDocument());
    expect(screen.getByText('demo-trino')).toBeInTheDocument();
  });

  // Some contracts carry no address at all: oidc publishes an issuer and its
  // endpoints, not a host. Saying so beats inventing one.
  it('says a contract has no address rather than showing one that would not resolve', async () => {
    listInternal.mockResolvedValue([{ ...TRINO, endpoint: '', host: '', port: 0 }]);

    renderList();

    expect(await screen.findByText('no address')).toBeInTheDocument();
  });

  it('copies the endpoint so it can be pasted into another service configuration', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderList();
    await screen.findByText('demo-trino');

    fireEvent.click(screen.getByLabelText('Copy the endpoint of demo-trino'));

    expect(writeText).toHaveBeenCalledWith('demo-trino.demo.svc.cluster.local:8080');
    // The confirmation toast lands after the clipboard promise settles.
    await screen.findByText('Copied demo-trino.demo.svc.cluster.local:8080');
  });

  it('offers no copy action while the endpoint is unresolved', async () => {
    listInternal.mockResolvedValue([{ ...TRINO, endpoint: '', host: '', port: 0 }]);

    renderList();
    await screen.findByText('demo-trino');

    expect(screen.getByLabelText('Copy the endpoint of demo-trino')).toBeDisabled();
  });

  it('shows an explicit empty state when no service exposes anything', async () => {
    listInternal.mockResolvedValue([]);

    renderList();

    expect(await screen.findByText(/No service in this project exposes a connection/)).toBeInTheDocument();
  });
});

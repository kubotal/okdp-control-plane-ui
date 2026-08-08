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

  it('lists the connections the project services publish', async () => {
    renderList();

    expect(await screen.findByText('demo-trino')).toBeInTheDocument();
    expect(screen.getByText('Trino')).toBeInTheDocument();
  });

  // The address column went with the usage block: an address is something the
  // controller resolves, not something to copy into another form. It stays
  // readable in the detail panel, as a value of the contract.
  it('does not put an address on the row', async () => {
    renderList();
    await screen.findByText('demo-trino');

    expect(screen.queryByText('demo-trino.demo.svc.cluster.local:8080')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Copy the endpoint/)).not.toBeInTheDocument();
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




  it('shows an explicit empty state when no service exposes anything', async () => {
    listInternal.mockResolvedValue([]);

    renderList();

    expect(await screen.findByText(/No service in this project exposes a connection/)).toBeInTheDocument();
  });
});

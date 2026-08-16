import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from './admin-page';
import { CapabilitiesProvider } from '../../core/context/capabilities-context';
import { capabilitiesApi, type Capabilities } from '../../core/api/capabilities-api';

vi.mock('../../core/api/capabilities-api', () => ({
  capabilitiesApi: { get: vi.fn() },
}));

const get = vi.mocked(capabilitiesApi.get);

function caps(userManagement: boolean): Capabilities {
  return {
    identity: { provider: userManagement ? 'kubauth' : 'external', userManagement },
    oidcProvisioning: { provider: 'none' },
  };
}

function renderAdmin() {
  render(
    <MemoryRouter>
      <CapabilitiesProvider>
        <AdminPage />
      </CapabilitiesProvider>
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers Identity on a kubauth platform', async () => {
    get.mockResolvedValue(caps(true));

    renderAdmin();

    expect(await screen.findByText('Identity')).toBeTruthy();
  });

  // The tile used to be there whatever the platform ran on, and led to a screen
  // whose every call came back unavailable.
  it('drops the Identity tile when the platform serves no user management', async () => {
    get.mockResolvedValue(caps(false));

    renderAdmin();

    // Projects proves the page finished rendering, so the absence below is a
    // decision and not a snapshot taken too early.
    expect(await screen.findByText('Projects')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Identity')).toBeNull());
    expect(screen.getByText('Service Catalog')).toBeTruthy();
  });
});

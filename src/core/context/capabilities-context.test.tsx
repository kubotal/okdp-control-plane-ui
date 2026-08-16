import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CapabilitiesProvider, useCapabilities } from './capabilities-context';
import { capabilitiesApi, type Capabilities } from '../api/capabilities-api';

vi.mock('../api/capabilities-api', () => ({
  capabilitiesApi: { get: vi.fn() },
}));

const get = vi.mocked(capabilitiesApi.get);

function caps(userManagement: boolean, provider: string): Capabilities {
  return {
    identity: { provider, userManagement },
    oidcProvisioning: { provider: 'none' },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <CapabilitiesProvider>{children}</CapabilitiesProvider>;
}

describe('CapabilitiesProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('follows the platform when it serves user management', async () => {
    get.mockResolvedValue(caps(true, 'kubauth'));

    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userManagement).toBe(true);
    expect(result.current.capabilities?.identity.provider).toBe('kubauth');
  });

  // The point of the lot: on a platform with its own OIDC provider the Identity
  // area has nothing to manage, so it is hidden rather than left leading to a
  // screen that can only report itself unavailable.
  it('reports no user management on an external provider', async () => {
    get.mockResolvedValue(caps(false, 'external'));

    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userManagement).toBe(false);
  });

  // A server predating the endpoint answers an error. Hiding the area then
  // would remove a working screen, so the absent answer keeps everything
  // visible and the server's own 501 stays the fallback.
  it('keeps the area visible when the platform does not answer', async () => {
    get.mockRejectedValue(new Error('404 Not Found'));

    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.capabilities).toBeNull();
    expect(result.current.userManagement).toBe(true);
  });

  it('is read once, not per consumer', async () => {
    get.mockResolvedValue(caps(true, 'kubauth'));

    const { result, rerender } = renderHook(() => useCapabilities(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();

    expect(get).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signinRedirect: vi.fn(),
  signoutRedirect: vi.fn(),
  removeUser: vi.fn(),
  signinRedirectCallback: vi.fn(),
  events: {
    addUserLoaded: vi.fn(),
    addUserUnloaded: vi.fn(),
    removeUserLoaded: vi.fn(),
    removeUserUnloaded: vi.fn(),
    addSilentRenewError: vi.fn(),
    removeSilentRenewError: vi.fn(),
    addAccessTokenExpired: vi.fn(),
    removeAccessTokenExpired: vi.fn(),
  },
}));

vi.mock('oidc-client-ts', () => {
  class UserManager {
    getUser = mocks.getUser;
    signinRedirect = mocks.signinRedirect;
    signoutRedirect = mocks.signoutRedirect;
    removeUser = mocks.removeUser;
    signinRedirectCallback = mocks.signinRedirectCallback;
    events = mocks.events;
  }
  class WebStorageStateStore {}
  const Log = { setLogger: vi.fn(), setLevel: vi.fn(), DEBUG: 4 };
  return { UserManager, WebStorageStateStore, Log, User: class {} };
});

import { AuthProvider, useAuth } from './auth-context';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function mockUser(profile: Record<string, unknown>, accessToken = 'mock-token') {
  return { expired: false, profile, access_token: accessToken };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getUser.mockResolvedValue(null);
    mocks.signinRedirect.mockResolvedValue(undefined);
    mocks.signoutRedirect.mockResolvedValue(undefined);
    mocks.removeUser.mockResolvedValue(undefined);
  });

  describe('Initialization', () => {
    it('should set ready to true after the auth check completes', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should set authenticated state when a valid user session exists', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123', name: 'Test User' }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.profile?.name).toBe('Test User');
    });
  });

  describe('Login/Logout', () => {
    it('should call signinRedirect on login', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      act(() => result.current.login());
      expect(mocks.signinRedirect).toHaveBeenCalled();
    });

    it('should call signoutRedirect and clear state on logout', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123' }));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      act(() => result.current.logout());
      expect(mocks.signoutRedirect).toHaveBeenCalled();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    });

    it('should force local logout on signout error', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123' }));
      mocks.signoutRedirect.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      act(() => result.current.logout());

      await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
      expect(consoleSpy).toHaveBeenCalled();
      expect(mocks.removeUser).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should clear local storage keys on forceLogout', async () => {
      sessionStorage.setItem('auth_return_url', '/somewhere');
      sessionStorage.setItem('okdp-selected-projectId', 'proj-a');
      sessionStorage.setItem('okdp-sql-query:proj-a', 'SELECT secret FROM t');

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      act(() => result.current.forceLogout());

      expect(sessionStorage.getItem('auth_return_url')).toBeNull();
      expect(sessionStorage.getItem('okdp-selected-projectId')).toBeNull();
      expect(sessionStorage.getItem('okdp-sql-query:proj-a')).toBeNull();
    });
  });

  describe('Session expiry events', () => {
    it('should drop the session when the access token expires', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123' }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      const onExpired = mocks.events.addAccessTokenExpired.mock.calls[0][0];
      act(() => onExpired());

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should keep the session on a silent renew error (log only)', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123' }));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      const onRenewError = mocks.events.addSilentRenewError.mock.calls[0][0];
      act(() => onRenewError(new Error('renew failed')));

      expect(result.current.isAuthenticated).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Roles', () => {
    it('should read the roles from the configured claim', async () => {
      mocks.getUser.mockResolvedValue(
        mockUser({ sub: '123', groups: ['platform_admin', 'auditor'] }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      expect(result.current.hasRole('platform_admin')).toBe(true);
      expect(result.current.hasRole('superusers')).toBe(false);
      expect(result.current.isAdmin).toBe(true);
    });

    // The bug this test exists for: rolesClaim pointed at realm_access.roles,
    // which Keycloak puts in the ACCESS token only. The profile comes from the
    // ID token, so the console read nothing and locked its own admin out while
    // the token plainly carried platform_admin.
    it('should grant nothing when the claim is absent from the ID token', async () => {
      mocks.getUser.mockResolvedValue(
        mockUser({ sub: '123', realm_access: { roles: ['platform_admin'] } }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      // Nothing is granted, and the reason is said out loud rather than guessed.
      expect(result.current.roles).toEqual([]);
      expect(result.current.isAdmin).toBe(false);
    });

    it('should grant nothing when the claim holds the wrong shape', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123', groups: 'platform_admin' }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      expect(result.current.roles).toEqual([]);
      expect(result.current.isAdmin).toBe(false);
    });
  });

  describe('Token', () => {
    it('should return the access token', async () => {
      mocks.getUser.mockResolvedValue(mockUser({ sub: '123' }, 'mock-token'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      const token = await result.current.token();
      expect(token).toBe('mock-token');
    });

    it('should return undefined when no user session exists', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      const token = await result.current.token();
      expect(token).toBeUndefined();
    });

    it('should return undefined when the stored token is expired', async () => {
      mocks.getUser.mockResolvedValue({
        expired: true,
        profile: { sub: '123' },
        access_token: 'dead-token',
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));

      const token = await result.current.token();
      expect(token).toBeUndefined();
    });
  });

  describe('Profile mapping', () => {
    it('should derive username and names from OIDC claims', async () => {
      mocks.getUser.mockResolvedValue(
        mockUser({
          sub: '123',
          preferred_username: 'jdoe',
          given_name: 'John',
          family_name: 'Doe',
        }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      expect(result.current.profile?.username).toBe('jdoe');
      expect(result.current.profile?.firstName).toBe('John');
      expect(result.current.profile?.lastName).toBe('Doe');
    });
  });
});

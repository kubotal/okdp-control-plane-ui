import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLayoutEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AUTH_RETURN_URL_KEY } from '../storage-keys';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock('./auth-context', () => ({ useAuth: mocks.useAuth }));
vi.mock('../api/http', () => ({ setUnauthorizedHandler: mocks.setUnauthorizedHandler }));

import { AuthRedirector, RootRedirect } from './auth-redirector';

let currentPath = '';

// shouldRedirect reads window.location.pathname while navigation happens in
// the MemoryRouter, so mirror the router location into window.history the
// way BrowserRouter would.
function LocationProbe() {
  const { pathname } = useLocation();
  currentPath = pathname;
  useLayoutEffect(() => {
    window.history.replaceState({}, '', pathname);
  }, [pathname]);
  return null;
}

// Flush pending effects so that any (unwanted) redirect has a chance to run.
const flushEffects = () => act(() => Promise.resolve());

function authState(roles: string[] = []) {
  return {
    ready: true,
    isAuthenticated: true,
    profile: { username: 'jdoe' },
    roles,
    hasRole: (role: string) => roles.includes(role),
    // The realm's administrator role, not a name this bundle picks.
    isAdmin: roles.includes('platform_admin'),
    forceLogout: vi.fn(),
  };
}

function renderAt(path: string) {
  window.history.replaceState({}, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthRedirector />
      <LocationProbe />
    </MemoryRouter>,
  );
}

// Mirrors the app tree at '/': AuthRedirector plus the index RootRedirect,
// whose <Navigate> effect flushes in the same commit as the restore.
function renderAtRoot() {
  window.history.replaceState({}, '', '/');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthRedirector />
      <LocationProbe />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthRedirector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    currentPath = '';
    mocks.useAuth.mockReturnValue(authState());
  });

  describe('Deep links', () => {
    it('should keep a /projects deep link (regression: redirect loop after React migration)', async () => {
      renderAt('/projects/test');
      await flushEffects();

      expect(currentPath).toBe('/projects/test');
    });

    it('should keep an /identity deep link', async () => {
      renderAt('/identity');
      await flushEffects();

      expect(currentPath).toBe('/identity');
    });

    it('should keep a /settings deep link (regression: bounced back to the project)', async () => {
      renderAt('/settings');
      await flushEffects();

      expect(currentPath).toBe('/settings');
    });

    it('should keep an /admin deep link', async () => {
      renderAt('/admin');
      await flushEffects();

      expect(currentPath).toBe('/admin');
    });
  });

  describe('Post-login routing', () => {
    it('should route an authenticated user from /login to /home', async () => {
      renderAt('/login');

      await waitFor(() => expect(currentPath).toBe('/home'));
    });

    it('should land an operator with admin access on /admin', async () => {
      mocks.useAuth.mockReturnValue(authState(['platform_admin']));

      renderAt('/login');

      await waitFor(() => expect(currentPath).toBe('/admin'));
    });

    it('should leave /home alone for an admin, so the header link still reaches their project', async () => {
      mocks.useAuth.mockReturnValue(authState(['platform_admin']));

      renderAt('/home');
      await flushEffects();

      expect(currentPath).toBe('/home');
    });

    it('should restore and consume the saved return URL', async () => {
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, '/projects/test/services');

      renderAt('/login');

      await waitFor(() => expect(currentPath).toBe('/projects/test/services'));
      expect(sessionStorage.getItem(AUTH_RETURN_URL_KEY)).toBeNull();
    });

    it('should consume the return URL without navigating when already there', async () => {
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, '/projects/test');

      renderAt('/projects/test');
      await flushEffects();

      expect(currentPath).toBe('/projects/test');
      expect(sessionStorage.getItem(AUTH_RETURN_URL_KEY)).toBeNull();
    });

    it('should let a restored deep link win over the index /home redirect', async () => {
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, '/projects/test/services');

      renderAtRoot();

      await waitFor(() => expect(currentPath).toBe('/projects/test/services'));
      await flushEffects();
      expect(currentPath).toBe('/projects/test/services');
      expect(sessionStorage.getItem(AUTH_RETURN_URL_KEY)).toBeNull();
    });

    it('should fall back to /home from the index route when no return URL is saved', async () => {
      renderAtRoot();

      await waitFor(() => expect(currentPath).toBe('/home'));
    });

    it('should land an admin on /admin from the index route (regression: RootRedirect won the race to /home)', async () => {
      mocks.useAuth.mockReturnValue(authState(['platform_admin']));

      renderAtRoot();

      await waitFor(() => expect(currentPath).toBe('/admin'));
    });

    it('should let a restored deep link win over the admin landing on the index route', async () => {
      mocks.useAuth.mockReturnValue(authState(['platform_admin']));
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, '/projects/test/services');

      renderAtRoot();

      await waitFor(() => expect(currentPath).toBe('/projects/test/services'));
    });

    it('should hold the index route until auth is ready, then land the admin on /admin', async () => {
      mocks.useAuth.mockReturnValue({ ...authState(['platform_admin']), ready: false });

      const view = renderAtRoot();
      await flushEffects();
      expect(currentPath).toBe('/');

      mocks.useAuth.mockReturnValue(authState(['platform_admin']));
      view.rerender(
        <MemoryRouter initialEntries={['/']}>
          <AuthRedirector />
          <LocationProbe />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(currentPath).toBe('/admin'));
    });

    it('should keep the deep link saved before auth was ready (regression: re-read of the consumed key)', async () => {
      mocks.useAuth.mockReturnValue({ ...authState(['platform_admin']), ready: false });
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, '/settings');

      const view = renderAtRoot();
      await flushEffects();

      mocks.useAuth.mockReturnValue(authState(['platform_admin']));
      view.rerender(
        <MemoryRouter initialEntries={['/']}>
          <AuthRedirector />
          <LocationProbe />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(currentPath).toBe('/settings'));
    });
  });

  describe('Unauthorized handler', () => {
    it('should re-save the interrupted page after the 401 forced logout cleared it', async () => {
      const forceLogout = vi.fn(() => sessionStorage.removeItem(AUTH_RETURN_URL_KEY));
      mocks.useAuth.mockReturnValue({
        ready: true,
        isAuthenticated: false,
        profile: null,
        roles: [],
        forceLogout,
      });

      renderAt('/projects/test/services');
      await flushEffects();

      const handler = mocks.setUnauthorizedHandler.mock.calls.at(-1)![0];
      act(() => handler(401));

      expect(forceLogout).toHaveBeenCalled();
      expect(sessionStorage.getItem(AUTH_RETURN_URL_KEY)).toBe('/projects/test/services');
      await waitFor(() => expect(currentPath).toBe('/login'));
    });

    it('should keep the re-saved return URL when parallel 401s fire in a burst', async () => {
      const forceLogout = vi.fn(() => sessionStorage.removeItem(AUTH_RETURN_URL_KEY));
      mocks.useAuth.mockReturnValue({
        ready: true,
        isAuthenticated: false,
        profile: null,
        roles: [],
        forceLogout,
      });

      renderAt('/projects/test/services');
      await flushEffects();

      const handler = mocks.setUnauthorizedHandler.mock.calls.at(-1)![0];
      act(() => handler(401));
      await waitFor(() => expect(currentPath).toBe('/login'));

      // The remaining 401s of the same burst arrive once we are already on
      // /login — they must not force-logout again and wipe the saved link.
      act(() => handler(401));

      expect(forceLogout).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(AUTH_RETURN_URL_KEY)).toBe('/projects/test/services');
    });
  });

  it('should not redirect while unauthenticated', async () => {
    mocks.useAuth.mockReturnValue({
      ready: true,
      isAuthenticated: false,
      profile: null,
      roles: [],
      forceLogout: vi.fn(),
    });

    renderAt('/login');
    await flushEffects();

    expect(currentPath).toBe('/login');
  });
});

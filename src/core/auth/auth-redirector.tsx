import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { setUnauthorizedHandler } from '../api/http';
import { AUTH_RETURN_URL_KEY } from '../storage-keys';
import { logger } from '../services/logger';

function shouldRedirect(target: string): boolean {
  // Use window.location.pathname to get the absolute truth from the browser
  const current = window.location.pathname;

  // Only the transitional routes get forwarded to the landing page; any
  // other path (/settings, /admin, /projects/…) is a deep link that must
  // never be clobbered. This keeps the effect idempotent — it re-runs on
  // every navigation because `navigate` changes identity with the location.
  const transitionalPaths = ['/', '/login'];
  return transitionalPaths.includes(current) && current !== target;
}

/**
 * Post-login navigation (AuthRedirectService equivalent): once the user is
 * authenticated, restore the saved deep link, or land an admin on /admin and
 * everyone else on /home, which routes to the default project (or the
 * getting-started view). Also registers the 401/403 handler that forces a
 * logout and returns to the login page (auth interceptor equivalent).
 */
export function AuthRedirector() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler((status) => {
      // Parallel requests fail together when the session dies, so the handler
      // fires once per 401. Only the first may act: a second forceLogout
      // (after navigate() has put us on /login) would wipe the return URL
      // re-saved below and the user would lose their place.
      if (window.location.pathname.includes('login')) {
        return;
      }
      logger.warn(`Caught ${status} error. Session may have expired.`);
      auth.forceLogout();
      // forceLogout clears the saved return URL — re-save the interrupted
      // page so re-login lands back on it (same guard as auth-context).
      const { pathname, search } = window.location;
      if (pathname !== '/' && pathname !== '/index.html') {
        sessionStorage.setItem(AUTH_RETURN_URL_KEY, pathname + search);
      }
      navigate('/login?sessionExpired=true');
    });
    return () => setUnauthorizedHandler(null);
  }, [auth, navigate]);

  useEffect(() => {
    if (!auth.ready || !auth.isAuthenticated) {
      return;
    }

    // Check for saved return URL. Replace (not push) in both branches, and
    // skip the no-op navigation: pushing the current URL or stacking /home
    // entries on every effect re-run creates a back-button trap.
    const returnUrl = sessionStorage.getItem(AUTH_RETURN_URL_KEY);
    if (returnUrl) {
      sessionStorage.removeItem(AUTH_RETURN_URL_KEY);
      if (returnUrl !== window.location.pathname + window.location.search) {
        navigate(returnUrl, { replace: true });
      }
      return;
    }

    // Landing only: /home stays the shared entry point for the header link.
    if (shouldRedirect('/home')) {
      navigate(auth.isAdmin ? '/admin' : '/home', { replace: true });
    }
  }, [auth, navigate]);

  return null;
}

/**
 * '/' index target: consume a pending saved deep link, falling back to /admin
 * for operators with admin access and /home for everyone else — the same
 * landing rule as AuthRedirector, which only sees the /login entry because
 * this Navigate wins the race on '/'. Must be the route element itself — a
 * plain <Navigate to="/home"> at '/' flushes its effect in the same commit as
 * AuthRedirector's restore and would clobber the freshly restored deep link.
 * Anonymous visits still end at /login via /home's RequireAuth (which
 * re-saves the link).
 */
export function RootRedirect() {
  const auth = useAuth();
  // Capture once in a state initializer: the key is consumed below, and a
  // re-render after auth.ready flips must not re-read the now-empty storage
  // (StrictMode double-invokes the initializer before the effect runs, so
  // both passes still see the URL).
  const [returnUrl] = useState(() => sessionStorage.getItem(AUTH_RETURN_URL_KEY));
  useEffect(() => {
    sessionStorage.removeItem(AUTH_RETURN_URL_KEY);
  }, []);
  // Routing before `ready` would send a logged-in admin to /home because the
  // roles are not loaded yet; RequireAuth applies the same wait further down.
  if (!auth.ready) {
    return null;
  }
  return <Navigate to={returnUrl || (auth.isAdmin ? '/admin' : '/home')} replace />;
}

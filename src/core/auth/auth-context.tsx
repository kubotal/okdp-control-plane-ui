/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Log, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { environment } from '../../config/environment';
import { logger } from '../services/logger';
import { setAuthTokenProvider } from '../api/http';
import { AUTH_RETURN_URL_KEY, PROJECT_STORAGE_KEY, SQL_QUERY_KEY } from '../storage-keys';
import type { UserProfile } from './user-profile';

export interface AuthState {
  ready: boolean;
  isAuthenticated: boolean;
  profile: UserProfile | null;
  roles: string[];
}

export interface AuthContextValue extends AuthState {
  login: () => void;
  logout: () => void;
  forceLogout: () => void;
  token: () => Promise<string | undefined>;
  hasRole: (role: string) => boolean;
  /** Whether the caller holds the role the cluster designates as its
   *  administrator one. Callers must not name that role themselves: it differs
   *  from realm to realm, which is exactly what made the hardcoded one wrong. */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createUserManager(): UserManager {
  if (!environment.production && environment.oidc.logLevel.toLowerCase() === 'debug') {
    Log.setLogger(console);
    Log.setLevel(Log.DEBUG);
  }

  return new UserManager({
    authority: environment.oidc.authority,
    client_id: environment.oidc.clientId,
    redirect_uri: environment.oidc.redirectUri,
    post_logout_redirect_uri: environment.oidc.postLogoutRedirectUri,
    scope: environment.oidc.scope,
    response_type: environment.oidc.responseType,
    automaticSilentRenew: environment.oidc.silentRenew,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
}

function isOidcCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('state') && (params.has('code') || params.has('error'));
}

/** Read the configured claim out of the ID token, following dots. It must be an
 *  ID token claim: Keycloak keeps realm_access.roles in the access token only,
 *  which the console never sees. */
export function readRoles(claims: unknown, path: string): string[] {
  let current: unknown = claims;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') {
      logger.warn(
        `No "${path}" claim in the ID token, so every role check fails. Claims present: ` +
          (claims && typeof claims === 'object' ? Object.keys(claims).join(', ') : '(none)'),
      );
      return [];
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (!Array.isArray(current)) {
    logger.warn(`The "${path}" claim is not a list of roles, so no role is granted.`);
    return [];
  }
  return current.filter((r): r is string => typeof r === 'string');
}

function toAuthState(user: User | null): Pick<AuthState, 'isAuthenticated' | 'profile' | 'roles'> {
  if (!user || user.expired) {
    return { isAuthenticated: false, profile: null, roles: [] };
  }
  const userData = user.profile as unknown as UserProfile;
  const profile: UserProfile = {
    ...userData,
    username: userData.preferred_username || userData.username || userData.sub,
    firstName: (userData.given_name || userData.firstName || userData.name) as string | undefined,
    lastName: userData.family_name || userData.lastName,
  };
  return {
    isAuthenticated: true,
    profile,
    roles: readRoles(userData, environment.identity.rolesClaim),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const userManagerRef = useRef<UserManager | null>(null);
  if (!userManagerRef.current) {
    userManagerRef.current = createUserManager();
  }
  const userManager = userManagerRef.current;
  const initPromiseRef = useRef<Promise<boolean> | null>(null);

  const [state, setState] = useState<AuthState>({
    ready: false,
    isAuthenticated: false,
    profile: null,
    roles: [],
  });

  const clearLocalState = useCallback(() => {
    setState((s) => ({ ...s, isAuthenticated: false, profile: null, roles: [] }));
    sessionStorage.removeItem(AUTH_RETURN_URL_KEY);
    sessionStorage.removeItem(PROJECT_STORAGE_KEY);
    // SQL drafts are keyed per project under this prefix and may embed
    // sensitive literals — sweep them all so they don't outlive the session.
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(SQL_QUERY_KEY)) {
        sessionStorage.removeItem(key);
      }
    }
  }, []);

  const login = useCallback(() => {
    userManager.signinRedirect().catch((err) => logger.error('Login redirect failed', err));
  }, [userManager]);

  const forceLogout = useCallback(() => {
    userManager.removeUser().catch(() => undefined);
    clearLocalState();
  }, [userManager, clearLocalState]);

  const logout = useCallback(() => {
    // Try OIDC logout, but ensure local cleanup happens regardless
    userManager
      .signoutRedirect()
      .then(() => clearLocalState())
      .catch((err) => {
        logger.error('Logout error, forcing local cleanup', err);
        // Even if OIDC logout fails (network error, expired token),
        // we still clear local state
        forceLogout();
      });
  }, [userManager, clearLocalState, forceLogout]);

  const token = useCallback(async (): Promise<string | undefined> => {
    const user = await userManager.getUser();
    // An expired token would only buy a 401 round-trip — send none instead.
    return user && !user.expired ? user.access_token : undefined;
  }, [userManager]);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);

    // Strip the one-shot autoLogin param before the deep-link save below, so
    // the restored URL doesn't re-trigger auto-login on the next full reload.
    const autoLoginRequested = currentUrl.searchParams.has('autoLogin');
    if (autoLoginRequested) {
      currentUrl.searchParams.delete('autoLogin');
      window.history.replaceState(
        {},
        '',
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }

    // Save current URL for restoration after the login redirect, if it's a
    // deep link (and not the landing/login page or an OIDC callback).
    if (
      !isOidcCallback() &&
      currentUrl.pathname !== '/' &&
      currentUrl.pathname !== '/index.html' &&
      !currentUrl.pathname.includes('login')
    ) {
      sessionStorage.setItem(AUTH_RETURN_URL_KEY, currentUrl.pathname + currentUrl.search);
    }

    const applyUser = (user: User | null) => {
      setState((s) => ({ ...s, ...toAuthState(user) }));
    };

    const init = async () => {
      try {
        if (isOidcCallback()) {
          const user = await userManager.signinRedirectCallback();
          // Strip OIDC params from the URL
          window.history.replaceState({}, '', window.location.pathname);
          applyUser(user);
          return true;
        }
        const user = await userManager.getUser();
        applyUser(user && !user.expired ? user : null);
        return !!user && !user.expired;
      } catch (err) {
        logger.error('OIDC Initialization failed', err);
        return false;
      }
    };

    // Run the auth check exactly once: StrictMode re-runs this effect while
    // the first init() is still awaiting the token exchange, and a second
    // signinRedirectCallback() would redeem the single-use authorization
    // code twice (IdPs may revoke the issued tokens on code reuse).
    if (!initPromiseRef.current) {
      initPromiseRef.current = init();
    }
    initPromiseRef.current.then((isAuthenticated) => {
      // Mark as ready in all cases so the app can load
      setState((s) => ({ ...s, ready: true }));
      if (autoLoginRequested && !isAuthenticated) {
        login();
      }
    });

    // Keep state in sync with silent renew / session changes. A silent-renew
    // failure may be transient (it fires well before expiry and only timeouts
    // are retried), so it is only logged — the session is dropped when the
    // access token actually expires.
    const onUserLoaded = (user: User) => applyUser(user);
    const onUserUnloaded = () => applyUser(null);
    const onSilentRenewError = (err: Error) => logger.error('OIDC silent renew failed', err);
    const onAccessTokenExpired = () => applyUser(null);
    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addSilentRenewError(onSilentRenewError);
    userManager.events.addAccessTokenExpired(onAccessTokenExpired);

    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeSilentRenewError(onSilentRenewError);
      userManager.events.removeAccessTokenExpired(onAccessTokenExpired);
    };
  }, [userManager, login]);

  // Wire the fetch wrapper (interceptor equivalent)
  useEffect(() => {
    setAuthTokenProvider(token);
    return () => setAuthTokenProvider(null);
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      forceLogout,
      token,
      hasRole: (role: string) => state.roles.includes(role),
      isAdmin: state.roles.includes(environment.identity.adminRole),
    }),
    [state, login, logout, forceLogout, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

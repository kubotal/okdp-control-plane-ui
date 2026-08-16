import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { PrimeReactProvider } from 'primereact/api';
import { AuthProvider, useAuth } from './core/auth/auth-context';
import { AuthRedirector } from './core/auth/auth-redirector';
import { ProjectContextProvider } from './core/context/project-context';
import { CapabilitiesProvider } from './core/context/capabilities-context';
import { ThemeProvider } from './core/theme/theme-context';
import { EnvBarProvider } from './core/preferences/env-bar-context';
import { NavPrefsProvider } from './core/preferences/nav-prefs-context';
import { CustomViewsProvider } from './core/preferences/custom-views-context';
import { ConfirmPrefsProvider } from './core/preferences/confirm-prefs-context';
import { AppRoutes } from './app-routes';

// Gate rendering until the OIDC check completes (APP_INITIALIZER equivalent)
function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth();
  if (!ready) {
    return null;
  }
  return children;
}

// Scroll to top on navigation (withInMemoryScrolling equivalent)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <PrimeReactProvider value={{ ripple: true }}>
      <ThemeProvider>
        <EnvBarProvider>
          <NavPrefsProvider>
            <CustomViewsProvider>
              <ConfirmPrefsProvider>
                <BrowserRouter>
                  <ScrollToTop />
                  <AuthProvider>
                    <AuthGate>
                      <AuthRedirector />
                      <CapabilitiesProvider>
                        <ProjectContextProvider>
                          <AppRoutes />
                        </ProjectContextProvider>
                      </CapabilitiesProvider>
                    </AuthGate>
                  </AuthProvider>
                </BrowserRouter>
              </ConfirmPrefsProvider>
            </CustomViewsProvider>
          </NavPrefsProvider>
        </EnvBarProvider>
      </ThemeProvider>
    </PrimeReactProvider>
  );
}

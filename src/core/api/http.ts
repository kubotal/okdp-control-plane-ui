// Minimal fetch wrapper replacing Angular's HttpClient.
//
// - Attaches the OIDC access token to secure routes (any URL containing
//   '/api/'), mirroring the `secureRoutes` config of the Angular app.
// - On 401/403 responses, invokes the registered unauthorized handler
//   (forced logout + redirect to login), mirroring the auth interceptor.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    url: string,
  ) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = 'HttpError';
  }
}

type TokenProvider = () => Promise<string | undefined>;
type UnauthorizedHandler = (status: number) => void;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setAuthTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function isSecureRoute(url: string): boolean {
  return url.includes('/api/');
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (isSecureRoute(url) && tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      unauthorizedHandler?.(response.status);
    }
    const body = await response.text().catch(() => '');
    throw new HttpError(response.status, response.statusText, body, url);
  }

  return response;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  // Empty/204 bodies resolve `undefined` despite the `T` typing — tolerated so
  // mutation endpoints returning no content keep working. Lists go through
  // `getList`, which normalizes this to [].
  return (text ? JSON.parse(text) : undefined) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Extract the backend `error` (or `message`) field from a failed request,
 * with fallback — the OKDP server reports validation failures as
 * `{"error": "..."}`, so this surfaces e.g. "version not found in registry".
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpError && err.body) {
    try {
      const parsed = JSON.parse(err.body);
      if (parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (parsed && typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      // not JSON — fall through
    }
  }
  return fallback;
}

/**
 * A feature the server does not implement on this cluster, because the CRDs it
 * rests on are not installed: kubauth for identity, external-secrets for the
 * vault integration. The server answers 501 and names the feature, so a screen
 * can say "not installed here" instead of the red panel it shows for a server
 * that actually broke. Returns the feature name, or null for any other error.
 */
export function unavailableFeature(err: unknown): string | null {
  if (!(err instanceof HttpError) || err.status !== 501 || !err.body) {
    return null;
  }
  try {
    const parsed = JSON.parse(err.body);
    // The reason is the contract; the message is prose and may be reworded.
    if (parsed?.reason === 'feature-not-installed') {
      return typeof parsed.feature === 'string' && parsed.feature ? parsed.feature : 'this feature';
    }
  } catch {
    // not JSON — not one of ours
  }
  return null;
}

const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  at: number;
  value: Promise<unknown>;
}

const getCache = new Map<string, CacheEntry>();

export function clearApiCache(): void {
  getCache.clear();
}

function cachedGet<T>(url: string, init: RequestInit | undefined, fetcher: () => Promise<T>): Promise<T> {
  if (init) {
    return fetcher();
  }
  const hit = getCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value as Promise<T>;
  }
  const value = fetcher();
  getCache.set(url, { at: Date.now(), value });
  value.catch(() => getCache.delete(url));
  return value;
}

export const http = {
  async get<T>(url: string, init?: RequestInit): Promise<T> {
    return cachedGet(url, init, async () => parseJson<T>(await request(url, init)));
  },

  async getList<T>(url: string, init?: RequestInit): Promise<T[]> {
    return cachedGet(url, init, async () => (await parseJson<T[] | undefined>(await request(url, init))) ?? []);
  },

  async getText(url: string, init?: RequestInit): Promise<string> {
    return (await request(url, init)).text();
  },

  async post<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    clearApiCache();
    return parseJson<T>(await request(url, { ...jsonInit('POST', body), ...init }));
  },

  async put<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    clearApiCache();
    return parseJson<T>(await request(url, { ...jsonInit('PUT', body), ...init }));
  },

  async patch<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
    clearApiCache();
    return parseJson<T>(await request(url, { ...jsonInit('PATCH', body), ...init }));
  },

  async delete(url: string, init?: RequestInit): Promise<void> {
    clearApiCache();
    await request(url, { ...init, method: 'DELETE' });
  },
};

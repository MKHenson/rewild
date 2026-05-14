import { authService } from './auth-service';

const API_BASE_URL = process.env.API_BASE_URL ?? '';

let refreshPromise: Promise<string | null> | null = null;

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

function toAbsolute(input: RequestInfo | URL): RequestInfo | URL {
  return typeof input === 'string' ? API_BASE_URL + input : input;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = toAbsolute(input);
  const token = authService.getToken();
  const reqInit = token ? withBearer(init, token) : init;

  const res = await fetch(url, reqInit);

  if (res.status !== 401) return res;

  // Deduplicate concurrent 401s — only one refresh in flight at a time
  if (!refreshPromise) {
    refreshPromise = authService.refreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  const newToken = await refreshPromise;
  if (!newToken) return res;

  return fetch(url, withBearer(init, newToken));
}

import { authService } from './auth-service';

let refreshPromise: Promise<string | null> | null = null;

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = authService.getToken();
  const reqInit = token ? withBearer(init, token) : init;

  const res = await fetch(input, reqInit);

  if (res.status !== 401) return res;

  // Deduplicate concurrent 401s — only one refresh in flight at a time
  if (!refreshPromise) {
    refreshPromise = authService.refreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  const newToken = await refreshPromise;
  if (!newToken) return res;

  return fetch(input, withBearer(init, newToken));
}

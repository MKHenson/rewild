import { apiFetch } from './api-client';
import { authService } from './auth-service';

// Uses spyOn on the singleton so no jest.mock hoisting needed with esbuild transform

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches an Authorization: Bearer header when a token is present', async () => {
    jest.spyOn(authService, 'getToken').mockReturnValue('my.test.token');
    (global.fetch as jest.Mock).mockResolvedValue({ status: 200 });

    await apiFetch('/api/projects');

    const [, calledInit] = (global.fetch as jest.Mock).mock.calls[0] as [unknown, RequestInit];
    const headers = calledInit.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer my.test.token');
  });

  it('omits the Authorization header when no token is present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ status: 200 });

    await apiFetch('/api/projects');

    const [, calledInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledInit).toBeUndefined();
  });

  it('calls refresh and retries the original request on 401', async () => {
    jest.spyOn(authService, 'getToken').mockReturnValue('old.token');
    jest.spyOn(authService, 'refreshToken').mockResolvedValue('new.token');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200 });

    const res = await apiFetch('/api/projects');

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const [, retryInit] = (global.fetch as jest.Mock).mock.calls[1] as [unknown, RequestInit];
    const retryHeaders = retryInit.headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new.token');
    expect((res as { status: number }).status).toBe(200);
  });

  it('returns the 401 response without retrying when refresh fails', async () => {
    jest.spyOn(authService, 'getToken').mockReturnValue('old.token');
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({ status: 401 });

    const res = await apiFetch('/api/projects');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((res as { status: number }).status).toBe(401);
  });

  it('deduplicates concurrent 401s — only one refresh call regardless of simultaneous requests', async () => {
    jest.spyOn(authService, 'getToken').mockReturnValue('old.token');
    jest.spyOn(authService, 'refreshToken').mockResolvedValue('new.token');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValue({ status: 200 });

    await Promise.all([apiFetch('/api/projects'), apiFetch('/api/levels')]);

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);
  });
});

import { AuthService } from './auth-service';

function makeToken(payload: object): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `header.${encoded}.sig`;
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    global.fetch = jest.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('signIn', () => {
    it('stores the JWT in memory after a successful login', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      await service.signIn('test@example.com', 'password');

      expect(service.getToken()).toBe(token);
    });

    it('does not write the JWT to localStorage or sessionStorage', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      await service.signIn('test@example.com', 'password');

      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    it('dispatches the decoded user to listeners on success', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      const listener = jest.fn();
      service.onAuthStateChanged.add(listener);

      await service.signIn('test@example.com', 'password');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      );
    });

    it('throws and does not store a token on a failed login', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

      await expect(service.signIn('bad@example.com', 'wrong')).rejects.toThrow();
      expect(service.getToken()).toBeNull();
    });
  });

  describe('register', () => {
    it('stores the JWT in memory after successful registration', async () => {
      const token = makeToken({ email: 'new@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      await service.register('new@example.com', 'password', 'newuser');

      expect(service.getToken()).toBe(token);
    });

    it('dispatches the decoded user to listeners on success', async () => {
      const token = makeToken({ email: 'new@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      const listener = jest.fn();
      service.onAuthStateChanged.add(listener);

      await service.register('new@example.com', 'password', 'newuser');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' })
      );
    });

    it('sends email, password, and username in the request body', async () => {
      const token = makeToken({ email: 'new@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      await service.register('new@example.com', 'secret', 'newuser');

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body).toEqual({ email: 'new@example.com', password: 'secret', username: 'newuser' });
    });

    it('throws and does not store a token when registration fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => 'Email already in use',
      });

      await expect(service.register('taken@example.com', 'password', 'user')).rejects.toThrow('Email already in use');
      expect(service.getToken()).toBeNull();
    });
  });

  describe('signOut', () => {
    it('clears the in-memory token and dispatches null to listeners', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token }) })
        .mockResolvedValueOnce({ ok: true });

      await service.signIn('test@example.com', 'password');

      const listener = jest.fn();
      service.onAuthStateChanged.add(listener);

      await service.signOut();

      expect(service.getToken()).toBeNull();
      expect(listener).toHaveBeenCalledWith(null);
    });

    it('clears the token even when the logout request fails', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token }) })
        .mockRejectedValueOnce(new Error('Network error'));

      await service.signIn('test@example.com', 'password');
      await service.signOut();

      expect(service.getToken()).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('updates the in-memory token and returns it on success', async () => {
      const newToken = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token: newToken }),
      });

      const result = await service.refreshToken();

      expect(result).toBe(newToken);
      expect(service.getToken()).toBe(newToken);
    });

    it('clears the token and returns null when the server rejects the refresh', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token }) })
        .mockResolvedValueOnce({ ok: false, status: 401 });

      await service.signIn('test@example.com', 'password');
      const result = await service.refreshToken();

      expect(result).toBeNull();
      expect(service.getToken()).toBeNull();
    });

    it('clears the token and returns null on a network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.refreshToken();

      expect(result).toBeNull();
      expect(service.getToken()).toBeNull();
    });
  });

  describe('getUser', () => {
    it('returns null when not logged in', () => {
      expect(service.getUser()).toBeNull();
    });

    it('returns the decoded user after login', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token }),
      });

      await service.signIn('test@example.com', 'password');

      expect(service.getUser()).toEqual(
        expect.objectContaining({ email: 'test@example.com' })
      );
    });

    it('returns null after logout', async () => {
      const token = makeToken({ email: 'test@example.com' });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token }) })
        .mockResolvedValueOnce({ ok: true });

      await service.signIn('test@example.com', 'password');
      await service.signOut();

      expect(service.getUser()).toBeNull();
    });
  });
});

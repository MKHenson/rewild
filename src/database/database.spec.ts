import { db } from './database';
import { authService } from '../api/auth/auth-service';

const user = {
  displayName: 'Test',
  email: 'test@example.com',
  photoURL: null,
  emailVerified: false,
};

describe('Database sync-on-login', () => {
  let syncSpy: jest.SpyInstance;

  beforeEach(() => {
    syncSpy = jest.spyOn(db, 'syncAll').mockResolvedValue();
  });

  afterEach(() => {
    syncSpy.mockRestore();
  });

  it('runs syncAll when a user authenticates (login/register/refresh)', () => {
    authService.onAuthStateChanged.dispatch(user);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('does not sync on sign-out', () => {
    authService.onAuthStateChanged.dispatch(null);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('a failing post-login sync warns instead of throwing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    syncSpy.mockRejectedValue(new Error('offline'));

    authService.onAuthStateChanged.dispatch(user);
    await Promise.resolve(); // let the rejection propagate to the catch

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

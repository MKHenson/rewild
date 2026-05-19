import 'rewild-ui/compiler/jsx';
import { AuthStore } from './AuthStore';
import { authService } from '../../api/auth/auth-service';
import { db } from '../../database/database';

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    jest.spyOn(authService, 'signIn').mockResolvedValue(undefined);
    jest.spyOn(authService, 'signOut').mockResolvedValue(undefined);
    jest.spyOn(authService, 'register').mockResolvedValue(undefined);
    jest.spyOn(db.sync, 'run').mockResolvedValue(undefined);
    store = new AuthStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('is not logged in when authService has no user', () => {
      expect(store.target.loggedIn).toBe(false);
    });

    it('is not loading initially', () => {
      expect(store.target.loading).toBe(false);
    });
  });

  describe('signIn', () => {
    it('calls authService.signIn with the provided credentials', async () => {
      await store.signIn('user@example.com', 'secret');
      expect(authService.signIn).toHaveBeenCalledWith(
        'user@example.com',
        'secret'
      );
    });

    it('calls db.sync.run after a successful sign-in', async () => {
      await store.signIn('user@example.com', 'secret');
      expect(db.sync.run).toHaveBeenCalled();
    });

    it('propagates an error when sign-in fails', async () => {
      jest
        .spyOn(authService, 'signIn')
        .mockRejectedValue(new Error('Invalid credentials'));
      await expect(store.signIn('bad@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('does not call db.sync.run when sign-in fails', async () => {
      jest
        .spyOn(authService, 'signIn')
        .mockRejectedValue(new Error('Invalid credentials'));
      await store.signIn('bad@example.com', 'wrong').catch(() => {});
      expect(db.sync.run).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('calls authService.register with the provided credentials', async () => {
      await store.register('new@example.com', 'secret', 'newuser');
      expect(authService.register).toHaveBeenCalledWith(
        'new@example.com',
        'secret',
        'newuser'
      );
    });

    it('calls db.sync.run after successful registration', async () => {
      await store.register('new@example.com', 'secret', 'newuser');
      expect(db.sync.run).toHaveBeenCalled();
    });

    it('propagates an error when registration fails', async () => {
      jest
        .spyOn(authService, 'register')
        .mockRejectedValue(new Error('Email already in use'));
      await expect(
        store.register('taken@example.com', 'secret', 'user')
      ).rejects.toThrow('Email already in use');
    });

    it('does not call db.sync.run when registration fails', async () => {
      jest
        .spyOn(authService, 'register')
        .mockRejectedValue(new Error('Email already in use'));
      await store
        .register('taken@example.com', 'secret', 'user')
        .catch(() => {});
      expect(db.sync.run).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('calls authService.signOut', async () => {
      await store.signOut();
      expect(authService.signOut).toHaveBeenCalled();
    });
  });

  describe('auth state changes', () => {
    it('updates loggedIn and user email when auth state changes to a logged-in user', () => {
      authService.onAuthStateChanged.dispatch({
        email: 'user@example.com',
        displayName: null,
        photoURL: null,
        emailVerified: true,
      });
      expect(store.target.loggedIn).toBe(true);
      expect(store.target.user.email).toBe('user@example.com');
    });

    it('resets to guest when auth state changes to null', () => {
      authService.onAuthStateChanged.dispatch({
        email: 'user@example.com',
        displayName: null,
        photoURL: null,
        emailVerified: true,
      });
      authService.onAuthStateChanged.dispatch(null);
      expect(store.target.loggedIn).toBe(false);
      expect(store.target.user.email).toBeNull();
    });

    it('sets loading to false after auth state change', () => {
      store.defaultProxy.loading = true;
      authService.onAuthStateChanged.dispatch(null);
      expect(store.target.loading).toBe(false);
    });
  });
});

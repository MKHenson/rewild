import { authService } from '../../api/auth/auth-service';
import { db } from '../../database/database';
import { Dispatcher } from 'rewild-common';

interface IUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  type: 'guest' | 'user';
}

export type AuthStoreEvents = { kind: 'changed' };

const guestUser: IUser = {
  displayName: 'Guest',
  email: null,
  photoURL: null,
  emailVerified: false,
  type: 'guest',
};

function toStoreUser(
  user: NonNullable<ReturnType<typeof authService.getUser>>
): IUser {
  return {
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    photoURL: user.photoURL,
    type: 'user',
  };
}

export class AuthStore {
  loading = false;
  loggedIn: boolean;
  user: IUser;

  readonly dispatcher = new Dispatcher<AuthStoreEvents>();

  constructor() {
    const currentUser = authService.getUser();
    this.loggedIn = currentUser !== null;
    this.user = currentUser ? toStoreUser(currentUser) : { ...guestUser };

    authService.onAuthStateChanged.add((user) => {
      if (user) {
        this.loggedIn = true;
        this.user = toStoreUser(user);
      } else {
        this.loggedIn = false;
        this.user = { ...guestUser };
      }
      this.loading = false;
      this.dispatcher.dispatch({ kind: 'changed' });
    });
  }

  async signOut() {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    await authService.signOut();
  }

  async signIn(email: string, password: string) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    try {
      await authService.signIn(email, password);
      await db.sync.run();
    } catch (err) {
      this.loading = false;
      this.dispatcher.dispatch({ kind: 'changed' });
      throw err;
    }
  }

  async register(email: string, password: string, displayName: string) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    try {
      await authService.register(email, password, displayName);
      await db.sync.run();
    } catch (err) {
      this.loading = false;
      this.dispatcher.dispatch({ kind: 'changed' });
      throw err;
    }
  }

  async googleSignIn(idToken: string) {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });
    try {
      await authService.googleSignIn(idToken);
      await db.sync.run();
    } catch (err) {
      this.loading = false;
      this.dispatcher.dispatch({ kind: 'changed' });
      throw err;
    }
  }
}

export const authStore = new AuthStore();

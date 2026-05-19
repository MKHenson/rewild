import { authService } from '../../api/auth/auth-service';
import { db } from '../../database/database';
import { Store } from 'rewild-ui';

interface IUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  type: 'guest' | 'user';
}

interface IAuth {
  loading: boolean;
  loggedIn: boolean;
  user: IUser;
}

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

export class AuthStore extends Store<IAuth> {
  constructor() {
    const currentUser = authService.getUser();
    super({
      loading: false,
      loggedIn: currentUser !== null,
      user: currentUser ? toStoreUser(currentUser) : { ...guestUser },
    });

    authService.onAuthStateChanged.add((user) => {
      if (user) {
        this.defaultProxy.loggedIn = true;
        this.defaultProxy.user = toStoreUser(user);
      } else {
        this.defaultProxy.loggedIn = false;
        this.defaultProxy.user = { ...guestUser };
      }
      this.defaultProxy.loading = false;
    });
  }

  async signOut() {
    this.defaultProxy.loading = true;
    await authService.signOut();
  }

  async signIn(email: string, password: string) {
    this.defaultProxy.loading = true;
    try {
      await authService.signIn(email, password);
      await db.sync.run();
    } catch (err) {
      this.defaultProxy.loading = false;
      throw err;
    }
  }

  async register(email: string, password: string, displayName: string) {
    this.defaultProxy.loading = true;
    try {
      await authService.register(email, password, displayName);
      await db.sync.run();
    } catch (err) {
      this.defaultProxy.loading = false;
      throw err;
    }
  }

  async googleSignIn(idToken: string) {
    this.defaultProxy.loading = true;
    try {
      await authService.googleSignIn(idToken);
      await db.sync.run();
    } catch (err) {
      this.defaultProxy.loading = false;
      throw err;
    }
  }
}

export const authStore = new AuthStore();

import { authService } from '../../auth/auth-service';
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

export class AuthStore extends Store<IAuth> {
  constructor() {
    super({
      loading: true,
      loggedIn: false,
      user: guestUser,
    });

    authService.onAuthStateChanged((user) => {
      if (user) {
        this.defaultProxy.loggedIn = true;
        this.defaultProxy.user = {
          displayName: user.displayName,
          email: user.email,
          emailVerified: user.emailVerified,
          photoURL: user.photoURL,
          type: 'user',
        };
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
    await authService.signIn(email, password);
  }
}

export const authStore = new AuthStore();

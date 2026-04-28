export interface IAuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

type AuthStateCallback = (user: IAuthUser | null) => void;

/**
 * Stub auth service — to be replaced with Ktor JWT auth.
 * Always reports no authenticated user until the server is implemented.
 */
class AuthService {
  onAuthStateChanged(callback: AuthStateCallback): void {
    callback(null);
  }

  async signOut(): Promise<void> {
    throw new Error('AuthService.signOut: not implemented');
  }

  async signIn(_email: string, _password: string): Promise<void> {
    throw new Error('AuthService.signIn: not implemented');
  }
}

export const authService = new AuthService();

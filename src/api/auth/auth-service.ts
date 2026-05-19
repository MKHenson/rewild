import type { components } from '../../types/api';
import { Dispatcher } from 'rewild-common';

type AuthResponse = components['schemas']['com.rewild.auth.AuthResponse'];
type LoginRequest = components['schemas']['com.rewild.auth.LoginRequest'];
type RegisterRequest = components['schemas']['com.rewild.auth.RegisterRequest'];
type GoogleAuthRequest = components['schemas']['com.rewild.auth.GoogleAuthRequest'];
type ForgotPasswordRequest = components['schemas']['com.rewild.auth.ForgotPasswordRequest'];
type ResetPasswordRequest = components['schemas']['com.rewild.auth.ResetPasswordRequest'];

export interface IAuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

const API_BASE_URL = process.env.API_BASE_URL ?? '';

export class AuthService {
  private token: string | null = null;
  readonly onAuthStateChanged = new Dispatcher<IAuthUser | null>();

  getToken(): string | null {
    return this.token;
  }

  getUser(): IAuthUser | null {
    return this.token ? this.decodeUser(this.token) : null;
  }

  getUserId(): string | null {
    if (!this.token) return null;
    try {
      const payload = JSON.parse(
        atob(this.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      ) as { userId?: string };
      return payload.userId ?? null;
    } catch {
      return null;
    }
  }

  async refreshToken(): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        this.clearToken();
        return null;
      }
      const { token } = (await res.json()) as AuthResponse;
      this.setToken(token);
      return token;
    } catch {
      this.clearToken();
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password } satisfies LoginRequest),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const { token } = (await res.json()) as AuthResponse;
    this.setToken(token);
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName } satisfies RegisterRequest),
      credentials: 'include',
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || 'Registration failed');
    }
    const { token } = (await res.json()) as AuthResponse;
    this.setToken(token);
  }

  async googleSignIn(idToken: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken } satisfies GoogleAuthRequest),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Google sign-in failed');
    const { token } = (await res.json()) as AuthResponse;
    this.setToken(token);
  }

  async forgotPassword(email: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email } satisfies ForgotPasswordRequest),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Request failed');
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: newPassword } satisfies ResetPasswordRequest),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error || 'Reset failed');
    }
    const { token } = (await res.json()) as AuthResponse;
    this.setToken(token);
  }

  async signOut(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    this.clearToken();
  }

  private setToken(token: string): void {
    this.token = token;
    this.onAuthStateChanged.dispatch(this.decodeUser(token));
  }

  private clearToken(): void {
    this.token = null;
    this.onAuthStateChanged.dispatch(null);
  }

  private decodeUser(token: string): IAuthUser {
    try {
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      ) as { email?: string; displayName?: string; photoUrl?: string };
      return {
        displayName: payload.displayName ?? null,
        email: payload.email ?? null,
        photoURL: payload.photoUrl ?? null,
        emailVerified: false,
      };
    } catch {
      return { displayName: null, email: null, photoURL: null, emailVerified: false };
    }
  }
}

export const authService = new AuthService();

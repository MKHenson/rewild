import 'rewild-ui/compiler/jsx';
import { Auth } from './Auth';
import { authStore } from '../stores/AuthStore';
import { authService } from '../../api/auth/auth-service';
import { Avatar, Popup } from 'rewild-ui';
import {
  flushMicrotasks,
  fireClick,
  fireEvent,
} from 'rewild-ui/lib/test-utils';

type AuthState = {
  loggedIn: boolean;
  loading: boolean;
  user: {
    type: 'guest' | 'user';
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    emailVerified: boolean;
  };
};

const guestState: AuthState = {
  loggedIn: false,
  loading: false,
  user: {
    type: 'guest',
    email: null,
    displayName: 'Guest',
    photoURL: null,
    emailVerified: false,
  },
};

function loggedInState(email: string): AuthState {
  return {
    loggedIn: true,
    loading: false,
    user: {
      type: 'user',
      email,
      displayName: email,
      photoURL: null,
      emailVerified: true,
    },
  };
}

function createAuth(state: AuthState = guestState): Auth {
  jest
    .spyOn(authStore, 'createProxy')
    .mockReturnValue([state, jest.fn(), jest.fn()]);
  const auth = new Auth();
  auth._createRenderer();
  auth.render();
  return auth;
}

function fillForm(auth: Auth, email: string, password: string) {
  (
    auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
  ).value = email;
  (
    auth.shadow?.querySelector('input[type="password"]') as HTMLInputElement
  ).value = password;
}

function fillRegisterForm(
  auth: Auth,
  email: string,
  password: string,
  confirmPassword: string,
  displayName: string
) {
  (
    auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
  ).value = email;
  const passwordInputs = auth.shadow?.querySelectorAll(
    'input[type="password"]'
  ) as NodeListOf<HTMLInputElement>;
  passwordInputs[0].value = password;
  passwordInputs[1].value = confirmPassword;
  (auth.shadow?.querySelector('input[type="text"]') as HTMLInputElement).value =
    displayName;
}

function getSwitchViewSpans(auth: Auth): Element[] {
  return Array.from(auth.shadow?.querySelectorAll('span.switch-view') ?? []);
}

async function switchToRegister(auth: Auth) {
  const span = getSwitchViewSpans(auth).find((s) =>
    s.textContent?.includes('Register')
  )!;
  await fireClick(span);
}

async function switchToForgotPassword(auth: Auth) {
  const span = getSwitchViewSpans(auth).find((s) =>
    s.textContent?.includes('Forgot')
  )!;
  await fireClick(span);
}

async function switchToSignIn(auth: Auth) {
  await fireClick(auth.shadow?.querySelector('span.switch-view')!);
}

async function submitForm(auth: Auth) {
  await fireEvent(
    auth.shadow?.querySelector('form.sign-in-form')!,
    new Event('submit')
  );
}

describe('Auth', () => {
  beforeEach(() => {
    jest.spyOn(authService, 'getUser').mockReturnValue(null);
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
    jest.spyOn(authService, 'forgotPassword').mockResolvedValue(undefined);
    jest.spyOn(authStore, 'signIn').mockResolvedValue(undefined);
    jest.spyOn(authStore, 'signOut').mockResolvedValue(undefined);
    jest.spyOn(authStore, 'register').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logged-out state', () => {
    it('renders a Sign In button', () => {
      const auth = createAuth(guestState);
      expect(auth.shadow?.querySelector('button.sign-in-btn')).not.toBeNull();
    });

    it('does not render an Avatar', () => {
      const auth = createAuth(guestState);
      expect(auth.shadow?.querySelector('x-avatar')).toBeNull();
    });

    it('popup is closed by default', () => {
      const auth = createAuth(guestState);
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        false
      );
    });

    it('opens popup when Sign In is clicked', async () => {
      const auth = createAuth(guestState);
      await fireClick(auth.shadow?.querySelector('button.sign-in-btn')!);
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        true
      );
    });

    it('closes popup via onClose', () => {
      const auth = createAuth(guestState);
      (
        auth.shadow?.querySelector('button.sign-in-btn') as HTMLButtonElement
      ).click();
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        false
      );
    });

    it('renders email and password inputs inside the form', () => {
      const auth = createAuth(guestState);
      expect(auth.shadow?.querySelector('input[type="email"]')).not.toBeNull();
      expect(
        auth.shadow?.querySelector('input[type="password"]')
      ).not.toBeNull();
    });

    it('calls authStore.signIn with entered credentials on submit', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', 'secret');
      await submitForm(auth);
      expect(authStore.signIn).toHaveBeenCalledWith(
        'user@example.com',
        'secret'
      );
    });

    it('closes popup after successful sign-in', async () => {
      const auth = createAuth(guestState);
      await fireClick(auth.shadow?.querySelector('button.sign-in-btn')!);
      fillForm(auth, 'user@example.com', 'secret');
      await submitForm(auth);
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        false
      );
    });

    it('displays inline error on sign-in failure', async () => {
      jest
        .spyOn(authStore, 'signIn')
        .mockRejectedValue(new Error('Invalid credentials'));
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', 'secret');
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.auth-error')).not.toBeNull();
    });

    it('clears error when popup is closed after a failed attempt', async () => {
      jest
        .spyOn(authStore, 'signIn')
        .mockRejectedValue(new Error('Invalid credentials'));
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', 'secret');
      await submitForm(auth);
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      await flushMicrotasks();
      expect(auth.shadow?.querySelector('.auth-error')).toBeNull();
    });

    it('shows "Forgot password?" and "Register" links on the sign-in form', () => {
      const auth = createAuth(guestState);
      const spans = getSwitchViewSpans(auth);
      expect(spans.some((s) => s.textContent?.includes('Forgot'))).toBe(true);
      expect(spans.some((s) => s.textContent?.includes('Register'))).toBe(true);
    });
  });

  describe('form validation', () => {
    it('does not call authStore.signIn when email is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      await submitForm(auth);
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('does not call authStore.signIn when password is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      await submitForm(auth);
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('does not call authStore.signIn when email format is invalid', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'not-an-email', 'secret');
      await submitForm(auth);
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('shows email field error when email is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('shows password field error when password is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('marks email input invalid when email is missing', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      await submitForm(auth);
      const emailInput = auth.shadow?.querySelector(
        'input[type="email"]'
      ) as HTMLInputElement;
      expect(emailInput.className).toContain('invalid');
    });

    it('marks password input invalid when password is missing', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      await submitForm(auth);
      const passwordInput = auth.shadow?.querySelector(
        'input[type="password"]'
      ) as HTMLInputElement;
      expect(passwordInput.className).toContain('invalid');
    });

    it('clears field errors when popup is closed', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', '');
      await submitForm(auth);
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      await flushMicrotasks();
      expect(auth.shadow?.querySelector('.field-error')).toBeNull();
    });

    it('clears input values when popup is closed', () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', 'secret');
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      expect(
        (auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement)
          .value
      ).toBe('');
      expect(
        (
          auth.shadow?.querySelector(
            'input[type="password"]'
          ) as HTMLInputElement
        ).value
      ).toBe('');
    });
  });

  describe('registration view', () => {
    it('switches to the registration view when "Register" link is clicked', async () => {
      const auth = createAuth(guestState);
      await fireClick(auth.shadow?.querySelector('button.sign-in-btn')!);
      await switchToRegister(auth);
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Create Account');
    });

    it('shows email, display name, password, and confirm-password inputs on the register view', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      expect(auth.shadow?.querySelector('input[type="email"]')).not.toBeNull();
      expect(auth.shadow?.querySelector('input[type="text"]')).not.toBeNull();
      const passwordInputs = auth.shadow?.querySelectorAll(
        'input[type="password"]'
      );
      expect(passwordInputs?.length).toBe(2);
    });

    it('switches back to sign-in view when "Sign in" link is clicked on register view', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      await switchToSignIn(auth);
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Sign In');
    });

    it('calls authStore.register with entered credentials on submit', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      await submitForm(auth);
      expect(authStore.register).toHaveBeenCalledWith(
        'new@example.com',
        'secret',
        'newuser'
      );
    });

    it('closes popup after successful registration', async () => {
      const auth = createAuth(guestState);
      await fireClick(auth.shadow?.querySelector('button.sign-in-btn')!);
      await switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      await submitForm(auth);
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        false
      );
    });

    it('displays inline error when registration fails', async () => {
      jest
        .spyOn(authStore, 'register')
        .mockRejectedValue(new Error('Email already in use'));
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      fillRegisterForm(auth, 'taken@example.com', 'secret', 'secret', 'user');
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.auth-error')).not.toBeNull();
    });

    it('does not call authStore.register when passwords do not match', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      fillRegisterForm(
        auth,
        'new@example.com',
        'secret',
        'different',
        'newuser'
      );
      await submitForm(auth);
      expect(authStore.register).not.toHaveBeenCalled();
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('does not call authStore.register when display name is empty', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', '');
      await submitForm(auth);
      expect(authStore.register).not.toHaveBeenCalled();
    });

    it('clears inputs and resets to sign-in view when popup is closed from register view', async () => {
      const auth = createAuth(guestState);
      await switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      await flushMicrotasks();
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Sign In');
      expect(
        (auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement)
          .value
      ).toBe('');
    });
  });

  describe('forgot-password view', () => {
    it('switches to forgot-password view when "Forgot password?" is clicked', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Reset password');
    });

    it('shows email input on forgot-password view', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      expect(auth.shadow?.querySelector('input[type="email"]')).not.toBeNull();
    });

    it('does not call forgotPassword when email is empty', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      await submitForm(auth);
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('shows field error when email is empty', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('does not call forgotPassword when email format is invalid', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'not-an-email';
      await submitForm(auth);
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('calls authService.forgotPassword with the entered email', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'user@example.com';
      await submitForm(auth);
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        'user@example.com'
      );
    });

    it('shows confirmation message after successful submit', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'user@example.com';
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.auth-info')).not.toBeNull();
    });

    it('hides the form and shows confirmation text after successful submit', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'user@example.com';
      await submitForm(auth);
      expect(auth.shadow?.querySelector('form.sign-in-form')).toBeNull();
      expect(auth.shadow?.querySelector('h3.form-title')?.textContent).toBe(
        'Check your email'
      );
    });

    it('shows auth-error when forgotPassword throws', async () => {
      jest
        .spyOn(authService, 'forgotPassword')
        .mockRejectedValue(new Error('Network error'));
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'user@example.com';
      await submitForm(auth);
      expect(auth.shadow?.querySelector('.auth-error')).not.toBeNull();
    });

    it('switches back to sign-in view from forgot-password', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      await switchToSignIn(auth);
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Sign In');
    });

    it('resets confirmation state when navigating away and back to forgot-password', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (
        auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement
      ).value = 'user@example.com';
      await submitForm(auth);
      await switchToSignIn(auth);
      await switchToForgotPassword(auth);
      expect(auth.shadow?.querySelector('.auth-info')).toBeNull();
      expect(auth.shadow?.querySelector('form.sign-in-form')).not.toBeNull();
    });

    it('clears forgot-password state when popup is closed', async () => {
      const auth = createAuth(guestState);
      await switchToForgotPassword(auth);
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      await flushMicrotasks();
      expect(
        auth.shadow?.querySelector('form.sign-in-form h3.form-title')
          ?.textContent
      ).toBe('Sign In');
    });
  });

  describe('logged-in state', () => {
    it('renders an Avatar', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      expect(auth.shadow?.querySelector('x-avatar')).not.toBeNull();
    });

    it('does not render a Sign In button', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      expect(auth.shadow?.querySelector('button.sign-in-btn')).toBeNull();
    });

    it('popup is closed by default', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        false
      );
    });

    it('opens user panel when Avatar is clicked', async () => {
      const auth = createAuth(loggedInState('user@example.com'));
      (auth.shadow?.querySelector('x-avatar') as Avatar)._props.onClick!(
        new MouseEvent('click')
      );
      await flushMicrotasks();
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        true
      );
    });

    it('shows the user email element in the panel', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      (auth.shadow?.querySelector('x-avatar') as Avatar)._props.onClick!(
        new MouseEvent('click')
      );
      expect(auth.shadow?.querySelector('.user-email')).not.toBeNull();
    });

    it('calls authStore.signOut when sign-out span is clicked', async () => {
      const auth = createAuth(loggedInState('user@example.com'));
      await fireClick(auth.shadow?.querySelector('span.sign-out')!);
      expect(authStore.signOut).toHaveBeenCalled();
    });
  });

  describe('session restore on mount', () => {
    it('calls authService.refreshToken when not logged in', async () => {
      const auth = createAuth(guestState);
      await auth.onMount!();
      expect(authService.refreshToken).toHaveBeenCalled();
    });

    it('skips refreshToken when already logged in', async () => {
      jest.spyOn(authService, 'getUser').mockReturnValue({
        email: 'user@example.com',
        displayName: null,
        photoURL: null,
        emailVerified: true,
      });
      const auth = createAuth(loggedInState('user@example.com'));
      await auth.onMount!();
      expect(authService.refreshToken).not.toHaveBeenCalled();
    });
  });
});

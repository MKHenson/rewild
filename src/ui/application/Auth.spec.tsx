import 'rewild-ui/compiler/jsx';
import { Auth } from './Auth';
import { authStore } from '../stores/AuthStore';
import { authService } from '../../api/auth/auth-service';
import { Avatar, Popup } from 'rewild-ui';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

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

function fillRegisterForm(auth: Auth, email: string, password: string, confirmPassword: string, username: string) {
  (auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement).value = email;
  const passwordInputs = auth.shadow?.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
  passwordInputs[0].value = password;
  passwordInputs[1].value = confirmPassword;
  (auth.shadow?.querySelector('input[type="text"]') as HTMLInputElement).value = username;
}

function switchToRegister(auth: Auth) {
  (auth.shadow?.querySelector('span.switch-view') as HTMLSpanElement).click();
}

function switchToSignIn(auth: Auth) {
  (auth.shadow?.querySelector('span.switch-view') as HTMLSpanElement).click();
}

function submitForm(auth: Auth) {
  (
    auth.shadow?.querySelector('form.sign-in-form') as HTMLFormElement
  ).dispatchEvent(new Event('submit'));
}

describe('Auth', () => {
  beforeEach(() => {
    jest.spyOn(authService, 'getUser').mockReturnValue(null);
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
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

    it('opens popup when Sign In is clicked', () => {
      const auth = createAuth(guestState);
      (
        auth.shadow?.querySelector('button.sign-in-btn') as HTMLButtonElement
      ).click();
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
      submitForm(auth);
      await flushPromises();
      expect(authStore.signIn).toHaveBeenCalledWith(
        'user@example.com',
        'secret'
      );
    });

    it('closes popup after successful sign-in', async () => {
      const auth = createAuth(guestState);
      (
        auth.shadow?.querySelector('button.sign-in-btn') as HTMLButtonElement
      ).click();
      fillForm(auth, 'user@example.com', 'secret');
      submitForm(auth);
      await flushPromises();
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
      submitForm(auth);
      await flushPromises();
      expect(auth.shadow?.querySelector('.auth-error')).not.toBeNull();
    });

    it('clears error when popup is closed after a failed attempt', async () => {
      jest
        .spyOn(authStore, 'signIn')
        .mockRejectedValue(new Error('Invalid credentials'));
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', 'secret');
      submitForm(auth);
      await flushPromises();
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      expect(auth.shadow?.querySelector('.auth-error')).toBeNull();
    });
  });

  describe('form validation', () => {
    it('does not call authStore.signIn when email is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      submitForm(auth);
      await flushPromises();
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('does not call authStore.signIn when password is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      submitForm(auth);
      await flushPromises();
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('does not call authStore.signIn when email format is invalid', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'not-an-email', 'secret');
      submitForm(auth);
      await flushPromises();
      expect(authStore.signIn).not.toHaveBeenCalled();
    });

    it('shows email field error when email is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      submitForm(auth);
      await flushPromises();
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('shows password field error when password is empty', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      submitForm(auth);
      await flushPromises();
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('marks email input invalid when email is missing', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', 'secret');
      submitForm(auth);
      await flushPromises();
      const emailInput = auth.shadow?.querySelector(
        'input[type="email"]'
      ) as HTMLInputElement;
      expect(emailInput.className).toContain('invalid');
    });

    it('marks password input invalid when password is missing', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, 'user@example.com', '');
      submitForm(auth);
      await flushPromises();
      const passwordInput = auth.shadow?.querySelector(
        'input[type="password"]'
      ) as HTMLInputElement;
      expect(passwordInput.className).toContain('invalid');
    });

    it('clears field errors when popup is closed', async () => {
      const auth = createAuth(guestState);
      fillForm(auth, '', '');
      submitForm(auth);
      await flushPromises();
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
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
    it('switches to the registration view when "Register" link is clicked', () => {
      const auth = createAuth(guestState);
      (auth.shadow?.querySelector('button.sign-in-btn') as HTMLButtonElement).click();
      switchToRegister(auth);
      expect(auth.shadow?.querySelector('form.sign-in-form h3.form-title')?.textContent).toBe('Create Account');
    });

    it('shows email, username, password, and confirm-password inputs on the register view', () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      expect(auth.shadow?.querySelector('input[type="email"]')).not.toBeNull();
      expect(auth.shadow?.querySelector('input[type="text"]')).not.toBeNull();
      const passwordInputs = auth.shadow?.querySelectorAll('input[type="password"]');
      expect(passwordInputs?.length).toBe(2);
    });

    it('switches back to sign-in view when "Sign in" link is clicked on register view', () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      switchToSignIn(auth);
      expect(auth.shadow?.querySelector('form.sign-in-form h3.form-title')?.textContent).toBe('Sign In');
    });

    it('calls authStore.register with entered credentials on submit', async () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      submitForm(auth);
      await flushPromises();
      expect(authStore.register).toHaveBeenCalledWith('new@example.com', 'secret', 'newuser');
    });

    it('closes popup after successful registration', async () => {
      const auth = createAuth(guestState);
      (auth.shadow?.querySelector('button.sign-in-btn') as HTMLButtonElement).click();
      switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      submitForm(auth);
      await flushPromises();
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(false);
    });

    it('displays inline error when registration fails', async () => {
      jest.spyOn(authStore, 'register').mockRejectedValue(new Error('Email already in use'));
      const auth = createAuth(guestState);
      switchToRegister(auth);
      fillRegisterForm(auth, 'taken@example.com', 'secret', 'secret', 'user');
      submitForm(auth);
      await flushPromises();
      expect(auth.shadow?.querySelector('.auth-error')).not.toBeNull();
    });

    it('does not call authStore.register when passwords do not match', async () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'different', 'newuser');
      submitForm(auth);
      await flushPromises();
      expect(authStore.register).not.toHaveBeenCalled();
      expect(auth.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('does not call authStore.register when username is empty', async () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', '');
      submitForm(auth);
      await flushPromises();
      expect(authStore.register).not.toHaveBeenCalled();
    });

    it('clears inputs and resets to sign-in view when popup is closed from register view', () => {
      const auth = createAuth(guestState);
      switchToRegister(auth);
      fillRegisterForm(auth, 'new@example.com', 'secret', 'secret', 'newuser');
      (auth.shadow?.querySelector('x-popup') as Popup)._props.onClose!();
      expect(auth.shadow?.querySelector('form.sign-in-form h3.form-title')?.textContent).toBe('Sign In');
      expect((auth.shadow?.querySelector('input[type="email"]') as HTMLInputElement).value).toBe('');
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

    it('opens user panel when Avatar is clicked', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      (auth.shadow?.querySelector('x-avatar') as Avatar)._props.onClick!(new MouseEvent('click'));
      expect((auth.shadow?.querySelector('x-popup') as Popup)._props.open).toBe(
        true
      );
    });

    it('shows the user email element in the panel', () => {
      const auth = createAuth(loggedInState('user@example.com'));
      (auth.shadow?.querySelector('x-avatar') as Avatar)._props.onClick!(new MouseEvent('click'));
      expect(auth.shadow?.querySelector('.user-email')).not.toBeNull();
    });

    it('calls authStore.signOut when sign-out span is clicked', async () => {
      const auth = createAuth(loggedInState('user@example.com'));
      const signOutSpan = auth.shadow?.querySelector(
        'span.sign-out'
      ) as HTMLSpanElement;
      signOutSpan.click();
      await flushPromises();
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

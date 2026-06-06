import { Avatar, Popup, Component, register, theme } from 'rewild-ui';
import { authStore } from '../stores/AuthStore';
import { authService } from '../../api/auth/auth-service';

type Props = {};
type View = 'signIn' | 'register' | 'forgotPassword';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GOOGLE_G = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
) as unknown as HTMLElement;

@register('x-auth')
export class Auth extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);
    const [menuOpen, setMenuOpen] = this.useState(false);
    const [view, setView] = this.useState<View>('signIn');
    const [error, setError] = this.useState<string | null>(null);
    const [emailError, setEmailError] = this.useState<string | null>(null);
    const [passwordError, setPasswordError] = this.useState<string | null>(
      null
    );
    const [confirmPasswordError, setConfirmPasswordError] = this.useState<
      string | null
    >(null);
    const [displayNameError, setDisplayNameError] = this.useState<
      string | null
    >(null);
    const [submitting, setSubmitting] = this.useState(false);
    const [forgotSent, setForgotSent] = this.useState(false);
    const [googleReady, setGoogleReady] = this.useState(false);

    // Stable refs — created once so typed values survive re-renders
    const emailInput = (
      <input type="email" placeholder="Email" />
    ) as HTMLInputElement;
    const passwordInput = (
      <input type="password" placeholder="Password" />
    ) as HTMLInputElement;
    const confirmPasswordInput = (
      <input type="password" placeholder="Confirm password" />
    ) as HTMLInputElement;
    const displayNameInput = (
      <input type="text" placeholder="Display name" />
    ) as HTMLInputElement;

    emailInput.oninput = () => {
      if (emailError()) setEmailError(null);
    };
    passwordInput.oninput = () => {
      if (passwordError()) setPasswordError(null);
    };
    confirmPasswordInput.oninput = () => {
      if (confirmPasswordError()) setConfirmPasswordError(null);
    };
    displayNameInput.oninput = () => {
      if (displayNameError()) setDisplayNameError(null);
    };

    // Container for Google's rendered button — sits underneath our visual layer
    const googleBtnContainer = document.createElement('div');
    googleBtnContainer.style.cssText = 'display:flex;justify-content:center;overflow:hidden;';

    this.onMount = async () => {
      if (!authService.getUser()) {
        await authService.refreshToken();
      }
      loadGoogleSdk(() => {
        const g = (window as GoogleWindow).google;
        if (!g) return;
        g.accounts.id.initialize({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          callback: async ({ credential }) => {
            setSubmitting(true);
            setError(null);
            try {
              await authStore.googleSignIn(credential);
              closeMenu();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Google sign-in failed');
            } finally {
              setSubmitting(false);
            }
          },
        });
        g.accounts.id.renderButton(googleBtnContainer, { type: 'standard', size: 'large', width: '400' });
        setGoogleReady(true);
      });
    };

    const clearFields = () => {
      emailInput.value = '';
      passwordInput.value = '';
      confirmPasswordInput.value = '';
      displayNameInput.value = '';
    };

    const clearErrors = () => {
      setError(null);
      setEmailError(null);
      setPasswordError(null);
      setConfirmPasswordError(null);
      setDisplayNameError(null);
    };

    const closeMenu = () => {
      setMenuOpen(false);
      setView('signIn');
      setForgotSent(false);
      clearErrors();
      clearFields();
    };

    const switchView = (v: View) => {
      setView(v);
      setForgotSent(false);
      clearErrors();
    };

    const validateSignIn = (): boolean => {
      let valid = true;
      const email = emailInput.value.trim();
      if (!email) {
        setEmailError('Email is required');
        valid = false;
      } else if (!EMAIL_RE.test(email)) {
        setEmailError('Enter a valid email address');
        valid = false;
      } else {
        setEmailError(null);
      }
      if (!passwordInput.value) {
        setPasswordError('Password is required');
        valid = false;
      } else {
        setPasswordError(null);
      }
      return valid;
    };

    const validateRegister = (): boolean => {
      let valid = true;
      const email = emailInput.value.trim();
      if (!email) {
        setEmailError('Email is required');
        valid = false;
      } else if (!EMAIL_RE.test(email)) {
        setEmailError('Enter a valid email address');
        valid = false;
      } else {
        setEmailError(null);
      }
      if (!passwordInput.value) {
        setPasswordError('Password is required');
        valid = false;
      } else {
        setPasswordError(null);
      }
      if (!confirmPasswordInput.value) {
        setConfirmPasswordError('Please confirm your password');
        valid = false;
      } else if (confirmPasswordInput.value !== passwordInput.value) {
        setConfirmPasswordError('Passwords do not match');
        valid = false;
      } else {
        setConfirmPasswordError(null);
      }
      if (!displayNameInput.value.trim()) {
        setDisplayNameError('Display name is required');
        valid = false;
      } else {
        setDisplayNameError(null);
      }
      return valid;
    };

    const onSignInSubmit = async (e: Event) => {
      e.preventDefault();
      if (submitting()) return;
      if (!validateSignIn()) return;
      setError(null);
      setSubmitting(true);
      try {
        await authStore.signIn(emailInput.value.trim(), passwordInput.value);
        clearFields();
        clearErrors();
        setMenuOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      } finally {
        setSubmitting(false);
      }
    };

    const onRegisterSubmit = async (e: Event) => {
      e.preventDefault();
      if (submitting()) return;
      if (!validateRegister()) return;
      setError(null);
      setSubmitting(true);
      try {
        await authStore.register(
          emailInput.value.trim(),
          passwordInput.value,
          displayNameInput.value.trim()
        );
        clearFields();
        clearErrors();
        setMenuOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setSubmitting(false);
      }
    };

    const onForgotPasswordSubmit = async (e: Event) => {
      e.preventDefault();
      if (submitting()) return;
      const email = emailInput.value.trim();
      if (!email) {
        setEmailError('Email is required');
        return;
      }
      if (!EMAIL_RE.test(email)) {
        setEmailError('Enter a valid email address');
        return;
      }
      setEmailError(null);
      setError(null);
      setSubmitting(true);
      try {
        await authService.forgotPassword(email);
        setForgotSent(true);
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setSubmitting(false);
      }
    };

    const onSignOut = async () => {
      setMenuOpen(false);
      await authStore.signOut();
    };

    return () => {
      emailInput.className = emailError() ? 'invalid' : '';
      passwordInput.className = passwordError() ? 'invalid' : '';
      confirmPasswordInput.className = confirmPasswordError() ? 'invalid' : '';
      displayNameInput.className = displayNameError() ? 'invalid' : '';

      if (authStore.loggedIn) {
        return (
          <div class="auth-root">
            <Avatar
              size="s"
              css={AvatarCss}
              src={authStore.user?.photoURL || undefined}
              onClick={() => setMenuOpen(!menuOpen())}
            />
            <Popup open={menuOpen()} onClose={closeMenu} withBackground>
              <div class="user-panel">
                <p class="user-email">{authStore.user?.email || ''}</p>
                <span class="sign-out" onclick={onSignOut}>
                  Sign out
                </span>
              </div>
            </Popup>
          </div>
        );
      }

      if (view() === 'forgotPassword') {
        return (
          <div class="auth-root">
            <button class="sign-in-btn" onclick={() => setMenuOpen(true)}>
              Sign In
            </button>
            <Popup open={menuOpen()} onClose={closeMenu} withBackground>
              {forgotSent() ? (
                <div class="sign-in-form">
                  <h3 class="form-title">Check your email</h3>
                  <p class="auth-info">
                    If that address is registered, we've sent a reset link.
                    Check your inbox.
                  </p>
                  <span
                    class="switch-view"
                    onclick={() => switchView('signIn')}>
                    Back to sign in
                  </span>
                </div>
              ) : (
                <form class="sign-in-form" onsubmit={onForgotPasswordSubmit}>
                  <h3 class="form-title">Reset password</h3>
                  <div class="field-wrap">
                    {emailInput}
                    {emailError() ? (
                      <p class="field-error">{emailError()}</p>
                    ) : null}
                  </div>
                  {error() ? <p class="auth-error">{error()}</p> : null}
                  <button type="submit" disabled={submitting()}>
                    {submitting() ? 'Sending...' : 'Send reset link'}
                  </button>
                  <span
                    class="switch-view"
                    onclick={() => switchView('signIn')}>
                    Back to sign in
                  </span>
                </form>
              )}
            </Popup>
          </div>
        );
      }

      if (view() === 'register') {
        return (
          <div class="auth-root">
            <button class="sign-in-btn" onclick={() => setMenuOpen(true)}>
              Sign In
            </button>
            <Popup open={menuOpen()} onClose={closeMenu} withBackground>
              <form class="sign-in-form" onsubmit={onRegisterSubmit}>
                <h3 class="form-title">Create Account</h3>
                <div class="field-wrap">
                  {emailInput}
                  {emailError() ? (
                    <p class="field-error">{emailError()}</p>
                  ) : null}
                </div>
                <div class="field-wrap">
                  {displayNameInput}
                  {displayNameError() ? (
                    <p class="field-error">{displayNameError()}</p>
                  ) : null}
                </div>
                <div class="field-wrap">
                  {passwordInput}
                  {passwordError() ? (
                    <p class="field-error">{passwordError()}</p>
                  ) : null}
                </div>
                <div class="field-wrap">
                  {confirmPasswordInput}
                  {confirmPasswordError() ? (
                    <p class="field-error">{confirmPasswordError()}</p>
                  ) : null}
                </div>
                {error() ? <p class="auth-error">{error()}</p> : null}
                <button type="submit" disabled={submitting()}>
                  {submitting() ? 'Creating account...' : 'Create Account'}
                </button>
                <span class="switch-view" onclick={() => switchView('signIn')}>
                  Already have an account? Sign in
                </span>
              </form>
            </Popup>
          </div>
        );
      }

      return (
        <div class="auth-root">
          <button class="sign-in-btn" onclick={() => setMenuOpen(true)}>
            Sign In
          </button>
          <Popup open={menuOpen()} onClose={closeMenu} withBackground>
            <form class="sign-in-form" onsubmit={onSignInSubmit}>
              <h3 class="form-title">Sign In</h3>
              <div class="field-wrap">
                {emailInput}
                {emailError() ? (
                  <p class="field-error">{emailError()}</p>
                ) : null}
              </div>
              <div class="field-wrap">
                {passwordInput}
                {passwordError() ? (
                  <p class="field-error">{passwordError()}</p>
                ) : null}
              </div>
              {error() ? <p class="auth-error">{error()}</p> : null}
              <button type="submit" disabled={submitting()}>
                {submitting() ? 'Signing in...' : 'Sign In'}
              </button>
              {googleReady() ? (
                <div class={`google-btn-outer${submitting() ? ' google-btn-outer--disabled' : ''}`}>
                  {googleBtnContainer as unknown as HTMLElement}
                  <div class="google-btn-visual" aria-hidden="true">
                    {GOOGLE_G}
                    Continue with Google
                  </div>
                </div>
              ) : null}
              <span
                class="switch-view"
                onclick={() => switchView('forgotPassword')}>
                Forgot password?
              </span>
              <span class="switch-view" onclick={() => switchView('register')}>
                Don't have an account? Register
              </span>
            </form>
          </Popup>
        </div>
      );
    };
  }

  getStyle() {
    return css`
      :host {
        position: absolute;
        top: 0;
        right: 0;
        padding: 2px 4px;
      }

      :host .avatar {
        cursor: pointer;
      }

      .sign-in-btn {
        cursor: pointer;
        background: ${theme.colors.surface};
        border: 1px solid ${theme.colors.onSurfaceBorder};
        color: ${theme.colors.onSurface};
        padding: 0.4rem 1rem;
        margin: 4px 4px;
        border-radius: 4px;
        font-size: ${theme.colors.fontSizeSmall};
        font-family: var(--font-family);
      }

      .sign-in-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 280px;
      }

      .form-title {
        margin: 0 0 0.5rem;
        color: ${theme.colors.onSurface};
      }

      .field-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .sign-in-form input {
        padding: 0.6rem;
        border: 1px solid ${theme.colors.onSurfaceBorder};
        border-radius: 4px;
        font-size: ${theme.colors.fontSizeSmall};
        font-family: var(--font-family);
        background: ${theme.colors.surface};
        color: ${theme.colors.onSurface};
        width: 100%;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.2s;
      }

      .sign-in-form input:focus {
        border-color: ${theme.colors.primary400};
      }

      .sign-in-form input.invalid {
        border-color: ${theme.colors.error400};
      }

      .field-error {
        color: ${theme.colors.error400};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
      }

      .sign-in-form button[type='submit'] {
        padding: 0.6rem;
        background: ${theme.colors.primary400};
        color: ${theme.colors.onPrimary400};
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: ${theme.colors.fontSizeSmall};
        font-family: var(--font-family);
        transition: background 0.2s;
      }

      .sign-in-form button[type='submit']:hover {
        background: ${theme.colors.primary500};
        color: ${theme.colors.onPrimary500};
      }

      .sign-in-form button[type='submit']:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .google-btn-outer {
        position: relative;
        overflow: hidden;
        border-radius: 4px;
        cursor: pointer;
      }

      .google-btn-outer--disabled {
        opacity: 0.65;
        pointer-events: none;
      }

      .google-btn-visual {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: ${theme.colors.surface};
        color: ${theme.colors.onSurface};
        border: 1px solid ${theme.colors.onSurfaceBorder};
        border-radius: 4px;
        font-size: ${theme.colors.fontSizeSmall};
        font-family: var(--font-family);
        pointer-events: none;
        transition: border-color 0.2s, background 0.2s;
      }

      .google-btn-outer:hover .google-btn-visual {
        border-color: ${theme.colors.primary400};
        background: ${theme.colors.subtle400};
      }

      .auth-error {
        color: ${theme.colors.error400};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
      }

      .auth-info {
        color: ${theme.colors.onSurface};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
        line-height: 1.5;
      }

      .switch-view {
        cursor: pointer;
        color: ${theme.colors.primary400};
        font-size: ${theme.colors.fontSizeSmall};
        text-align: center;
        text-decoration: underline;
      }

      .switch-view:hover {
        color: ${theme.colors.primary500};
      }

      .user-panel {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 200px;
      }

      .user-email {
        margin: 0;
        font-weight: 500;
        color: ${theme.colors.onSurface};
      }

      span.sign-out {
        cursor: pointer;
        color: ${theme.colors.error400};
        text-decoration: underline;
        display: inline-block;
        font-size: ${theme.colors.fontSizeSmall};
      }

      span.sign-out:hover {
        color: ${theme.colors.error500};
      }
    `;
  }
}

const AvatarCss = css`
  :host {
    cursor: pointer;
  }
`;

interface GoogleWindow {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (res: { credential: string }) => void;
        }): void;
        renderButton(container: HTMLElement, options: { type?: string; size?: string; width?: string | number }): void;
        prompt(): void;
      };
    };
  };
}

function loadGoogleSdk(onReady: () => void): void {
  if ((window as GoogleWindow).google) {
    onReady();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = onReady;
  document.head.appendChild(script);
}

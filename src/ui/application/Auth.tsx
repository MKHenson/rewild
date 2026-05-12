import { Avatar, Popup, Component, register, theme } from 'rewild-ui';
import { authStore } from '../stores/AuthStore';
import { authService } from '../../api/auth/auth-service';

type Props = {};
type View = 'signIn' | 'register';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@register('x-auth')
export class Auth extends Component<Props> {
  init() {
    const auth = this.observeStore(authStore);
    const [menuOpen, setMenuOpen] = this.useState(false);
    const [view, setView] = this.useState<View>('signIn');
    const [error, setError] = this.useState<string | null>(null);
    const [emailError, setEmailError] = this.useState<string | null>(null);
    const [passwordError, setPasswordError] = this.useState<string | null>(null);
    const [confirmPasswordError, setConfirmPasswordError] = this.useState<string | null>(null);
    const [usernameError, setUsernameError] = this.useState<string | null>(null);
    const [submitting, setSubmitting] = this.useState(false);

    // Stable refs — created once so typed values survive re-renders
    const emailInput = (<input type="email" placeholder="Email" />) as HTMLInputElement;
    const passwordInput = (<input type="password" placeholder="Password" />) as HTMLInputElement;
    const confirmPasswordInput = (<input type="password" placeholder="Confirm password" />) as HTMLInputElement;
    const usernameInput = (<input type="text" placeholder="Username" />) as HTMLInputElement;

    emailInput.oninput = () => { if (emailError()) setEmailError(null); };
    passwordInput.oninput = () => { if (passwordError()) setPasswordError(null); };
    confirmPasswordInput.oninput = () => { if (confirmPasswordError()) setConfirmPasswordError(null); };
    usernameInput.oninput = () => { if (usernameError()) setUsernameError(null); };

    this.onMount = async () => {
      if (!authService.getUser()) {
        await authService.refreshToken();
      }
    };

    const clearFields = () => {
      emailInput.value = '';
      passwordInput.value = '';
      confirmPasswordInput.value = '';
      usernameInput.value = '';
    };

    const clearErrors = () => {
      setError(null);
      setEmailError(null);
      setPasswordError(null);
      setConfirmPasswordError(null);
      setUsernameError(null);
    };

    const closeMenu = () => {
      setMenuOpen(false);
      setView('signIn');
      clearErrors();
      clearFields();
    };

    const switchView = (v: View) => {
      setView(v);
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
      if (!usernameInput.value.trim()) {
        setUsernameError('Username is required');
        valid = false;
      } else {
        setUsernameError(null);
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
        await authStore.register(emailInput.value.trim(), passwordInput.value, usernameInput.value.trim());
        clearFields();
        clearErrors();
        setMenuOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
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
      usernameInput.className = usernameError() ? 'invalid' : '';

      if (auth.loggedIn) {
        return (
          <div class="auth-root">
            <Avatar
              src={auth.user?.photoURL || undefined}
              onClick={() => setMenuOpen(!menuOpen())}
            />
            <Popup open={menuOpen()} onClose={closeMenu} withBackground>
              <div class="user-panel">
                <p class="user-email">{auth.user?.email || ''}</p>
                <span class="sign-out" onclick={onSignOut}>Sign out</span>
              </div>
            </Popup>
          </div>
        );
      }

      if (view() === 'register') {
        return (
          <div class="auth-root">
            <button class="sign-in-btn" onclick={() => setMenuOpen(true)}>Sign In</button>
            <Popup open={menuOpen()} onClose={closeMenu} withBackground>
              <form class="sign-in-form" onsubmit={onRegisterSubmit}>
                <h3 class="form-title">Create Account</h3>
                <div class="field-wrap">
                  {emailInput}
                  {emailError() ? <p class="field-error">{emailError()}</p> : null}
                </div>
                <div class="field-wrap">
                  {usernameInput}
                  {usernameError() ? <p class="field-error">{usernameError()}</p> : null}
                </div>
                <div class="field-wrap">
                  {passwordInput}
                  {passwordError() ? <p class="field-error">{passwordError()}</p> : null}
                </div>
                <div class="field-wrap">
                  {confirmPasswordInput}
                  {confirmPasswordError() ? <p class="field-error">{confirmPasswordError()}</p> : null}
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
          <button class="sign-in-btn" onclick={() => setMenuOpen(true)}>Sign In</button>
          <Popup open={menuOpen()} onClose={closeMenu} withBackground>
            <form class="sign-in-form" onsubmit={onSignInSubmit}>
              <h3 class="form-title">Sign In</h3>
              <div class="field-wrap">
                {emailInput}
                {emailError() ? <p class="field-error">{emailError()}</p> : null}
              </div>
              <div class="field-wrap">
                {passwordInput}
                {passwordError() ? <p class="field-error">{passwordError()}</p> : null}
              </div>
              {error() ? <p class="auth-error">{error()}</p> : null}
              <button type="submit" disabled={submitting()}>
                {submitting() ? 'Signing in...' : 'Sign In'}
              </button>
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
        padding: 1rem;
      }

      .sign-in-btn {
        cursor: pointer;
        background: none;
        border: 1px solid rgba(255, 255, 255, 0.7);
        color: white;
        padding: 0.4rem 1rem;
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

      .auth-error {
        color: ${theme.colors.error400};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
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

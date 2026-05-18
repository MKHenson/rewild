import { Component, register, navigate, theme } from 'rewild-ui';
import { authService } from '../../api/auth/auth-service';

@register('x-reset-password')
export class ResetPassword extends Component<{}> {
  init() {
    const token = new URLSearchParams(window.location.search).get('token');

    const [error, setError] = this.useState<string | null>(token ? null : 'This link is invalid or has expired.');
    const [passwordError, setPasswordError] = this.useState<string | null>(null);
    const [confirmPasswordError, setConfirmPasswordError] = this.useState<string | null>(null);
    const [submitting, setSubmitting] = this.useState(false);

    const passwordInput = (<input type="password" placeholder="New password" />) as HTMLInputElement;
    const confirmPasswordInput = (<input type="password" placeholder="Confirm new password" />) as HTMLInputElement;

    passwordInput.oninput = () => { if (passwordError()) setPasswordError(null); };
    confirmPasswordInput.oninput = () => { if (confirmPasswordError()) setConfirmPasswordError(null); };

    const onSubmit = async (e: Event) => {
      e.preventDefault();
      if (submitting() || !token) return;

      let valid = true;
      if (!passwordInput.value) {
        setPasswordError('Password is required');
        valid = false;
      } else if (passwordInput.value.length < 8) {
        setPasswordError('Password must be at least 8 characters');
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
      if (!valid) return;

      setError(null);
      setSubmitting(true);
      try {
        await authService.resetPassword(token, passwordInput.value);
        navigate('/');
      } catch {
        setError('This reset link has expired or is invalid. Please request a new one.');
      } finally {
        setSubmitting(false);
      }
    };

    return () => {
      passwordInput.className = passwordError() ? 'invalid' : '';
      confirmPasswordInput.className = confirmPasswordError() ? 'invalid' : '';

      if (!token) {
        return (
          <div class="reset-root">
            <div class="reset-form">
              <h2 class="form-title">Link expired</h2>
              <p class="reset-error">{error()}</p>
              <button type="button" class="secondary" onclick={() => navigate('/')}>Go to sign in</button>
            </div>
          </div>
        );
      }

      return (
        <div class="reset-root">
          <form class="reset-form" onsubmit={onSubmit}>
            <h2 class="form-title">Set new password</h2>
            <div class="field-wrap">
              {passwordInput}
              {passwordError() ? <p class="field-error">{passwordError()}</p> : null}
            </div>
            <div class="field-wrap">
              {confirmPasswordInput}
              {confirmPasswordError() ? <p class="field-error">{confirmPasswordError()}</p> : null}
            </div>
            {error() ? <p class="reset-error">{error()}</p> : null}
            <button type="submit" disabled={submitting()}>
              {submitting() ? 'Saving...' : 'Set new password'}
            </button>
            <button type="button" class="secondary" onclick={() => navigate('/')}>Go to sign in</button>
          </form>
        </div>
      );
    };
  }

  getStyle() {
    return css`
      :host {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .reset-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 320px;
        background: ${theme.colors.surface};
        padding: 2rem;
        border-radius: 8px;
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

      .reset-form input {
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

      .reset-form input:focus {
        border-color: ${theme.colors.primary400};
      }

      .reset-form input.invalid {
        border-color: ${theme.colors.error400};
      }

      .field-error {
        color: ${theme.colors.error400};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
      }

      .reset-form button[type='submit'] {
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

      .reset-form button[type='submit']:hover {
        background: ${theme.colors.primary500};
        color: ${theme.colors.onPrimary500};
      }

      .reset-form button[type='submit']:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .reset-error {
        color: ${theme.colors.error400};
        font-size: ${theme.colors.fontSizeSmall};
        margin: 0;
      }

      .reset-form button.secondary {
        padding: 0.6rem;
        background: transparent;
        color: ${theme.colors.onSurface};
        border: 1px solid ${theme.colors.onSurfaceBorder};
        border-radius: 4px;
        cursor: pointer;
        font-size: ${theme.colors.fontSizeSmall};
        font-family: var(--font-family);
        transition: border-color 0.2s;
      }

      .reset-form button.secondary:hover {
        border-color: ${theme.colors.onSurface};
      }
    `;
  }
}

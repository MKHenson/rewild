import 'rewild-ui/compiler/jsx';
import { authService } from '../../api/auth/auth-service';
import { fireClick, fireEvent } from 'rewild-ui/lib/test-utils';
import { ResetPassword } from './ResetPassword';

function createResetPassword(
  token: string | null = 'test-token'
): ResetPassword {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      search: token !== null ? `?token=${token}` : '',
      origin: 'http://localhost',
      pathname: '/reset-password',
      href: 'http://localhost/reset-password',
    },
  });
  const comp = new ResetPassword();
  comp._createRenderer();
  comp.render();
  return comp;
}

function fillPasswords(comp: ResetPassword, password: string, confirm: string) {
  const inputs = comp.shadow?.querySelectorAll(
    'input[type="password"]'
  ) as NodeListOf<HTMLInputElement>;
  inputs[0].value = password;
  inputs[1].value = confirm;
}

async function submitForm(comp: ResetPassword) {
  await fireEvent(
    comp.shadow?.querySelector('form.reset-form')!,
    new Event('submit')
  );
}

describe('ResetPassword', () => {
  let pushStateSpy: jest.SpyInstance;

  beforeEach(() => {
    pushStateSpy = jest
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});
    jest.spyOn(authService, 'resetPassword').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('no token in URL', () => {
    it('shows "Link expired" heading', () => {
      const comp = createResetPassword(null);
      expect(comp.shadow?.querySelector('h2.form-title')?.textContent).toBe(
        'Link expired'
      );
    });

    it('shows an error message', () => {
      const comp = createResetPassword(null);
      expect(comp.shadow?.querySelector('.reset-error')).not.toBeNull();
    });

    it('does not show the password form', () => {
      const comp = createResetPassword(null);
      expect(comp.shadow?.querySelector('form.reset-form')).toBeNull();
    });

    it('shows a "Go to sign in" button', () => {
      const comp = createResetPassword(null);
      expect(comp.shadow?.querySelector('button.secondary')?.textContent).toBe(
        'Go to sign in'
      );
    });

    it('"Go to sign in" button navigates to /', async () => {
      const comp = createResetPassword(null);
      await fireClick(comp.shadow?.querySelector('button.secondary')!);
      expect(pushStateSpy).toHaveBeenCalledWith(
        { path: '/' },
        '/',
        expect.stringContaining('/')
      );
    });
  });

  describe('valid token in URL', () => {
    it('shows the password reset form', () => {
      const comp = createResetPassword('abc123');
      expect(comp.shadow?.querySelector('form.reset-form')).not.toBeNull();
    });

    it('shows "Set new password" as the heading', () => {
      const comp = createResetPassword('abc123');
      expect(comp.shadow?.querySelector('h2.form-title')?.textContent).toBe(
        'Set new password'
      );
    });

    it('renders two password inputs', () => {
      const comp = createResetPassword('abc123');
      expect(
        comp.shadow?.querySelectorAll('input[type="password"]').length
      ).toBe(2);
    });

    it('shows a "Go to sign in" secondary button on the form', () => {
      const comp = createResetPassword('abc123');
      expect(comp.shadow?.querySelector('button.secondary')?.textContent).toBe(
        'Go to sign in'
      );
    });
  });

  describe('form validation', () => {
    it('does not submit when password is empty', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, '', '');
      await submitForm(comp);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('shows field error when password is empty', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, '', '');
      await submitForm(comp);
      expect(comp.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('does not submit when password is shorter than 8 characters', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'short', 'short');
      await submitForm(comp);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('shows field error when password is too short', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'short', 'short');
      await submitForm(comp);
      expect(comp.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('does not submit when confirm password is empty', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'validpassword', '');
      await submitForm(comp);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('does not submit when passwords do not match', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'validpassword', 'differentpassword');
      await submitForm(comp);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('shows field error when passwords do not match', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'validpassword', 'differentpassword');
      await submitForm(comp);
      expect(comp.shadow?.querySelector('.field-error')).not.toBeNull();
    });

    it('marks password input invalid when password is empty', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, '', '');
      await submitForm(comp);
      const inputs = comp.shadow?.querySelectorAll(
        'input[type="password"]'
      ) as NodeListOf<HTMLInputElement>;
      expect(inputs[0].className).toContain('invalid');
    });

    it('marks confirm password input invalid when passwords do not match', async () => {
      const comp = createResetPassword('abc123');
      fillPasswords(comp, 'validpassword', 'different');
      await submitForm(comp);
      const inputs = comp.shadow?.querySelectorAll(
        'input[type="password"]'
      ) as NodeListOf<HTMLInputElement>;
      expect(inputs[1].className).toContain('invalid');
    });
  });

  describe('successful reset', () => {
    it('calls authService.resetPassword with the token and new password', async () => {
      const comp = createResetPassword('my-reset-token');
      fillPasswords(comp, 'newpassword123', 'newpassword123');
      await submitForm(comp);
      expect(authService.resetPassword).toHaveBeenCalledWith(
        'my-reset-token',
        'newpassword123'
      );
    });

    it('navigates to / after a successful reset', async () => {
      const comp = createResetPassword('my-reset-token');
      fillPasswords(comp, 'newpassword123', 'newpassword123');
      await submitForm(comp);
      expect(pushStateSpy).toHaveBeenCalledWith(
        { path: '/' },
        '/',
        expect.stringContaining('/')
      );
    });
  });

  describe('failed reset', () => {
    it('shows an error message when reset fails', async () => {
      jest
        .spyOn(authService, 'resetPassword')
        .mockRejectedValue(new Error('Invalid or expired reset token'));
      const comp = createResetPassword('expired-token');
      fillPasswords(comp, 'newpassword123', 'newpassword123');
      await submitForm(comp);
      expect(comp.shadow?.querySelector('.reset-error')).not.toBeNull();
    });

    it('does not navigate when reset fails', async () => {
      jest
        .spyOn(authService, 'resetPassword')
        .mockRejectedValue(new Error('Invalid or expired reset token'));
      const comp = createResetPassword('expired-token');
      fillPasswords(comp, 'newpassword123', 'newpassword123');
      await submitForm(comp);
      expect(pushStateSpy).not.toHaveBeenCalled();
    });

    it('keeps the form visible after a failed reset', async () => {
      jest
        .spyOn(authService, 'resetPassword')
        .mockRejectedValue(new Error('Invalid or expired reset token'));
      const comp = createResetPassword('expired-token');
      fillPasswords(comp, 'newpassword123', 'newpassword123');
      await submitForm(comp);
      expect(comp.shadow?.querySelector('form.reset-form')).not.toBeNull();
    });
  });

  describe('"Go to sign in" button on the form', () => {
    it('navigates to / when clicked', async () => {
      const comp = createResetPassword('abc123');
      await fireClick(comp.shadow?.querySelector('button.secondary')!);
      expect(pushStateSpy).toHaveBeenCalledWith(
        { path: '/' },
        '/',
        expect.stringContaining('/')
      );
    });
  });
});

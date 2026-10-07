import {
  Avatar,
  Button,
  Component,
  Date as DateView,
  Icon,
  InfoBox,
  Input,
  Loading,
  PropertyGroup,
  PropertyRow,
  register,
  Select,
  theme,
} from 'rewild-ui';
import { DetailPage } from './DetailPage';
import { UserAccount, UpdateUserRequest } from '../../../api/admin';
import { authService } from '../../../api/auth/auth-service';
import { adminStore, roleLabel, USER_ROLES } from '../../stores/AdminStore';
import { confirmationStore } from '../../stores/ConfirmationStore';

type Props = {
  userId: string;
  /** Return to the user list. */
  onBack: () => void;
};

type Notice = { variant: 'info' | 'error'; title: string; text: string };

/**
 * The `/admin/users/:userId` view inside the User Management tab. Edits are held locally and only sent when
 * Update is pressed. The page is built once and patched in place so typing
 * never rebuilds the inputs or the Update button mid-click.
 */
@register('x-admin-user-detail')
export class UserDetailPage extends Component<Props> {
  init() {
    const userId = this.props.userId;
    const isSelf = authService.getUserId() === userId;

    const [user, setUser] = this.useState<UserAccount | null>(null);
    const [loadError, setLoadError] = this.useState<string | null>(null);
    const [notice, setNotice] = this.useState<Notice | null>(null);

    let draft: UpdateUserRequest = { displayName: '', role: 'user' };
    let saving = false;
    let requested = false;
    let formFor: UserAccount | null = null;

    const isDirty = () => {
      const current = user();
      if (!current) return false;
      return (
        draft.displayName.trim() !== current.displayName ||
        draft.role !== current.role
      );
    };

    const syncActions = () => {
      updateButton.disabled =
        saving || !isDirty() || draft.displayName.trim().length === 0;
    };

    const applyUser = (next: UserAccount) => {
      draft = { displayName: next.displayName, role: next.role };
      setUser(next);
    };

    const load = async () => {
      requested = true;
      try {
        applyUser(await adminStore.getUser(userId));
      } catch (err: any) {
        setLoadError(err.message);
      }
    };

    const onUpdate = async () => {
      saving = true;
      syncActions();
      try {
        applyUser(
          await adminStore.updateUser(userId, {
            displayName: draft.displayName.trim(),
            role: draft.role,
          })
        );
        setNotice({ variant: 'info', title: 'Saved', text: 'User updated.' });
      } catch (err: any) {
        setNotice({
          variant: 'error',
          title: 'Update failed',
          text: err.message,
        });
      }
      saving = false;
      syncActions();
    };

    const onPasswordReset = () => {
      const email = user()!.email;
      confirmationStore.show(
        'Send Password Reset',
        `Email a password reset link to ${email}?`,
        async () => {
          try {
            await adminStore.sendPasswordReset(userId);
            setNotice({
              variant: 'info',
              title: 'Password reset sent',
              text: `A reset link was emailed to ${email}.`,
            });
          } catch (err: any) {
            setNotice({
              variant: 'error',
              title: 'Password reset failed',
              text: err.message,
            });
          }
        },
        { okLabel: 'Send' }
      );
    };

    const updateButton = (
      <Button onClick={onUpdate} disabled>
        Update
      </Button>
    ) as Button;

    const buildForm = (current: UserAccount) => {
      const signInMethods = [
        current.hasPassword ? 'Password' : null,
        current.hasGoogle ? 'Google' : null,
      ].filter(Boolean);

      return (
        <div class="form">
          <div class="summary">
            <Avatar src={current.photoUrl ?? undefined} size="m" />
            <div>
              <div class="name">{current.displayName}</div>
              <div class="meta">
                {current.email} · {roleLabel(current.role)}
              </div>
            </div>
          </div>

          <PropertyGroup title="Profile">
            <PropertyRow label="Display name">
              <Input
                value={draft.displayName}
                fullWidth
                onInput={(value) => {
                  draft.displayName = value;
                  syncActions();
                }}
              />
            </PropertyRow>
            <PropertyRow label="Role">
              {isSelf ? (
                [
                  <span>{roleLabel(current.role)}</span>,
                  <span class="hint">You cannot change your own role</span>,
                ]
              ) : (
                <Select
                  value={draft.role}
                  options={USER_ROLES}
                  onChange={(value) => {
                    draft.role = value;
                    syncActions();
                  }}
                />
              )}
            </PropertyRow>
          </PropertyGroup>

          <PropertyGroup title="Account">
            <PropertyRow label="Email">
              <span class="text">{current.email}</span>
              <Button variant="text" size="s" onClick={onPasswordReset}>
                <Icon icon="mail" size="s" />
                <span>Send password reset</span>
              </Button>
            </PropertyRow>
            <PropertyRow label="Sign-in methods">
              {signInMethods.length ? signInMethods.join(', ') : 'None'}
            </PropertyRow>
            <PropertyRow label="Projects">
              {String(current.projectCount)}
            </PropertyRow>
            <PropertyRow label="Joined">
              <DateView date={current.createdAt} withTime={false} />
            </PropertyRow>
            <PropertyRow label="User ID">
              <span class="text mono">{current.id}</span>
            </PropertyRow>
          </PropertyGroup>
        </div>
      );
    };

    const noticeHost = <div class="notice" />;
    const formHost = <div />;
    const page = (
      <DetailPage breadcrumbs={[]}>
        <div slot="actions">{updateButton}</div>
        {noticeHost}
        {formHost}
      </DetailPage>
    ) as DetailPage;

    return () => {
      if (!requested) load();

      const current = user();

      page.props = {
        ...page.props,
        breadcrumbs: [
          { label: 'User Management', onClick: this.props.onBack },
          { label: current?.displayName ?? 'User' },
        ],
      };

      const n = notice();
      noticeHost.replaceChildren(
        ...(n
          ? [
              <InfoBox variant={n.variant} title={n.title}>
                {n.text}
              </InfoBox>,
            ]
          : [])
      );

      if (current && current !== formFor) {
        formFor = current;
        formHost.replaceChildren(buildForm(current));
      } else if (!current) {
        const err = loadError();
        formHost.replaceChildren(
          err ? (
            <InfoBox variant="error" title="Could not load user">
              {err}
            </InfoBox>
          ) : (
            <Loading />
          )
        );
      }

      syncActions();
      return page;
    };
  }

  getStyle() {
    return StyledUserDetailPage;
  }
}

const StyledUserDetailPage = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: ${theme.space.m};
    margin: 0 0 ${theme.space.xl} 0;
    font-family: var(--font-family);
  }

  .name {
    font-size: ${theme.colors.fontSizeLarge};
    font-weight: 500;
    color: ${theme.colors.onSurface};
  }

  .meta {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 400;
    color: ${theme.colors.onSurfaceLight};
  }

  .notice x-info-box {
    display: block;
    margin: 0 0 ${theme.space.l} 0;
  }

  .form x-input {
    flex: 1;
    max-width: 360px;
  }

  .hint {
    font-size: 12px;
    color: ${theme.colors.onSurfaceLight};
  }

  .text {
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: monospace;
    font-size: 13px;
  }
`);

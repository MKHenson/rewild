import { IProject, StoredRecord } from 'models';
import {
  Avatar,
  Button,
  Component,
  Date as DateView,
  InfoBox,
  register,
  Table,
  TableColumn,
  theme,
  Typography,
} from 'rewild-ui';
import {
  addShare,
  getShares,
  ProjectShare,
  revokeShare,
} from '../../../../api/shares';
import { UserSummary } from '../../../../api/users';
import { isSavedOnServer } from '../../../../database/database';
import { authStore } from '../../../stores/AuthStore';
import { UserPicker } from '../../common/UserPicker';

interface Props {
  project: StoredRecord<IProject>;
}

/** The Sharing tab of Project Settings: the owner lists, adds and revokes play access. Changes apply at once. */
@register('x-project-sharing-panel')
export class ProjectSharingPanel extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);

    const [shares, setShares] = this.useState<ProjectShare[] | null>(null);
    const [error, setError] = this.useState<string | null>(null);
    const [busy, setBusy] = this.useState(false);
    // Loads once it becomes available, on the first render that finds it so.
    let loaded = false;

    const available = () =>
      authStore.loggedIn && isSavedOnServer(this.props.project);

    const load = async () => {
      if (loaded || !available()) return;
      loaded = true;
      try {
        setShares(await getShares(this.props.project.id));
      } catch (err) {
        loaded = false;
        setError(err instanceof Error ? err.message : String(err));
        setShares([]);
      }
    };

    const run = async (task: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    };

    const onAdd = (user: UserSummary) =>
      run(async () => {
        const share = await addShare(this.props.project.id, user.id);
        setShares([
          share,
          ...(shares() ?? []).filter((s) => s.userId !== share.userId),
        ]);
      });

    const onRevoke = (share: ProjectShare) =>
      run(async () => {
        await revokeShare(this.props.project.id, share.userId);
        setShares((shares() ?? []).filter((s) => s.userId !== share.userId));
      });

    const picker = <UserPicker onSelect={onAdd} />;

    const columns: TableColumn<ProjectShare>[] = [
      {
        label: '',
        width: '48px',
        render: (s) => <Avatar src={s.photoUrl ?? undefined} size="xs" />,
      },
      { label: 'Player', render: (s) => s.displayName },
      {
        label: 'Shared by',
        width: '160px',
        render: (s) => s.grantedByName ?? 'Unknown',
      },
      {
        label: 'Shared',
        width: '110px',
        render: (s) => (
          <DateView date={s.createdAt} variant="short" withTime={false} />
        ),
      },
      {
        label: '',
        width: '96px',
        render: (s) => (
          <Button
            variant="ghost"
            size="s"
            disabled={busy()}
            onClick={() => onRevoke(s)}>
            Revoke
          </Button>
        ),
      },
    ];

    return () => {
      if (!authStore.loggedIn)
        return (
          <InfoBox variant="info" title="Sign in to share">
            Sharing needs an account. Sign in, and sync the project to your
            account, to let other players play it.
          </InfoBox>
        );

      if (!isSavedOnServer(this.props.project))
        return (
          <InfoBox variant="info" title="Not saved to your account yet">
            This project is only on this device. It can be shared once it syncs
            to your account.
          </InfoBox>
        );

      load();

      return (
        <div class="sharing">
          <div class="field">
            <Typography variant="label">Share with a player</Typography>
            {picker}
          </div>
          {error() ? (
            <InfoBox variant="error" title="Sharing failed">
              {error()}
            </InfoBox>
          ) : null}
          <Table
            columns={columns}
            rows={shares() ?? []}
            loading={shares() === null}
            emptyMessage="This project is not shared with anyone."
          />
        </div>
      );
    };
  }

  getStyle() {
    return StyledProjectSharingPanel;
  }
}

const StyledProjectSharingPanel = cssStylesheet(css`
  :host {
    display: block;
  }

  .sharing > x-typography,
  .sharing > x-info-box,
  .field {
    display: block;
    margin: 0 0 ${theme.space.l} 0;
  }

  .field x-user-picker {
    margin-top: 0.25rem;
  }
`);

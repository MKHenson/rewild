import {
  Avatar,
  Component,
  Date as DateView,
  InfoBox,
  register,
  Table,
  TableColumn,
} from 'rewild-ui';
import { UserAccount } from '../../../api/admin';
import { adminStore, roleLabel } from '../../stores/AdminStore';

type Props = {
  onSelect: (user: UserAccount) => void;
};

const columns: TableColumn<UserAccount>[] = [
  {
    label: '',
    width: '48px',
    render: (user) => <Avatar src={user.photoUrl ?? undefined} size="s" />,
  },
  { label: 'Name', render: (user) => user.displayName },
  { label: 'Email', width: '30%', render: (user) => user.email },
  { label: 'Role', width: '120px', render: (user) => roleLabel(user.role) },
  {
    label: 'Projects',
    width: '90px',
    render: (user) => String(user.projectCount),
  },
  {
    label: 'Joined',
    width: '160px',
    render: (user) => <DateView date={user.createdAt} withTime={false} />,
  },
];

@register('x-admin-user-list')
export class UserList extends Component<Props> {
  init() {
    this.on(adminStore.dispatcher);

    this.onMount = () => {
      adminStore.fetchUsers();
    };

    return () => (
      <div class="list">
        {adminStore.error ? (
          <InfoBox variant="error" title="Could not load users">
            {adminStore.error}
          </InfoBox>
        ) : null}
        <Table
          columns={columns}
          rows={adminStore.users}
          loading={adminStore.loading}
          emptyMessage="No users found"
          onRowClick={this.props.onSelect}
        />
      </div>
    );
  }

  getStyle() {
    return css`
      :host {
        display: block;
        height: 100%;
      }
      .list {
        height: 100%;
        overflow: auto;
      }
    `;
  }
}

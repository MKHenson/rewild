import {
  Avatar,
  Component,
  Date as DateView,
  InfoBox,
  register,
  Table,
  TableColumn,
  TablePagination,
} from 'rewild-ui';
import { UserAccount } from '../../../api/admin';
import { adminStore, roleLabel } from '../../stores/AdminStore';

type Props = {
  onSelect: (user: UserAccount) => void;
};

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

const columns: TableColumn<UserAccount>[] = [
  {
    label: '',
    width: '48px',
    render: (user) => <Avatar src={user.photoUrl ?? undefined} size="xs" />,
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
    width: '120px',
    render: (user) => (
      <DateView date={user.createdAt} withTime={false} variant="short" />
    ),
  },
];

@register('x-admin-user-list')
export class UserList extends Component<Props> {
  init() {
    this.on(adminStore.dispatcher);

    this.onMount = () => {
      adminStore.fetchUsers();
    };

    return () => {
      const { users, usersPerPage } = adminStore;
      // A refresh can leave fewer users than the page that was open.
      const lastPage = Math.max(0, Math.ceil(users.length / usersPerPage) - 1);
      const page = Math.min(adminStore.usersPage, lastPage);
      const rows = users.slice(page * usersPerPage, (page + 1) * usersPerPage);

      return (
        <div class="list">
          {adminStore.error ? (
            <InfoBox variant="error" title="Could not load users">
              {adminStore.error}
            </InfoBox>
          ) : null}
          <div class="table">
            <Table
              columns={columns}
              rows={rows}
              loading={adminStore.loading}
              emptyMessage="No users found"
              onRowClick={this.props.onSelect}
            />
          </div>
          <TablePagination
            count={users.length}
            page={page}
            rowsPerPage={usersPerPage}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            disabled={adminStore.loading}
            onPageChange={(next) => adminStore.setUsersPage(next)}
            onRowsPerPageChange={(size) => adminStore.setUsersPerPage(size)}
          />
        </div>
      );
    };
  }

  getStyle() {
    return css`
      :host {
        display: block;
        height: 100%;
      }
      .list {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .table {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }
      x-table-pagination {
        flex: none;
      }
    `;
  }
}

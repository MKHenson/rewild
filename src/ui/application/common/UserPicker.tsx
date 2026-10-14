import { Autocomplete, Avatar, Component, register } from 'rewild-ui';
import { searchUsers, UserSummary } from '../../../api/users';

interface Props {
  onSelect: (user: UserSummary) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Finds another user by display name or exact email. Logged in only. */
@register('x-user-picker')
export class UserPicker extends Component<Props> {
  init() {
    return () => (
      <Autocomplete
        search={searchUsers}
        renderItem={(user: UserSummary) => [
          <Avatar src={user.photoUrl ?? undefined} size="s" />,
          <span>{user.displayName}</span>,
        ]}
        onSelect={(user: UserSummary) => this.props.onSelect(user)}
        minLength={2}
        disabled={this.props.disabled}
        placeholder={this.props.placeholder ?? 'Name or exact email'}
        emptyMessage="No users found"
      />
    );
  }

  getStyle() {
    return StyledUserPicker;
  }
}

const StyledUserPicker = cssStylesheet(css`
  :host {
    display: block;
  }
`);

import { Component, InfoBox, Modal, register, Tab, Tabs } from 'rewild-ui';
import { authStore } from '../../stores/AuthStore';
import { UserList } from './UserList';

type Props = {
  onClose: () => void;
  onOpenUser: (userId: string) => void;
};

/** The `/admin` route. Each admin section is a tab; content renders only for super admins. */
@register('x-admin-page')
export class AdminPage extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);

    let sections: JSX.Element | null = null;
    const denied = <AdminAccessDenied />;
    const body = <div class="body" />;

    const modal = (
      <Modal
        open
        title="Administration"
        hideOk
        cancelLabel="Close"
        onClose={this.props.onClose}
        css={AdminModalOverrides}>
        {body}
      </Modal>
    );

    return () => {
      if (authStore.isSuperAdmin && !sections) {
        sections = (
          <Tabs orientation="vertical">
            <Tab label="User Management">
              <UserList onSelect={(user) => this.props.onOpenUser(user.id)} />
            </Tab>
          </Tabs>
        );
      }

      const content = authStore.isSuperAdmin ? sections! : denied;
      if (body.firstChild !== content) body.replaceChildren(content);
      return modal;
    };
  }

  getStyle() {
    return StyledAdminPage;
  }
}

/** Shown in place of admin content to anyone who is not a super admin. */
export const AdminAccessDenied = () => (
  <InfoBox variant="error" title="Restricted">
    Administration is only available to super admins.
  </InfoBox>
);

const StyledAdminPage = cssStylesheet(css`
  x-tabs {
    height: 70vh;
  }
  x-tab {
    padding: 0 0 0 1.5rem;
  }
`);

const AdminModalOverrides = css`
  :host .modal {
    width: 1100px;
    max-width: 92vw;
  }
  :host .content {
    overflow: hidden;
  }
`;

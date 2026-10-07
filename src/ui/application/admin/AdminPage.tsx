import {
  Component,
  InfoBox,
  Modal,
  navigate,
  register,
  Route,
  RouterSwitch,
  Tab,
  Tabs,
} from 'rewild-ui';
import { authStore } from '../../stores/AuthStore';
import { UserDetailPage } from './UserDetailPage';
import { UserList } from './UserList';

type Props = {
  onClose: () => void;
};

const USERS_PATH = '/admin';

/**
 * The `/admin` route and everything under it. Each admin section is a tab whose
 * list and item views are nested routes, so the modal stays open while moving
 * between them. Content renders only for super admins.
 */
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
              <RouterSwitch>
                <Route
                  path="/admin/users/:userId"
                  onRender={(params) => (
                    <UserDetailPage
                      userId={params.userId}
                      onBack={() => navigate(USERS_PATH)}
                    />
                  )}
                />
                <Route
                  path={USERS_PATH}
                  onRender={() => (
                    <UserList
                      onSelect={(user) => navigate(`/admin/users/${user.id}`)}
                    />
                  )}
                />
              </RouterSwitch>
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
    height: 80vh;
  }
  x-tab {
    padding: 0 0 0 1.5rem;
  }
  x-router-switch,
  x-route[active] {
    display: block;
    height: 100%;
  }
`);

const AdminModalOverrides = css`
  :host .modal {
    width: 1400px;
    max-width: 94vw;
  }
  :host .content {
    overflow: hidden;
  }
`;

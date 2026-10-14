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
import { PUBLIC_PATH, PublicGamePanel } from './PublicGamePanel';
import { PROJECTS_PATH, ProjectList } from './ProjectList';
import { UserDetailPage } from './UserDetailPage';
import { UserList } from './UserList';

type Props = {
  onClose: () => void;
};

const USERS_PATH = '/admin';
const TAB_PATHS = [USERS_PATH, PROJECTS_PATH, PUBLIC_PATH];

/** The tab for the current URL. Users is the fallback, as it owns `/admin` and `/admin/users/...`. */
function activeTabIndex(): number {
  const path = window.location.pathname;
  const index = TAB_PATHS.findIndex(
    (tabPath) => tabPath !== USERS_PATH && (path === tabPath || path.startsWith(tabPath + '/'))
  );
  return index < 0 ? 0 : index;
}

/**
 * The `/admin` route and everything under it. Each admin section is a tab whose
 * list and item views are nested routes, so the modal stays open while moving
 * between them. Content renders only for super admins.
 */
@register('x-admin-page')
export class AdminPage extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);

    let sections: Tabs | null = null;
    const denied = <AdminAccessDenied />;
    const body = <div class="body" />;

    const syncTab = () => {
      if (sections) sections.props = { ...sections.props, activeIndex: activeTabIndex() };
    };

    this.onMount = () => {
      window.addEventListener('history-pushed', syncTab);
    };

    this.onCleanup = () => {
      window.removeEventListener('history-pushed', syncTab);
    };

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
          <Tabs
            orientation="vertical"
            activeIndex={activeTabIndex()}
            onChange={(index) => navigate(TAB_PATHS[index])}>
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
            <Tab label="Projects">
              <RouterSwitch>
                <Route
                  path={PROJECTS_PATH}
                  onRender={() => (
                    <ProjectList onRun={(id) => navigate(`/game/${id}`)} />
                  )}
                />
              </RouterSwitch>
            </Tab>
            <Tab label="Public">
              <RouterSwitch>
                <Route
                  path={PUBLIC_PATH}
                  onRender={() => <PublicGamePanel />}
                />
              </RouterSwitch>
            </Tab>
          </Tabs>
        ) as Tabs;
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

import { Component, Modal, register, Tab, Tabs } from 'rewild-ui';
import { StoryModePanel } from './StoryModePanel';

type Props = {
  onStart: (projectId: string) => void;
  onBack: () => void;
};

/**
 * The `/launch` route, opened by New Game: picks the game to play. Each tab reports the
 * project it would start, and Start plays the one of the open tab.
 */
@register('x-launch-page')
export class LaunchPage extends Component<Props> {
  init() {
    const selections: (string | null)[] = [];
    let activeTab = 0;

    const startId = () => selections[activeTab] ?? null;

    const syncStart = () => {
      modal.props = { ...modal.props, okDisabled: !startId() };
    };

    const selectFor = (tab: number) => (projectId: string | null) => {
      selections[tab] = projectId;
      syncStart();
    };

    // Built once: re-creating the modal would remount the tabs and reload their data.
    const modal = (
      <Modal
        open
        title="New Game"
        okLabel="Start"
        okDisabled
        cancelLabel="Back"
        backgroundCanClose={false}
        onOk={() => this.props.onStart(startId()!)}
        onCancel={this.props.onBack}
        css={LaunchModalOverrides}>
        <Tabs
          orientation="vertical"
          onChange={(index) => {
            activeTab = index;
            syncStart();
          }}>
          <Tab label="Story Mode">
            <StoryModePanel onSelect={selectFor(0)} />
          </Tab>
        </Tabs>
      </Modal>
    ) as Modal;

    return () => modal;
  }

  getStyle() {
    return StyledLaunchPage;
  }
}

const StyledLaunchPage = cssStylesheet(css`
  x-tabs {
    height: 70vh;
  }
  x-tab {
    padding: 0 0 0 1.5rem;
  }
`);

const LaunchModalOverrides = css`
  :host .modal {
    width: 1000px;
    max-width: 94vw;
  }
  :host .content {
    overflow: hidden;
  }
`;

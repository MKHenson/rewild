import { Modal, Button, Component, Icon, register } from 'rewild-ui';

type Props = {
  open: boolean;
  onResumeClick: () => void;
  onSettingsClick: () => void;
  onQuitClick: () => void;
};

@register('x-in-game-menu')
export class InGameMenu extends Component<Props> {
  init() {
    return () => (
      <Modal hideConfirmButtons open={this.props.open} withBackground>
        <div>
          <Button onClick={this.props.onResumeClick} fullWidth>
            Resume
          </Button>
          <Button onClick={this.props.onSettingsClick} fullWidth>
            <Icon size="s" icon="settings" />
            <span>Settings</span>
          </Button>
          <Button onClick={this.props.onQuitClick} fullWidth>
            Quit
          </Button>
        </div>
      </Modal>
    );
  }

  getStyle() {
    return StyledButtons;
  }
}

const StyledButtons = cssStylesheet(css`
  x-button {
    margin: 1rem 0 0 0;
  }

  x-button span {
    vertical-align: middle;
  }
`);

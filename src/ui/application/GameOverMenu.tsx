import { Modal, Button, Typography, Component, register } from 'rewild-ui';

type Props = {
  open: boolean;
  onQuitClick: () => void;
};

@register('x-game-over-menu')
export class GameOverMenu extends Component<Props> {
  init() {
    return () => (
      <Modal hideConfirmButtons open={this.props.open} withBackground>
        <Typography variant="h2">GAME OVER</Typography>
        <div>
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
`);

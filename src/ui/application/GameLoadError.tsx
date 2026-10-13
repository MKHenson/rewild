import { Button, Component, Modal, register, Typography } from 'rewild-ui';
import { GameNotFoundError } from '../../api/play';

type Props = {
  error: Error;
  onQuit: () => void;
};

/** Shown in place of the game when it could not start. */
@register('x-game-load-error')
export class GameLoadError extends Component<Props> {
  init() {
    return () => {
      const { error } = this.props;
      const message =
        error instanceof GameNotFoundError
          ? error.message
          : `Something went wrong while loading the game. ${error.message}`;

      return (
        <Modal hideConfirmButtons open withBackground backgroundCanClose={false}>
          <Typography variant="h3">The game could not start</Typography>
          <Typography variant="body1">{message}</Typography>
          <Button onClick={this.props.onQuit} fullWidth>
            Main Menu
          </Button>
        </Modal>
      );
    };
  }

  getStyle() {
    return StyledGameLoadError;
  }
}

const StyledGameLoadError = cssStylesheet(css`
  x-typography {
    display: block;
    margin: 0 0 1rem 0;
  }

  x-button {
    margin: 1rem 0 0 0;
  }
`);

import { authStore } from '../stores/AuthStore';
import {
  Modal,
  Button,
  Typography,
  Icon,
  Loading,
  Component,
  register,
  InfoBox,
} from 'rewild-ui';

type Props = {
  open: boolean;
  onStart: () => void;
  onOptions: () => void;
  onEditor: () => void;
};

@register('x-main-menu')
export class MainMenu extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);

    return () => {
      const props = this.props;

      return (
        <Modal
          hideConfirmButtons
          withBackground={false}
          open={props.open}
          css={MainMenuOverrides}
          title={
            <Typography variant="h2" style={`text-align: center; margin: 0;`}>
              Rewild
            </Typography>
          }>
          <div class="tag-line">
            <Typography variant="light">
              Welcome to rewild. A game about exploration, natural history and
              saving the planet
            </Typography>
            <InfoBox variant="warning" title="Attention">
              For now the game requires access to a restricted database. You can
              however use the editor and build a local experience which you can
              run yourself. Just open the editor, save your work and then click
              the New Game button. You will need at least one container in order
              to experience anything.
            </InfoBox>
          </div>
          {authStore.loading ? (
            <div style={`text-align: center;`}>
              <Loading />
            </div>
          ) : (
            <div class="styled-buttons">
              <Button onClick={props.onStart} fullWidth>
                <span>New Game (WIP)</span>
              </Button>
              <Button onClick={props.onOptions} fullWidth>
                <Icon size="s" icon="settings" />
                <span>Options</span>
              </Button>
              <Button onClick={props.onEditor} fullWidth>
                <Icon size="s" icon="wrench" />
                <span>Editor</span>
              </Button>
            </div>
          )}
        </Modal>
      );
    };
  }

  getStyle() {
    return css`
      .styled-buttons x-button {
        margin: 1rem 0 0 0;
      }

      x-icon {
        margin: 0 4px 0 0;
      }

      x-button span {
        vertical-align: middle;
      }

      .tag-line .light {
        margin: 0 auto 2rem auto;
        width: 70%;
        text-align: center;
      }
    `;
  }
}

const MainMenuOverrides = css`
  :host .modal {
    width: 800px;
    top: 10%;
    /* Popup centres the box vertically; anchor it to top instead. */
    transform: translate(-50%, 0);
    background-color: rgba(255, 255, 255, 0.9);
  }
`;

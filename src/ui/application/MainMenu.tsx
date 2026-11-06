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
  onAdmin: () => void;
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
              Welcome to rewild. A game about exploration, natural history
            </Typography>
            <InfoBox variant="warning" title="Getting started">
              Rewild is still being built, so expect things to change and
              sometimes break. Start a New Game to play Story Mode or a game
              you've made, or open the Editor to build your own.
            </InfoBox>
          </div>
          {authStore.loading ? (
            <div style={`text-align: center;`}>
              <Loading />
            </div>
          ) : (
            <div class="styled-buttons">
              <Button onClick={props.onStart} fullWidth>
                <Icon size="s" icon="play" />
                <span>New Game</span>
              </Button>
              <Button variant="glass" onClick={props.onOptions} fullWidth>
                <Icon size="s" icon="settings" />
                <span>Options</span>
              </Button>
              <Button variant="glass" onClick={props.onEditor} fullWidth>
                <Icon size="s" icon="wrench" />
                <span>Editor</span>
              </Button>
              {authStore.isSuperAdmin ? (
                <Button variant="glass" onClick={props.onAdmin} fullWidth>
                  <Icon size="s" icon="shield" />
                  <span>Administration</span>
                </Button>
              ) : null}
            </div>
          )}
        </Modal>
      );
    };
  }

  getStyle() {
    return css`
      .styled-buttons {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 1rem 0 0 0;
      }

      /* Menu buttons lift and brighten under the cursor. The press still lands
         instantly, so transitions stop while it is held. */
      .styled-buttons x-button {
        transition: background-color 0.15s ease, box-shadow 0.15s ease,
          color 0.15s ease, border-color 0.15s ease, transform 0.15s ease,
          filter 0.15s ease;
      }
      .styled-buttons x-button:hover {
        transform: translateY(-1px);
        filter: brightness(1.08);
      }
      .styled-buttons x-button:active {
        transform: translateY(1px);
        filter: none;
        transition-duration: 0s;
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
  }
`;

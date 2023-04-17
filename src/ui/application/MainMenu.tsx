import { Modal } from "rewild-ui/lib/common/Modal";
import { Button } from "rewild-ui/lib/common/Button";
import { Typography } from "rewild-ui/lib/common/Typography";
import { MaterialIcon } from "rewild-ui/lib/common/MaterialIcon";
import { authStore } from "../stores/AuthStore";
import { Loading } from "rewild-ui/lib/common/Loading";
import { Component, register } from "rewild-ui/lib/Component";

type Props = {
  open: boolean;
  onStart: () => void;
  onEditor: () => void;
};

@register("x-main-menu")
export class MainMenu extends Component<Props> {
  init() {
    const authState = this.observeStore(authStore);
    const onOptionsClick = () => {};

    const [count, setCount] = this.useState(0);

    return () => {
      const props = this.props;

      return (
        <Modal
          hideConfirmButtons
          withBackground={false}
          open={props.open}
          title={
            <Typography variant="h2" style={`text-align: center; margin: 0;`}>
              Rewild
            </Typography>
          }
        >
          <div class="tag-line">
            <Typography variant="light" onClick={(e) => setCount(count() + 1)}>
              Welcome to rewild. A game about exploration, natural history and saving the planet
              <span>Count {count().toString()}</span>
            </Typography>
          </div>
          {authState.loading ? (
            <div style={`text-align: center;`}>
              <Loading />
            </div>
          ) : (
            <div class="styled-buttons">
              <Button onClick={props.onStart} fullWidth>
                <span>New Game</span>
              </Button>
              <Button onClick={onOptionsClick} fullWidth disabled>
                <span>Options</span>
              </Button>
              <Button
                disabled={!authState.loggedIn || authState.user?.email !== "mat@webinate.net"}
                onClick={props.onEditor}
                fullWidth
              >
                <MaterialIcon size="s" icon="build_circle" />
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

      x-material-icon {
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

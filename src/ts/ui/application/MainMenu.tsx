import { Component, Show } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Typography } from "../common/Typography";
import { MaterialIcon } from "../common/MaterialIcon";
import { styled } from "solid-styled-components";
import { useAuth } from "../providers/AuthProvider";
import { Loading } from "../common/Loading";

type Props = {
  open: boolean;
  onStart: () => void;
  onEditor: () => void;
};

export const MainMenu: Component<Props> = (props) => {
  const onOptionsClick = () => {};

  const { loading, loggedIn } = useAuth()!;

  return (
    <Modal
      hideConfirmButtons
      open={props.open}
      title={
        <Typography variant="h2" style={{ "text-align": "center", margin: "0" }}>
          Rewild
        </Typography>
      }
    >
      <StyledTagLine>
        <Typography variant="light">
          Welcome to rewild. A game about exploration, natural history and saving the planet
        </Typography>
      </StyledTagLine>
      <Show
        when={loading()}
        fallback={
          <StyledButtons>
            <Button onClick={props.onStart} fullWidth>
              New Game
            </Button>
            <Button onClick={onOptionsClick} fullWidth disabled>
              Options
            </Button>
            <Button
              disabled={!loggedIn() || loggedIn()?.email !== "mat@webinate.net"}
              onClick={props.onEditor}
              fullWidth
            >
              <MaterialIcon size="s" icon="build_circle" /> Editor
            </Button>
          </StyledButtons>
        }
      >
        <div style={{ "text-align": "center" }}>
          <Loading />
        </div>
      </Show>
    </Modal>
  );
};

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

const StyledTagLine = styled.div`
  .light {
    margin: 0 auto 2rem auto;
    width: 70%;
    text-align: center;
  }
`;

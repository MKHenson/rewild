import { Component, Show } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Typography } from "../common/Typography";
import { MaterialIcon } from "../common/MaterialIcon";
import { styled } from "solid-styled-components";
import { useAuth } from "../providers/AuthProvider";

type Props = {
  open: boolean;
  onStart: () => void;
  onEditor: () => void;
};

export const MainMenu: Component<Props> = (props) => {
  const onOptionsClick = () => {};

  const { loading, loggedIn } = useAuth()!;

  return (
    <Modal hideConfirmButtons open={props.open} title="Rewild">
      <Show when={loading()}>Loading...</Show>
      <Typography variant="body2">
        Welcome to rewild. A game about exploration, natural history and saving the planet
      </Typography>
      <StyledButtons>
        <Button onClick={props.onStart} fullWidth>
          New Game
        </Button>
        <Button onClick={onOptionsClick} fullWidth disabled>
          Options
        </Button>
        <Button disabled={!loggedIn()} onClick={props.onEditor} fullWidth>
          <MaterialIcon icon="build_circle" /> Editor
        </Button>
      </StyledButtons>
    </Modal>
  );
};

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

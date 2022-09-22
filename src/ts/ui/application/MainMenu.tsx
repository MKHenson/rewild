import { Component, onMount, Show } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Typography } from "../common/Typography";
import { MaterialIcon } from "../common/MaterialIcon";
import { styled } from "solid-styled-components";
import { useCounter } from "../providers/AuthProvider";
import { authUI } from "../../../firebase";
import { EmailAuthProvider, GoogleAuthProvider } from "firebase/auth";

type Props = {
  open: boolean;
  onStart: () => void;
  onEditor: () => void;
};

export const MainMenu: Component<Props> = (props) => {
  const onOptionsClick = () => {};

  const { loading, loggedIn } = useCounter()!;

  onMount(async () => {
    authUI.start("#sign-in", {
      signInOptions: [
        { provider: EmailAuthProvider.PROVIDER_ID, signInMethod: EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD },
        GoogleAuthProvider.PROVIDER_ID,
      ],
      // Other config options...
    });
  });

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
        <div id="sign-in" />
      </StyledButtons>
    </Modal>
  );
};

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

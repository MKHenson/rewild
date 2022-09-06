import { Component } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Typography } from "../common/Typography";
import { styled } from "solid-styled-components";

type Props = {
  open: boolean;
  onStart: () => void;
};

export const MainMenu: Component<Props> = (props) => {
  const onOptionsClick = () => {};

  return (
    <Modal hideConfirmButtons open={props.open} title="Rewild">
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
      </StyledButtons>
    </Modal>
  );
};

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;

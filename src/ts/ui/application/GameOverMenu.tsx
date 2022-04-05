import { Component } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { styled } from "solid-styled-components";
import { Typography } from "../common/Typography";

type Props = {
  open: boolean;
  onQuitClick: () => void;
};

export const GameOverMenu: Component<Props> = (props) => {
  return (
    <Modal hideConfirmButtons open={props.open}>
      <Typography variant="h2">GAME OVER</Typography>
      <StyledButtons>
        <Button onClick={props.onQuitClick} fullWidth>
          Quit
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

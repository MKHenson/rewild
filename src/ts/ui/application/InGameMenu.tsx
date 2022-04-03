import { Component } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { styled } from "solid-styled-components";

type Props = {
  open: boolean;
  onResumeClick: () => void;
  onQuitClick: () => void;
};

export const InGameMenu: Component<Props> = (props) => {
  return (
    <Modal hideConfirmButtons open={props.open}>
      <StyledButtons>
        <Button onClick={props.onResumeClick} fullWidth>
          Resume
        </Button>
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

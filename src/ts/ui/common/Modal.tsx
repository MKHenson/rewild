import { styled } from "solid-styled-components";
import { Component, Show } from "solid-js";
import { Button } from "./Button";
import { Popup } from "./Popup";

interface Props {
  title?: string;
  open: boolean;
  withBackground?: boolean;
  hideConfirmButtons?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

export const Modal: Component<Props> = (props) => {
  const handleCancel = (e: MouseEvent) => {
    props.onCancel && props.onCancel();
    props.onClose && props.onClose();
  };

  const handleOk = (e: MouseEvent) => {
    props.onOk && props.onOk();
    props.onClose && props.onClose();
  };

  return (
    <Popup open={props.open} onClose={props.onClose} withBackground={props.withBackground}>
      <StyledContent>
        <Show when={props.title}>
          <span class="title">{props.title}</span>
        </Show>
        <div class="content">{props.children}</div>
        {props.hideConfirmButtons ? null : (
          <div class="button-container">
            <Button onClick={handleCancel} class="cancel" variant="outlined">
              Cancel
            </Button>
            <Button onClick={handleOk} class="ok">
              Okay
            </Button>
          </div>
        )}
      </StyledContent>
    </Popup>
  );
};

const StyledContent = styled.div`
  .title {
    font-size: 18px;
  }
  .button-container {
    text-align: right;
  }
  .button-container > button {
    margin: 0 0 0 4px;
  }
  .content {
    padding: 0.5rem 0;
  }
`;

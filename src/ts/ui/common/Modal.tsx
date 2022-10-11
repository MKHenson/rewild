import { styled } from "solid-styled-components";
import { ParentComponent, JSX, Show } from "solid-js";
import { Button } from "./Button";
import { Popup } from "./Popup";
import { Typography } from "./Typography";

interface Props {
  title?: JSX.Element | string;
  open: boolean;
  withBackground?: boolean;
  hideConfirmButtons?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

export const Modal: ParentComponent<Props> = (props) => {
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
          {typeof props.title === "string" ? <Typography variant="h2">{props.title}</Typography> : props.title}
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

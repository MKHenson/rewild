import { styled } from "solid-styled-components";
import { Portal } from "solid-js/web";
import { Component } from "solid-js";
import { SolidButton } from "./SolidButton";

interface Props {
  title: string;
  open: boolean;
  hideConfirmButtons?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

export const SolidModal: Component<Props> = (props) => {
  const handleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("wrapper")) {
      props.onClose && props.onClose();
    }
  };

  const handleCancel = (e: MouseEvent) => {
    props.onCancel && props.onCancel();
    props.onClose && props.onClose();
  };

  const handleOk = (e: MouseEvent) => {
    props.onOk && props.onOk();
    props.onClose && props.onClose();
  };

  return (
    <Portal>
      <StyledWrapper class="wrapper" onClick={handleClick} visible={props.open}>
        <StyledModal class="modal">
          <span class="title">{props.title}</span>
          <div class="content">{props.children}</div>
          {props.hideConfirmButtons ? null : (
            <div class="button-container">
              <SolidButton onClick={handleCancel} class="cancel" variant="outlined">
                Cancel
              </SolidButton>
              <SolidButton onClick={handleOk} class="ok">
                Okay
              </SolidButton>
            </div>
          )}
        </StyledModal>
      </StyledWrapper>
    </Portal>
  );
};

const StyledWrapper = styled.div<{ visible: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transform: scale(1.1);
  transition: visibility 0s linear 0.25s, opacity 0.25s 0s, transform 0.25s;
  z-index: 1;

  ${(e) =>
    e.visible
      ? `opacity: 1;
  visibility: visible;
  transform: scale(1);
  transition: visibility 0s linear 0s, opacity 0.25s 0s, transform 0.25s;`
      : ""}
`;

const StyledModal = styled.div`
  padding: 1rem;
  background-color: var(--surface);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 5px;
  min-width: 300px;
  box-shadow: 2px 2px 2px 4px rgba(0, 0, 0, 0.1);

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

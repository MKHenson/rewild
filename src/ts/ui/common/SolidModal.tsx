import { Portal } from "solid-js/web";
import { Component } from "solid-js";

interface Props {
  title: string;
  hideConfirmButtons?: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onOk?: () => void;
}

export const SolidModal: Component<Props> = ({ title, children, onClose, onCancel, onOk, hideConfirmButtons }) => {
  const handleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("wrapper")) {
      onClose && onClose();
    }
  };

  const handleCancel = (e: MouseEvent) => {
    onCancel && onCancel();
  };

  const handleOk = (e: MouseEvent) => {
    onOk && onOk();
  };

  return (
    <Portal>
      <div class="wrapper" onClick={handleClick}>
        <div class="modal">
          <span class="title">{title}</span>
          <div class="content">{children}</div>
          {hideConfirmButtons ? null : (
            <div class="button-container">
              <button onClick={handleCancel} class="cancel">
                Cancel
              </button>
              <button onClick={handleOk} class="ok">
                Okay
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};

import { styled } from "solid-styled-components";
import { Portal } from "solid-js/web";
import { ParentComponent } from "solid-js";

interface Props {
  open: boolean;
  withBackground?: boolean;
  onClose?: () => void;
}

export const Popup: ParentComponent<Props> = (props) => {
  const handleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("wrapper")) {
      props.onClose && props.onClose();
    }
  };

  return (
    <Portal>
      <StyledWrapper
        class="wrapper popup"
        onClick={handleClick}
        visible={props.open}
        withBackground={props.withBackground || false}
      >
        <StyledModal class="modal">{props.children}</StyledModal>
      </StyledWrapper>
    </Portal>
  );
};

const StyledWrapper = styled.div<{ visible: boolean; withBackground: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: ${(e) => (!e.withBackground ? `none;` : "all")};
  background-color: ${(e) => (e.withBackground ? `rgba(0, 0, 0, 0.5);` : "none")};
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
  pointer-events: all;
  padding: 1rem;
  background-color: ${(e) => e.theme?.colors.surface};
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 5px;
  min-width: 300px;
  box-shadow: 2px 2px 2px 4px rgba(0, 0, 0, 0.1);
`;

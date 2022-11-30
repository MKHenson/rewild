import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  checked?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export const Switch: Component<Props> = (props) => {
  return (
    <StyledSwitch
      class="switch"
      classList={{
        checked: props.checked || false,
      }}
      onClick={props.onClick}
    />
  );
};

const StyledSwitch = styled.div`
  box-sizing: border-box;
  border-radius: 5px;
  cursor: pointer;
  position: relative;
  width: 40px;
  height: 25px;

  &:hover::after {
    box-shadow: 0 0 0 5px rgba(0, 0, 0, 0.1), ${(e) => e.theme?.colors.shadowShort1};
  }

  &::before {
    content: "";
    width: 100%;
    height: 60%;
    position: absolute;
    background-color: ${(e) => e.theme?.colors.subtle600};
    top: 20%;
    left: 0;
    border-radius: 7px;
    transition: background-color 0.5s;
  }

  &::after {
    content: "";
    width: 50%;
    height: 80%;
    position: absolute;
    background-color: ${(e) => e.theme?.colors.background};
    top: 10%;
    left: 0;
    border-radius: 100%;
    transition: left 0.5s, background-color 0.5s;
    box-shadow: ${(e) => e.theme?.colors.shadowShort1};
  }

  &.checked::after {
    left: 50%;
    background-color: ${(e) => e.theme?.colors.primary400};
  }
`;

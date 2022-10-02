import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type ButtonVariant = "contained" | "outlined" | "text";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  disabled?: boolean;
  variant?: ButtonVariant;
  color?: ButtonColor;
  fullWidth?: boolean;
  onClick?: (e: MouseEvent) => void;
  class?: string;
}

export const Button: Component<Props> = (props) => {
  return (
    <StyledButton
      fullWidth={props.fullWidth || false}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`${props.class} ${props.variant || "contained"} ${props.color || "primary"}`}
    >
      {props.children}
    </StyledButton>
  );
};

const StyledButton = styled.button<{ fullWidth: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 5px;
  border: none;
  text-transform: uppercase;
  font-weight: 500;
  font-family: var(--font-family);
  font-weight: 400;
  cursor: pointer;
  user-select: none;
  > * {
    vertical-align: middle;
  }
  ${(e) => (e.fullWidth ? "width: 100%;" : "")}
  transition: box-shadow 0.25s, background-color 0.25s;
  display: ${(e) => (e.fullWidth ? "block" : "inline-block")};

  &[disabled],
  &[disabled]:hover {
    opacity: 0.65;
    pointer-events: none;
  }

  &.contained {
    box-shadow: 2px 2px 2px rgb(0 0 0 / 30%);
  }

  &.contained:hover {
    box-shadow: 2px 2px 4px rgb(0 0 0 / 40%);
  }

  &.contained.primary {
    background: ${(e) => e.theme?.colors.primary400};
    color: ${(e) => e.theme?.colors.onPrimary400};
  }
  &.contained.primary:hover {
    background: ${(e) => e.theme?.colors.primary500};
    color: ${(e) => e.theme?.colors.onPrimary500};
  }
  &.contained.primary:active {
    background: ${(e) => e.theme?.colors.primary600};
    color: ${(e) => e.theme?.colors.onPrimary600};
  }

  &.contained.secondary {
    background: ${(e) => e.theme?.colors.secondary400};
    color: ${(e) => e.theme?.colors.onSecondary400};
  }
  &.contained.secondary:hover {
    background: ${(e) => e.theme?.colors.secondary500};
    color: ${(e) => e.theme?.colors.onSecondary500};
  }
  &.contained.secondary:active {
    background: ${(e) => e.theme?.colors.secondary600};
    color: ${(e) => e.theme?.colors.onSecondary600};
  }

  &.contained.error {
    background: ${(e) => e.theme?.colors.error400};
    color: ${(e) => e.theme?.colors.onError400};
  }
  &.contained.error:hover {
    background: ${(e) => e.theme?.colors.error500};
    color: ${(e) => e.theme?.colors.onError500};
  }
  &.contained.error:active {
    background: ${(e) => e.theme?.colors.error600};
    color: ${(e) => e.theme?.colors.onError600};
  }

  &.outlined,
  &.text {
    background: transparent;
  }
  &.outlined:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  &.outlined:active {
    background: rgba(0, 0, 0, 0.1);
  }

  &.text:hover {
    font-weight: 500;
  }

  &.outlined.primary {
    color: ${(e) => e.theme?.colors.primary400};
    border: 1px solid ${(e) => e.theme?.colors.primary400};
  }
  &.outlined.secondary {
    color: ${(e) => e.theme?.colors.secondary400};
    border: 1px solid ${(e) => e.theme?.colors.secondary400};
  }
  &.outlined.error {
    color: ${(e) => e.theme?.colors.error400};
    border: 1px solid ${(e) => e.theme?.colors.error400};
  }

  &.text.primary:hover {
    color: ${(e) => e.theme?.colors.primary400};
  }
  &.text.secondary:hover {
    color: ${(e) => e.theme?.colors.secondary400};
  }
  &.text.error:hover {
    color: ${(e) => e.theme?.colors.error400};
  }
`;

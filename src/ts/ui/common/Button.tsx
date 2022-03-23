import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
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
    background: var(--primary-400);
    color: var(--on-primary-400);
  }
  &.contained.primary:hover {
    background: var(--primary-500);
    color: var(--on-primary-500);
  }
  &.contained.primary:active {
    background: var(--primary-600);
    color: var(--on-primary-600);
  }

  &.contained.secondary {
    background: var(--secondary-400);
    color: var(--on-secondary-400);
  }
  &.contained.secondary:hover {
    background: var(--secondary-500);
    color: var(--on-secondary-500);
  }
  &.contained.secondary:active {
    background: var(--secondary-600);
    color: var(--on-secondary-600);
  }

  &.contained.error {
    background: var(--error-400);
    color: var(--on-errory-400);
  }
  &.contained.error:hover {
    background: var(--error-500);
    color: var(--on-error-500);
  }
  &.contained.error:active {
    background: var(--error-600);
    color: var(--on-error-600);
  }

  &.outlined {
    background: transparent;
  }
  &.outlined:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  &.outlined:active {
    background: rgba(0, 0, 0, 0.1);
  }

  &.outlined.primary {
    color: var(--primary-400);
    border: 1px solid var(--primary-400);
  }
  &.outlined.secondary {
    color: var(--secondary-400);
    border: 1px solid var(--secondary-400);
  }
  &.outlined.error {
    color: var(--errory-400);
    border: 1px solid var(--errory-400);
  }
`;

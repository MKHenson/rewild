import { styled } from "solid-styled-components";
import { Component, onMount } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  value?: string;
  placeholder?: string;
  autoFocus?: boolean;
  fullWidth?: boolean;
  onChange?: (val: string) => void;
  onClick?: (e: MouseEvent) => void;
}

export const Input: Component<Props> = (props) => {
  let inputRef!: HTMLInputElement;

  onMount(() => {
    if (props.autoFocus && inputRef) {
      inputRef.focus();
      inputRef.setSelectionRange(0, props.value?.length || null);
    }
  });

  const onClick = (e: MouseEvent) => {
    if (inputRef) {
      inputRef.focus();
      inputRef.setSelectionRange(0, props.value?.length || null);
    }

    if (props.onClick) props.onClick(e);
  };

  return (
    <StyledInput class="input" fullWidth={props.fullWidth || true}>
      <input
        ref={inputRef}
        autofocus={props.autoFocus}
        value={props.value || ""}
        onClick={onClick}
        placeholder={props.placeholder}
        onChange={props.onChange ? (e) => props.onChange!(e.currentTarget.value) : undefined}
      />
    </StyledInput>
  );
};

const StyledInput = styled.div<{ fullWidth: boolean }>`
  width: ${(e) => (e.fullWidth ? "100%" : "200px")};

  input {
    width: 100%;
    height: 100%;
    padding: 0.6rem;
    outline: none;
    box-sizing: border-box;
    font-family: var(--font-family);
    transition: all 0.25s;
    border: 1px solid transparent;
    border-bottom: 1px solid ${(e) => e.theme?.colors.onSurfaceBorder};
    background: ${(e) => e.theme?.colors.surface};
    color: ${(e) => e.theme?.colors.onSurface};
  }

  input:focus {
    border: 1px solid ${(e) => e.theme?.colors.primary400};
    color: ${(e) => e.theme?.colors.primary500};
  }
`;

import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  onClick?: (e: MouseEvent) => void;
}

export const Card: Component<Props> = (props) => {
  return (
    <StyledCard className="card" onClick={props.onClick}>
      {props.children}
    </StyledCard>
  );
};

const StyledCard = styled.div`
  padding: 1rem;
  background-color: ${(e) => e.theme?.colors.surface};
  box-sizing: border-box;
  border-radius: 5px;
`;

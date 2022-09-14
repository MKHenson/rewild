import { styled } from "solid-styled-components";
import { Component } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {}

export const Card: Component<Props> = (props) => {
  return <StyledCard>{props.children}</StyledCard>;
};

const StyledCard = styled.div`
  padding: 1rem;
  background-color: var(--surface);
  box-sizing: border-box;
  border-radius: 5px;
`;

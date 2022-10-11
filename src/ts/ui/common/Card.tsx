import { styled } from "solid-styled-components";
import { ParentComponent } from "solid-js";

export type ButtonVariant = "contained" | "outlined";
export type ButtonColor = "primary" | "secondary" | "error";

interface Props {
  pushed?: boolean;
  raised?: boolean;
  button?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export const Card: ParentComponent<Props> = (props) => {
  return (
    <StyledCard
      class="card"
      classList={{
        pushed: props.pushed || false,
        button: props.button || false,
        raised: props.raised || false,
      }}
      onClick={props.onClick}
    >
      {props.children}
    </StyledCard>
  );
};

const StyledCard = styled.div`
  padding: 1rem;
  background-color: ${(e) => e.theme?.colors.surface};
  box-sizing: border-box;
  border-radius: 5px;

  &.button {
    cursor: pointer;
  }

  &.raised {
    box-shadow: ${(e) => e.theme?.colors.shadowShort1};
  }

  &.raised:hover {
    box-shadow: ${(e) => e.theme?.colors.shadowShort2};
  }

  &.pushed.raised {
    box-shadow: ${(e) => e.theme?.colors.shadowShort1}, inset 0 0 0px 2px ${(e) => e.theme?.colors.primary400};
  }
`;

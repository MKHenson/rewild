import { styled } from "solid-styled-components";
import { ParentComponent } from "solid-js";

interface Props {
  class?: string;
}

export const ButtonGroup: ParentComponent<Props> = (props) => {
  return <StyledButtonGroup class={`${props.class} button-group`}>{props.children}</StyledButtonGroup>;
};

const StyledButtonGroup = styled.div`
  display: inline-flex;

  > button:not(:last-of-type) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-color: transparent;
  }

  > button:not(:first-of-type) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
`;

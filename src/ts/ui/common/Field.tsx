import { styled } from "solid-styled-components";
import { Component, Show } from "solid-js";
import { Typography } from "./Typography";

interface Props {
  label: string;
  required?: boolean;
}

export const Field: Component<Props> = (props) => {
  return (
    <StyledField className="field">
      <Typography variant="label">
        {props.label}
        <Show when={props.required}>
          <span className="required">*</span>
        </Show>
      </Typography>
      {props.children}
    </StyledField>
  );
};

const StyledField = styled.div`
  width: 100%;
  margin: 0 0 1rem 0;

  .required {
    color: ${(e) => e.theme!.colors.error400};
    font-weight: 400;
    margin: 0 0 0 4px;
  }
`;

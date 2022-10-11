import { styled } from "solid-styled-components";
import { ParentComponent, Show } from "solid-js";
import { Typography } from "./Typography";

interface Props {
  label: string;
  required?: boolean;
}

export const Field: ParentComponent<Props> = (props) => {
  return (
    <StyledField class="field">
      <Typography variant="label">
        {props.label}
        <Show when={props.required}>
          <span class="required">*</span>
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

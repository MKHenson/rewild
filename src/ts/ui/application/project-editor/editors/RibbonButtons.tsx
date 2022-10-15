import { Component } from "solid-js";
import { styled } from "solid-styled-components";
import { Card } from "../../../common/Card";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { MaterialIcon } from "../../../common/MaterialIcon";

interface Props {
  onHome: () => void;
  onSave: () => void;
  projectDirty: boolean;
  mutating: boolean;
}

export const RibbonButtons: Component<Props> = (props) => {
  return (
    <StyledContainer>
      <Card>
        <ButtonGroup>
          <Button variant="text" onClick={props.onHome} disabled={props.mutating}>
            <MaterialIcon icon="home" size="s" />
          </Button>
          <Button variant="text" disabled={!props.projectDirty || props.mutating} onClick={props.onSave}>
            <MaterialIcon icon="save" size="s" />
          </Button>
        </ButtonGroup>
      </Card>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  .card {
    padding: 3px;
  }

  button {
    color: ${(e) => e.theme?.colors.onSubtle};
    padding: 0.5rem;
  }
`;

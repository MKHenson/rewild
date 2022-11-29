import { Component } from "solid-js";
import { styled } from "solid-styled-components";
import { Card } from "../../../common/Card";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { useEditor } from "../EditorProvider";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";

interface Props {
  onHome: () => void;
}

export const RibbonButtons: Component<Props> = (props) => {
  const { save, publish, dirty, loading } = useEditor();
  return (
    <StyledContainer>
      <Card>
        <ButtonGroup>
          <Button variant="text" onClick={props.onHome} disabled={loading()}>
            <StyledMaterialIcon icon="home" size="s" />
          </Button>
          <Button variant="text" disabled={!dirty() || loading()} onClick={save}>
            <StyledMaterialIcon icon="save" size="s" />
          </Button>
          <Button variant="text" disabled={loading()} onClick={publish}>
            <StyledMaterialIcon icon="file_upload" size="s" />
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

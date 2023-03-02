import { Card } from "../../../common/Card";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";
import { Component, register } from "../../../Component";
import { theme } from "../../../../ui/theme";
import { projectStore } from "../../../stores/Project";

interface Props {
  onHome: () => void;
}

@register("x-ribbon-buttons")
export class RibbonButtons extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore);

    const { loading, dirty } = projectStoreProxy;

    return () => (
      <Card>
        <ButtonGroup>
          <Button variant="text" onClick={this.props.onHome} disabled={loading}>
            <StyledMaterialIcon icon="home" size="s" />
          </Button>
          <Button variant="text" disabled={!dirty || loading} onClick={projectStore.updateProject}>
            <StyledMaterialIcon icon="save" size="s" />
          </Button>
          <Button variant="text" disabled={loading} onClick={projectStore.publish}>
            <StyledMaterialIcon icon="file_upload" size="s" />
          </Button>
        </ButtonGroup>
      </Card>
    );
  }

  getStyle(): string | null {
    return css`
      x-card {
        padding: 3px;
      }

      x-button {
        color: ${theme?.colors.onSubtle};
        padding: 0.5rem;
      }
    `;
  }
}

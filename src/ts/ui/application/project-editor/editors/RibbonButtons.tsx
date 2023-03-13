import { Card } from "../../../common/Card";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";
import { Component, register } from "../../../Component";
import { theme } from "../../../../ui/theme";
import { projectStore } from "../../../stores/ProjectStore";

interface Props {
  onHome: () => void;
}

@register("x-ribbon-buttons")
export class RibbonButtons extends Component<Props> {
  init() {
    const projectStoreProxy = this.observeStore(projectStore, (prop) => {
      if (prop === "dirty" || prop === "loading") this.render();
    });

    return () => {
      const { loading, dirty } = projectStoreProxy;

      return (
        <Card stretched>
          <ButtonGroup>
            <Button variant="text" onClick={this.props.onHome} disabled={loading}>
              <StyledMaterialIcon icon="home" size="s" />
            </Button>
            <Button variant="text" disabled={!dirty || loading} onClick={(e) => projectStore.updateProject()}>
              <StyledMaterialIcon icon="save" size="s" />
            </Button>
            <Button variant="text" disabled={loading} onClick={(e) => projectStore.publish()}>
              <StyledMaterialIcon icon="file_upload" size="s" />
            </Button>
          </ButtonGroup>
        </Card>
      );
    };
  }

  getStyle() {
    return StyledRibbonButtons;
  }
}

const StyledRibbonButtons = cssStylesheet(css`
  x-card {
    padding: 3px;
  }

  x-button {
    color: ${theme?.colors.onSubtle};
    padding: 0.5rem;
  }
`);

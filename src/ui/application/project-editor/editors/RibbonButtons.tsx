import {
  theme,
  Component,
  register,
  StyledMaterialIcon,
  ButtonGroup,
  Card,
  Button,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { TerrainSettingsDialog } from './TerrainSettingsDialog';

interface Props {
  onHome: () => void;
}

@register('x-ribbon-buttons')
export class RibbonButtons extends Component<Props> {
  init() {
    this.on(projectStore.dispatcher, (event) => {
      if (event.kind === 'changed') this.render();
    });

    const [terrainOpen, setTerrainOpen] = this.useState(false);

    return () => {
      const { loading, dirty } = projectStore;

      return (
        <Card stretched>
          <ButtonGroup>
            <Button
              variant="text"
              onClick={this.props.onHome}
              disabled={loading}>
              <StyledMaterialIcon icon="home" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={!dirty || loading}
              onClick={() => projectStore.updateProject()}>
              <StyledMaterialIcon icon="save" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={loading}
              onClick={() => projectStore.publish()}>
              <StyledMaterialIcon icon="file_upload" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={loading || !projectStore.project?.sceneGraph?.terrain}
              onClick={() => setTerrainOpen(true)}>
              <StyledMaterialIcon icon="landscape" size="s" />
            </Button>
          </ButtonGroup>
          {terrainOpen() && (
            <TerrainSettingsDialog onClose={() => setTerrainOpen(false)} />
          )}
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

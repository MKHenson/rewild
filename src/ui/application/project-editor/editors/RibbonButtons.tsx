import {
  theme,
  Component,
  register,
  StyledIcon,
  ButtonGroup,
  Card,
  Button,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { sculptStore } from '../../../stores/SculptStore';
import { biomePaintStore } from '../../../stores/BiomePaintStore';
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
    this.on(sculptStore.dispatcher, () => this.render());
    this.on(biomePaintStore.dispatcher, () => this.render());

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
              <StyledIcon icon="house" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={!dirty || loading}
              onClick={() => projectStore.updateProject()}>
              <StyledIcon icon="save" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={loading}
              onClick={() => projectStore.publish()}>
              <StyledIcon icon="upload" size="s" />
            </Button>
            <Button
              variant="text"
              disabled={loading || !projectStore.project?.sceneGraph?.terrain}
              onClick={() => setTerrainOpen(true)}>
              <StyledIcon icon="mountain-snow" size="s" />
            </Button>
            <Button
              variant="text"
              class={sculptStore.enabled ? 'sculpt-active' : ''}
              disabled={loading || !projectStore.project?.sceneGraph?.terrain}
              onClick={() => {
                // The two terrain brushes both own left-drag, so arming one
                // must disarm the other.
                if (!sculptStore.enabled) biomePaintStore.setEnabled(false);
                sculptStore.setEnabled(!sculptStore.enabled);
              }}>
              <StyledIcon icon="trending-up-down" size="s" />
            </Button>
            <Button
              variant="text"
              class={biomePaintStore.enabled ? 'sculpt-active' : ''}
              disabled={loading || !projectStore.project?.sceneGraph?.terrain}
              onClick={() => {
                if (!biomePaintStore.enabled) sculptStore.setEnabled(false);
                biomePaintStore.setEnabled(!biomePaintStore.enabled);
              }}>
              <StyledIcon icon="paintbrush" size="s" />
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

  /* These buttons hold nothing but an icon, so this colour IS the icon colour —
     Button forwards its own colour to slotted icons. A rule here is in the
     outer tree, so it also beats every :host() colour inside Button, hover
     included; the hover state has to be restated rather than inherited. */
  x-button {
    color: ${theme?.colors.onSurfaceLight};
    padding: 0.5rem;
    border-radius: 5px;
  }

  x-button:hover {
    color: ${theme?.colors.onSurface};
  }

  x-button.sculpt-active,
  x-button.sculpt-active:hover {
    color: ${theme?.colors.primary400};
  }
`);

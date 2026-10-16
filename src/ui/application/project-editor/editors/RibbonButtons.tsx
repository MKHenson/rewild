import {
  theme,
  Component,
  register,
  StyledIcon,
  ButtonGroup,
  Card,
  Button,
  IconType,
  navigate,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { sculptStore } from '../../../stores/SculptStore';
import { biomePaintStore } from '../../../stores/BiomePaintStore';
import { scatterPaintStore } from '../../../stores/ScatterPaintStore';
import { waterBrushStore } from '../../../stores/WaterBrushStore';
import { TerrainSettingsDialog } from './TerrainSettingsDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

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
    this.on(scatterPaintStore.dispatcher, () => this.render());
    this.on(waterBrushStore.dispatcher, () => this.render());

    const [openDialog, setOpenDialog] = this.useState<
      'project' | 'terrain' | null
    >(null);
    const closeDialog = () => setOpenDialog(null);

    // Built once and updated in place. Rebuilding on every store change would
    // swap a button out between its mousedown and mouseup whenever the press
    // itself triggers a change, such as a property field saving on blur, and
    // the click would be lost.
    const iconButton = (icon: IconType, onClick: () => void) =>
      (
        <Button variant="text" onClick={onClick}>
          <StyledIcon icon={icon} size="s" />
        </Button>
      ) as unknown as Button & HTMLElement;

    /** The terrain brushes all own left-drag, so arming one disarms the others. */
    const brushes = [
      sculptStore,
      biomePaintStore,
      scatterPaintStore,
      waterBrushStore,
    ];
    const toggleBrush = (store: typeof brushes[number]) => {
      if (!store.enabled)
        for (const other of brushes)
          if (other !== store) other.setEnabled(false);
      store.setEnabled(!store.enabled);
    };

    const home = iconButton('house', () => this.props.onHome());
    const save = iconButton('save', () => projectStore.updateProject());
    const play = iconButton('play', async () => {
      if (projectStore.dirty) await projectStore.updateProject();
      navigate(`/game/${projectStore.project!.id}`);
    });
    const settings = iconButton('settings', () => setOpenDialog('project'));
    const terrain = iconButton('mountain-snow', () => setOpenDialog('terrain'));
    const brushButtons = brushes.map((store, i) =>
      iconButton(
        (['trending-up-down', 'paintbrush', 'trees', 'droplets'] as const)[i],
        () => toggleBrush(store)
      )
    );

    const dialogSlot = (<div />) as HTMLDivElement;
    let dialog: HTMLElement | null = null;
    let dialogKind: 'project' | 'terrain' | null = null;

    const elm = (
      <Card stretched>
        <ButtonGroup>
          {home}
          {settings}
          {save}
          <span class="separator" />
          {play}
          <span class="separator" />
          {terrain}
          {brushButtons[0]}
          {brushButtons[1]}
          {brushButtons[2]}
          {brushButtons[3]}
        </ButtonGroup>
        {dialogSlot}
      </Card>
    );

    return () => {
      const { loading, dirty } = projectStore;
      const noTerrain = loading || !projectStore.level?.sceneGraph?.terrain;

      home.disabled = loading;
      save.disabled = !dirty || loading;
      play.disabled = loading || !projectStore.project;
      settings.disabled = loading || !projectStore.project;
      terrain.disabled = noTerrain;
      brushButtons.forEach((button, i) => {
        button.disabled = noTerrain;
        button.classList.toggle('sculpt-active', brushes[i].enabled);
      });

      if (openDialog() !== dialogKind) {
        dialog?.remove();
        dialogKind = openDialog();
        dialog =
          dialogKind === 'project' ? (
            <ProjectSettingsDialog onClose={closeDialog} />
          ) : dialogKind === 'terrain' ? (
            <TerrainSettingsDialog onClose={closeDialog} />
          ) : null;
        if (dialog) dialogSlot.appendChild(dialog);
      }

      return elm;
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

  .separator {
    align-self: stretch;
    width: 1px;
    margin: 6px 6px;
    background: ${theme?.colors.onSurfaceBorder};
  }

  x-button.sculpt-active,
  x-button.sculpt-active:hover {
    color: ${theme?.colors.primary400};
  }
`);

import {
  Modal,
  Component,
  register,
  Typography,
  Input,
  Select,
  Button,
  InfoBox,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { db } from 'src/database/database';
import { getActiveRenderer } from 'src/ui/utils/getActiveRenderer';
import { DEFAULT_CLIMATE_PRESET, getClimatePresets } from 'rewild-renderer';

interface Props {
  onClose: () => void;
}

type PendingAction = 'regenerate' | 'terrain';

const WARNINGS: Record<
  PendingAction,
  { title: string; body: string; ok: string }
> = {
  regenerate: {
    title: 'Regenerate terrain?',
    body: 'This generates a different world and removes all saved edits on it: sculpting, biome and scatter paint, and water. You cannot undo this.',
    ok: 'Regenerate',
  },
  terrain: {
    title: 'Reset saved terrain?',
    body: 'This removes all saved edits on this world: sculpting, biome and scatter paint, and water. The generated world comes back. You cannot undo this.',
    ok: 'Reset terrain',
  },
};

// The settings a world's terrain is generated from. They share one Apply and
// one confirmation because they have the same consequence: chunks capture them
// when they are built, so changing any throws away every generated chunk and
// every saved sculpt edit along with it.
@register('x-terrain-settings-dialog')
export class TerrainSettingsDialog extends Component<Props> {
  init() {
    const terrain = projectStore.project?.sceneGraph?.terrain;

    const [seedInput, setSeedInput] = this.useState(
      String(terrain?.seed ?? '')
    );
    const [climateInput, setClimateInput] = this.useState(
      terrain?.climatePreset ?? DEFAULT_CLIMATE_PRESET
    );
    const [seaLevelInput, setSeaLevelInput] = this.useState(
      String(terrain?.seaLevel ?? 0)
    );

    // Presets are code-defined game content, so this list is fixed at build
    // time — no store, no fetch.
    const climateOptions = getClimatePresets().map((preset) => ({
      value: preset.id,
      label: preset.label,
    }));

    // The action waiting for its confirmation in the warning banner. A banner
    // in the dialog, not a second modal over it.
    const [pending, setPending] = this.useState<PendingAction | null>(null);
    const [busy, setBusy] = this.useState(false);

    // Rebuilds every chunk from the saved settings and the files that remain.
    const rebuild = (seed: number, climate: string, seaLevel: number) => {
      const renderer = getActiveRenderer();
      if (!renderer) return;
      // reset() rebuilds around the seed; the preset and sea level are
      // plain fields on the renderer, so they have to be pushed across
      // separately. Set them first so the chunks reset() triggers are
      // built against them rather than against the outgoing values.
      renderer.terrainRenderer.climatePreset = climate;
      renderer.terrainRenderer.seaLevel = seaLevel;
      renderer.terrainRenderer.reset(seed, renderer);
    };

    const savedSettings = () => {
      const current = projectStore.project?.sceneGraph.terrain;
      return {
        seed: current?.seed ?? getActiveRenderer()?.terrainRenderer.seed ?? 0,
        climate: current?.climatePreset ?? DEFAULT_CLIMATE_PRESET,
        seaLevel: current?.seaLevel ?? 0,
      };
    };

    const regenerate = async () => {
      const parsed = parseInt(seedInput(), 10);
      const seaLevel = parseFloat(seaLevelInput());
      const climate = climateInput();
      const project = projectStore.project!;
      await db.clearLevelChunks(project.levelId);

      project.sceneGraph.terrain = {
        version: 1,
        seed: parsed,
        climatePreset: climate,
        seaLevel,
      };
      projectStore.dirty = true;
      projectStore.dispatcher.dispatch({ kind: 'changed' });
      rebuild(parsed, climate, seaLevel);
    };

    const resetTerrain = async () => {
      await db.clearLevelChunks(projectStore.project!.levelId);
      const { seed, climate, seaLevel } = savedSettings();
      rebuild(seed, climate, seaLevel);
    };

    const ACTIONS: Record<PendingAction, () => Promise<void>> = {
      regenerate,
      terrain: resetTerrain,
    };

    const confirm = async () => {
      const action = pending();
      if (!action || busy()) return;
      setBusy(true);
      try {
        await ACTIONS[action]();
        this.props.onClose();
      } catch (err) {
        console.error(`Terrain ${action} failed:`, err);
        setBusy(false);
      }
    };

    const onApply = () => {
      const parsed = parseInt(seedInput(), 10);
      if (isNaN(parsed)) return;
      const seaLevel = parseFloat(seaLevelInput());
      if (isNaN(seaLevel)) return;

      const current = projectStore.project!.sceneGraph.terrain;
      const climate = climateInput();

      // Nothing to regenerate — don't make the user confirm a no-op.
      if (
        current?.seed === parsed &&
        (current?.climatePreset ?? DEFAULT_CLIMATE_PRESET) === climate &&
        (current?.seaLevel ?? 0) === seaLevel
      )
        return;

      setPending('regenerate');
    };

    return () => {
      return (
        <Modal
          open
          title="Terrain Settings"
          okLabel="Apply"
          cancelLabel="Cancel"
          hideConfirmButtons={pending() !== null}
          onOk={onApply}
          onCancel={this.props.onClose}
          onClose={this.props.onClose}>
          <div style="min-width: 600px">
            <Typography variant="label">World Seed</Typography>
            <Typography variant="info">
              Generates a different world, removes any saved terrain edits
            </Typography>
            <Input
              fullWidth
              value={seedInput()}
              onChange={(v) => setSeedInput(v, false)}
            />

            <div style="margin-top: 1rem">
              <Typography variant="label">Climate</Typography>
              <Typography variant="info">
                Which biomes the world is built from
              </Typography>
              <Select
                value={climateInput()}
                options={climateOptions}
                onChange={(v) => setClimateInput(v)}
              />
            </div>

            <div style="margin-top: 1rem">
              <Typography variant="label">Sea Level</Typography>
              <Typography variant="info">
                Height of the ocean surface in metres
              </Typography>
              <Input
                fullWidth
                value={seaLevelInput()}
                onChange={(v) => setSeaLevelInput(v, false)}
              />
            </div>

            <div style="margin-top: 1rem">
              <Typography variant="label">Saved Edits</Typography>
              <Typography variant="info">
                Hand this world back to the generator
              </Typography>
              <div class="actions">
                <Button
                  variant="outlined"
                  color="error"
                  disabled={pending() !== null}
                  onClick={() => setPending('terrain')}>
                  Reset saved terrain
                </Button>
              </div>
            </div>

            {pending() ? (
              <div class="warning">
                <InfoBox variant="warning" title={WARNINGS[pending()!].title}>
                  {WARNINGS[pending()!].body}
                </InfoBox>
                <div class="actions">
                  <Button
                    variant="text"
                    disabled={busy()}
                    onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={busy()}
                    onClick={confirm}>
                    {WARNINGS[pending()!].ok}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      );
    };
  }

  getStyle() {
    return StyledTerrainSettingsDialog;
  }
}

const StyledTerrainSettingsDialog = cssStylesheet(css`
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .warning {
    margin-top: 1rem;
  }

  .warning .actions {
    justify-content: flex-end;
  }
`);

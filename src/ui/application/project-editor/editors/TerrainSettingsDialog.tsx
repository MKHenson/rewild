import {
  Modal,
  Component,
  register,
  Typography,
  Input,
  Select,
} from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { confirmationStore } from '../../../stores/ConfirmationStore';
import { db } from 'src/database/database';
import { getActiveRenderer } from './utils/getActiveRenderer';
import { DEFAULT_CLIMATE_PRESET, getClimatePresets } from 'rewild-renderer';

interface Props {
  onClose: () => void;
}

// Both settings a world's terrain is generated from. They share one Apply and
// one confirmation because they have the same consequence: chunks capture the
// seed and preset when they are built, so changing either throws away every
// generated chunk and every saved sculpt edit along with it.
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

    // Presets are code-defined game content, so this list is fixed at build
    // time — no store, no fetch.
    const climateOptions = getClimatePresets().map((preset) => ({
      value: preset.id,
      label: preset.label,
    }));

    const onApply = () => {
      const parsed = parseInt(seedInput(), 10);
      if (isNaN(parsed)) return;

      const project = projectStore.project!;
      const current = project.sceneGraph.terrain;
      const climate = climateInput();

      // Nothing to regenerate — don't make the user confirm a no-op.
      if (
        current?.seed === parsed &&
        (current?.climatePreset ?? DEFAULT_CLIMATE_PRESET) === climate
      )
        return;

      confirmationStore.show(
        'Regenerate terrain?',
        'Applying these settings will generate a different world and remove any saved terrain edits. This cannot be undone.',
        async () => {
          await db.assets.removeChunksByLevel(project.levelId);

          project.sceneGraph.terrain = {
            version: 1,
            seed: parsed,
            climatePreset: climate,
          };
          projectStore.dirty = true;
          projectStore.dispatcher.dispatch({ kind: 'changed' });

          const renderer = getActiveRenderer();
          if (renderer) {
            // reset() rebuilds around the seed; the preset is a plain field on
            // the renderer, so it has to be pushed across separately. Set it
            // first so the chunks reset() triggers are built against it rather
            // than against the outgoing preset.
            renderer.terrainRenderer.climatePreset = climate;
            renderer.terrainRenderer.reset(parsed, renderer);
          }
        },
        { okLabel: 'Regenerate', okColor: 'error' }
      );
    };

    return () => {
      return (
        <Modal
          open
          title="Terrain Settings"
          okLabel="Apply"
          cancelLabel="Cancel"
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
          </div>
        </Modal>
      );
    };
  }
}

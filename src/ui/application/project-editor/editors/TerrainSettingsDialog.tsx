import { Modal, Component, register, Typography, Input } from 'rewild-ui';
import { projectStore } from '../../../stores/ProjectStore';
import { confirmationStore } from '../../../stores/ConfirmationStore';
import { db } from 'src/database/database';
import { getActiveRenderer } from './utils/getActiveRenderer';

interface Props {
  onClose: () => void;
}

@register('x-terrain-settings-dialog')
export class TerrainSettingsDialog extends Component<Props> {
  init() {
    const [seedInput, setSeedInput] = this.useState(
      String(projectStore.project?.sceneGraph?.terrain?.seed ?? '')
    );

    const onApply = () => {
      const parsed = parseInt(seedInput(), 10);
      if (isNaN(parsed)) return;

      confirmationStore.show(
        'Change world seed?',
        'Applying a new seed will generate a different world and remove any saved terrain edits. This cannot be undone.',
        async () => {
          const project = projectStore.project!;
          await db.assets.removeChunksByLevel(project.levelId);

          project.sceneGraph.terrain = { version: 1, seed: parsed };
          projectStore.dirty = true;
          projectStore.dispatcher.dispatch({ kind: 'changed' });

          const renderer = getActiveRenderer();
          if (renderer) renderer.terrainRenderer.reset(parsed, renderer);
        },
        { okLabel: 'Change seed', okColor: 'error' }
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
            <Input
              fullWidth
              value={seedInput()}
              onChange={(v) => setSeedInput(v, false)}
            />
            <Typography variant="light">
              Generates a different world, removes any saved terrain edits
            </Typography>
          </div>
        </Modal>
      );
    };
  }
}

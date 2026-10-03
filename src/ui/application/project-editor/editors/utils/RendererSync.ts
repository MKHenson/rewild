import { IProject, Vector3 } from 'models';
import { DEFAULT_CLIMATE_PRESET, PointLight, Renderer } from 'rewild-renderer';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';
import { createChunkSnapshotProvider } from 'src/database/chunk-snapshots';
import { createBiomeMaskProvider } from 'src/database/biome-masks';
import { createScatterMaskProvider } from 'src/database/scatter-masks';
import { createWaterEditProvider } from 'src/database/water-edits';
import { createWaterBodyProvider } from 'src/database/water-bodies';
import { createScatterKillProvider } from 'src/database/scatter-kills';
import { registerDebugCommands } from 'src/core/debug';
import { applyAtmosphere } from 'src/core/AtmosphereSync';

export function SyncRendererFromProject(renderer: Renderer, project: IProject) {
  if (project.sceneGraph?.terrain) {
    renderer.terrainRenderer.seed = project.sceneGraph.terrain.seed;
    renderer.terrainRenderer.climatePreset =
      project.sceneGraph.terrain.climatePreset ?? DEFAULT_CLIMATE_PRESET;
    renderer.terrainRenderer.seaLevel =
      project.sceneGraph.terrain.seaLevel ?? 0;
  }

  const atmosphere = project.sceneGraph?.atmosphere;
  if (atmosphere) applyAtmosphere(renderer, atmosphere);

  renderer.terrainRenderer.snapshotProvider = project.levelId
    ? createChunkSnapshotProvider(project.levelId)
    : null;
  renderer.terrainRenderer.biomeMaskProvider = project.levelId
    ? createBiomeMaskProvider(project.levelId)
    : null;
  renderer.terrainRenderer.scatterMaskProvider = project.levelId
    ? createScatterMaskProvider(project.levelId)
    : null;
  renderer.terrainRenderer.waterEditProvider = project.levelId
    ? createWaterEditProvider(project.levelId)
    : null;
  renderer.terrainRenderer.waterBodyProvider = project.levelId
    ? createWaterBodyProvider(project.levelId)
    : null;
  renderer.terrainRenderer.scatterKillProvider = project.levelId
    ? createScatterKillProvider(project.levelId)
    : null;
  registerDebugCommands(renderer, project);

  project.sceneGraph.containers.forEach((container) => {
    container.actors.forEach((actor) => {
      if (actor.type === 'actor') {
        const sceneObject = renderer.scene.findObjectById(actor.id);
        if (sceneObject && sceneObject.component instanceof PointLight) {
        }
      }
    });
  });
}

export function syncFromEditorResource(id: string, renderer: Renderer) {
  const editorResource = sceneGraphStore.buildObjectFromProperties(id);
  const sceneObject = renderer.scene.findObjectById(id);
  if (id === 'SKY' && editorResource) {
    applyAtmosphere(renderer, editorResource);
  } else if (sceneObject && editorResource) {
    if (sceneObject.component instanceof PointLight) {
      const color = editorResource.color as Vector3;
      sceneObject.component.color.setRGB(color[0], color[1], color[2]);
      sceneObject.component.intensity = editorResource.intensity as f32;
      sceneObject.component.radius = editorResource.radius as f32;
    }
  }
}

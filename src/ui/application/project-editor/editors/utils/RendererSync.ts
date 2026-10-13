import { IProject, Vector3 } from 'models';
import { DEFAULT_CLIMATE_PRESET, PointLight, Renderer } from 'rewild-renderer';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';
import { startLevelRef } from 'src/database/local-asset-store';
import { localAssetReader } from 'src/database/database';
import { setTerrainProviders } from 'src/core/TerrainProviders';
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

  const levelRef = startLevelRef(project);
  setTerrainProviders(renderer, levelRef ? localAssetReader(levelRef) : null);
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

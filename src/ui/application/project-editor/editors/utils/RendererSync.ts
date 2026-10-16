import { ILevel, IProject, StoredRecord, Vector3 } from 'models';
import { DEFAULT_CLIMATE_PRESET, PointLight, Renderer } from 'rewild-renderer';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';
import { localAssetReader } from 'src/database/database';
import { setTerrainProviders } from 'src/core/TerrainProviders';
import { registerDebugCommands } from 'src/core/debug';
import { applyAtmosphere } from 'src/core/AtmosphereSync';
import { PortalAsset } from 'src/core/routing/PortalAsset';

export function SyncRendererFromLevel(
  renderer: Renderer,
  project: StoredRecord<IProject>,
  level: StoredRecord<ILevel>
) {
  const { terrain, atmosphere, containers } = level.sceneGraph;
  if (terrain) {
    renderer.terrainRenderer.seed = terrain.seed;
    renderer.terrainRenderer.climatePreset =
      terrain.climatePreset ?? DEFAULT_CLIMATE_PRESET;
    renderer.terrainRenderer.seaLevel = terrain.seaLevel ?? 0;
  }

  if (atmosphere) applyAtmosphere(renderer, atmosphere);

  setTerrainProviders(
    renderer,
    localAssetReader({ projectId: project.id, levelId: level.id })
  );
  registerDebugCommands(renderer, project);

  containers.forEach((container) => {
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
    const portal = sceneObject.userData.portal;
    if (portal instanceof PortalAsset) {
      const resource = sceneGraphStore.findNodeById(id)?.resource;
      if (resource) portal.applyProperties(resource);
    } else if (sceneObject.component instanceof PointLight) {
      const color = editorResource.color as Vector3;
      sceneObject.component.color.setRGB(color[0], color[1], color[2]);
      sceneObject.component.intensity = editorResource.intensity as f32;
      sceneObject.component.radius = editorResource.radius as f32;
    }
  }
}

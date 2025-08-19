import { IProject } from 'models';
import { Renderer } from 'rewild-renderer';
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';

export function SyncRendererFromProject(renderer: Renderer, project: IProject) {
  const atmosphere = project.sceneGraph?.atmosphere;

  if (atmosphere) {
    renderer.atmosphere.skyRenderer.cloudiness = atmosphere.cloudiness as f32;
    renderer.atmosphere.skyRenderer.foginess = atmosphere.foginess as f32;
    renderer.atmosphere.skyRenderer.elevation = atmosphere.elevation as f32;
    renderer.atmosphere.skyRenderer.windiness = atmosphere.windiness as f32;
    renderer.atmosphere.skyRenderer.dayNightCycle =
      atmosphere.dayNightCycle as boolean;
  }
}

export function syncFromEditorResource(id: string, renderer: Renderer) {
  const editorResource = sceneGraphStore.buildObjectFromProperties(id);
  if (id === 'SKY' && editorResource) {
    const skyRenderer = renderer.atmosphere.skyRenderer;
    skyRenderer.cloudiness = editorResource.cloudiness as f32;
    skyRenderer.foginess = editorResource.foginess as f32;
    skyRenderer.elevation = editorResource.elevation as f32;
    skyRenderer.windiness = editorResource.windiness as f32;
    skyRenderer.dayNightCycle = editorResource.dayNightCycle as boolean;
  }
}

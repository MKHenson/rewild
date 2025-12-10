import { IProject, Vector3 } from 'models';
import { PointLight, Renderer } from 'rewild-renderer';
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
    const skyRenderer = renderer.atmosphere.skyRenderer;
    skyRenderer.cloudiness = editorResource.cloudiness as f32;
    skyRenderer.foginess = editorResource.foginess as f32;
    skyRenderer.elevation = editorResource.elevation as f32;
    skyRenderer.windiness = editorResource.windiness as f32;
    skyRenderer.dayNightCycle = editorResource.dayNightCycle as boolean;
  } else if (sceneObject && editorResource) {
    if (sceneObject.component instanceof PointLight) {
      const color = editorResource.color as Vector3;
      sceneObject.component.color.setRGB(color[0], color[1], color[2]);
      sceneObject.component.intensity = editorResource.intensity as f32;
      sceneObject.component.radius = editorResource.radius as f32;
    }
  }
}

import { Light, Mesh, PointLight, Renderer } from 'rewild-renderer';
import { Asset3D } from './Asset3D';
import { IResource, Vector3 } from 'models';

export class LightAsset extends Asset3D {
  constructor(light: Light) {
    super(light.transform);
    this.transform.component = light;
  }

  addVisualHelper(renderer: Renderer) {
    const mesh = new Mesh(
      renderer.geometryManager.get('sphere'),
      renderer.materialManager.get('light-wireframe')
    );

    mesh.transform.name = `${this.transform.name}-light-helper`;
    this.transform.addChild(mesh.transform);
  }

  mount(): void {
    super.mount();
    this.initializeValues();
  }

  initializeValues(resource?: IResource) {
    const properties = this.buildObjectFromProperties(resource);
    const light = this.transform.component as Light;
    light.intensity = properties?.intensity as f32;
    const color = properties?.color as Vector3;
    light.color.setRGB(color[0], color[1], color[2]);

    if (light instanceof PointLight) {
      light.radius = properties?.radius as f32;
    }
  }
}

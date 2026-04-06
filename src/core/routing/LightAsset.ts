import {
  Light,
  Mesh,
  PointLight,
  Renderer,
  Sprite3D,
  SpritePass,
} from 'rewild-renderer';
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

    // Add a 3D sprite icon at the light's position
    const spriteMaterial = new SpritePass();
    spriteMaterial.spriteUniforms.diffuseColor.setRGB(1.0, 0.9, 0.2);
    spriteMaterial.spriteUniforms.diffuseAlpha = 1.0;
    spriteMaterial.spriteUniforms.texture =
      renderer.textureManager.get('light-32').gpuTexture;
    const sprite = new Sprite3D(
      renderer.geometryManager.get('sprite-quad'),
      spriteMaterial
    );
    sprite.rotationOffset = Math.PI; // upside down
    sprite.transform.name = `${this.transform.name}-light-sprite`;
    sprite.transform.scale.set(0.3, 0.3, 0.3);
    this.transform.addChild(sprite.transform);
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

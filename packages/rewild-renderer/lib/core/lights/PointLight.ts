import { Color } from 'rewild-common';
import { Renderer } from '../..';
import { Sprite3D } from '../Sprite3D';
import { SpritePass } from '../../materials/SpritePass';
import { Light } from './Light';
import { Transform } from '../Transform';

const SPRITE_SCALE = 1;

export class PointLight extends Light {
  private _radius: f32;
  transform: Transform;

  showSprite: boolean = false;
  private _sprite: Sprite3D | null = null;

  constructor(color: Color = new Color(1, 1, 1), intensity: f32 = 1.0) {
    super(color, intensity);
    this._radius = 1.0;
    this.transform.component = this;
  }

  get radius(): f32 {
    return this._radius;
  }

  set radius(value: f32) {
    this._radius = value;
    this.transform.scale.set(value, value, value);
  }

  enableSprite(renderer: Renderer): void {
    if (this._sprite) return;

    const material = new SpritePass();
    material.blendMode = 'additive';
    material.spriteUniforms.diffuseColor = this.color;
    material.spriteUniforms.texture =
      renderer.textureManager.get('point-light-glow').gpuTexture;

    const sprite = new Sprite3D(
      renderer.geometryManager.get('sprite-quad'),
      material
    );
    const size = SPRITE_SCALE * this._radius * 0.3;
    sprite.transform.scale.set(size, size, size);
    this.transform.addChild(sprite.transform);

    this._sprite = sprite;
    this.showSprite = true;
  }

  disableSprite(): void {
    if (!this._sprite) return;
    this._sprite.transform.removeFromParent();
    this._sprite = null;
    this.showSprite = false;
  }

  setSpriteAlpha(alpha: number): void {
    if (this._sprite) {
      (this._sprite.material as SpritePass).spriteUniforms.diffuseAlpha =
        Math.min(0.2, alpha);
    }
  }
}

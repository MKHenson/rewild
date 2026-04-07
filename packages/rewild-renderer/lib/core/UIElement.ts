import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Intersection, UIRaycaster } from './Raycaster';
import { Transform } from './Transform';
import {
  IComponent,
  IVisualComponent,
  IRaycaster,
  MsdfTextFormattingOptions,
} from '../../types/interfaces';
import { IS_VISUAL_COMPONENT } from '../typeGuards';
import { Color, Dispatcher } from 'rewild-common';
import { Renderer } from '..';
import { TextRenderer } from './text-renderer/TextRenderer';
import { UIPointerEvent } from './UIPointerEvent';

export class UIElement implements IComponent, IVisualComponent {
  readonly [IS_VISUAL_COMPONENT] = true as const;

  geometry: Geometry;
  material: IMaterialPass;
  transform: Transform;
  visible: boolean;
  percentageBasedCalculation: boolean;
  dispatcher: Dispatcher<UIPointerEvent>;

  private _text?: string;
  private _textRenderer: TextRenderer | null = null;
  private _textOptions: MsdfTextFormattingOptions;
  private _width: f32;
  private _height: f32;
  private _backgroundColor: Color;
  private _backgroundColorAlpha: f32 = 1.0;
  private _borderColor: Color;
  private _borderColorAlpha: f32 = 1.0;
  private _borderRadius: f32 = 0.0;

  constructor(
    geometry: Geometry,
    material: IMaterialPass,
    transform: Transform = new Transform()
  ) {
    this.geometry = geometry;
    this.transform = transform;
    this.visible = true;
    this.dispatcher = new Dispatcher<UIPointerEvent>();

    transform.component = this;
    this.backgroundColor = new Color(0.3, 0.3, 0.3);
    this.backgroundColorAlpha = 0.9;
    this.borderColor = new Color(0.1, 0.1, 0.1);
    this.borderColorAlpha = 0.9;
    this.borderRadius = 0.0;
    this.percentageBasedCalculation = false;

    this._textOptions = { fontSize: 14, wordWrap: true };
    this.setMaterial(material);
  }

  get text(): string | undefined {
    return this._text;
  }

  set text(value: string | undefined) {
    this._text = value;
    if (value) {
      if (!this._textRenderer) {
        this._textRenderer = new TextRenderer(value, this._textOptions);
      } else {
        this._textRenderer.textUniform.text = value;
      }
    } else {
      if (this._textRenderer) {
        this._textRenderer.dispose();
        this._textRenderer = null;
      }
    }
  }

  get textRenderer(): TextRenderer | null {
    return this._textRenderer;
  }

  get textOptions(): MsdfTextFormattingOptions {
    return this._textOptions;
  }

  set textOptions(value: MsdfTextFormattingOptions) {
    this._textOptions = value;
    if (this._textRenderer) {
      this._textRenderer.textUniform.options = value;
    }
  }

  get borderRadius(): f32 {
    return this._borderRadius;
  }

  set borderRadius(value: f32) {
    this._borderRadius = value;
  }

  get x(): f32 {
    return this.transform.position.x;
  }

  set x(value: f32) {
    this.transform.position.x = value;
  }

  get y(): f32 {
    return this.transform.position.y;
  }

  set y(value: f32) {
    this.transform.position.y = value;
  }

  get z(): f32 {
    return this.transform.position.z;
  }

  set z(value: f32) {
    this.transform.position.z = value;
  }

  get width(): f32 {
    return this._width;
  }

  set width(value: f32) {
    this._width = value;
  }

  get height(): f32 {
    return this._height;
  }

  set height(value: f32) {
    this._height = value;
  }

  get backgroundColor(): Color {
    return this._backgroundColor;
  }

  set backgroundColor(value: Color) {
    this._backgroundColor = value;
  }

  get backgroundColorAlpha(): f32 {
    return this._backgroundColorAlpha;
  }

  set backgroundColorAlpha(value: f32) {
    this._backgroundColorAlpha = value;
  }

  get borderColor(): Color {
    return this._borderColor;
  }

  set borderColor(value: Color) {
    this._borderColor = value;
  }

  get borderColorAlpha(): f32 {
    return this._borderColorAlpha;
  }

  set borderColorAlpha(value: f32) {
    this._borderColorAlpha = value;
  }

  getHeight(renderer: Renderer, transform: Transform = this.transform): f32 {
    const component = transform.component;

    if (component instanceof UIElement) {
      if (component.percentageBasedCalculation) {
        let parentHeight = transform.parent
          ? this.getHeight(renderer, transform.parent)
          : renderer.canvas.height;
        return parentHeight * component.height;
      } else return component.height;
    }

    return renderer.canvas.height;
  }

  getWidth(renderer: Renderer, transform: Transform = this.transform): f32 {
    const component = transform.component;

    if (component instanceof UIElement) {
      if (component.percentageBasedCalculation) {
        let parentWidth = transform.parent
          ? this.getWidth(renderer, transform.parent)
          : renderer.canvas.width;
        return parentWidth * component.width;
      } else return component.width;
    }

    return renderer.canvas.width;
  }

  getX(renderer: Renderer, transform: Transform = this.transform): f32 {
    const component = transform.component;

    if (component instanceof UIElement) {
      if (component.percentageBasedCalculation) {
        let parentWidth = transform.parent
          ? this.getWidth(renderer, transform.parent)
          : renderer.canvas.width;

        const xProportion = parentWidth * component.x;
        return transform.parent
          ? this.getX(renderer, transform.parent) + xProportion
          : xProportion;
      } else
        return transform.parent
          ? this.getX(renderer, transform.parent) + component.x
          : component.x;
    }

    return 0;
  }

  getY(renderer: Renderer, transform: Transform = this.transform): f32 {
    const component = transform.component;
    if (component instanceof UIElement) {
      if (component.percentageBasedCalculation) {
        let parentHeight = transform.parent
          ? this.getHeight(renderer, transform.parent)
          : renderer.canvas.height;
        const yProportion = parentHeight * component.y;
        return transform.parent
          ? this.getY(renderer, transform.parent) + yProportion
          : yProportion;
      } else
        return transform.parent
          ? this.getY(renderer, transform.parent) + component.y
          : component.y;
    }
    return 0;
  }

  raycast(raycaster: IRaycaster, intersects: Intersection[]) {
    if (raycaster instanceof UIRaycaster) {
      const origin = raycaster.origin;
      const x = this.getX(raycaster.renderer);
      const y = this.getY(raycaster.renderer);
      const width = this.getWidth(raycaster.renderer);
      const height = this.getHeight(raycaster.renderer);

      if (
        origin.x >= x &&
        origin.x <= x + width &&
        origin.y >= y &&
        origin.y <= y + height
      ) {
        const intersection = new Intersection();
        intersection.distance = 0;
        intersection.point = origin.clone();
        intersection.object = this.transform;
        intersects.push(intersection);
      }
    }
  }

  setMaterial(material: IMaterialPass) {
    if (this.material) {
      this.material.perMeshTracker?.onUnassignedFromMesh(this);
      this.material.sharedUniformsTracker?.onUnassignedFromMesh(this);
    }

    if (!material.isGeometryCompatible(this.geometry))
      throw new Error('Material is not compatible with geometry');

    this.material = material;
    material.perMeshTracker?.onAssignedToMesh(this);
    material.sharedUniformsTracker?.onAssignedToMesh(this);
  }
}

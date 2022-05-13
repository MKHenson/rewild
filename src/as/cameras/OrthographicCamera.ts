import { Camera } from "./Camera";
import { ViewProperties } from "./ViewProperties";

export class OrthographicCamera extends Camera {
  zoom: f32;
  private view: ViewProperties | null;

  left: f32;
  right: f32;
  top: f32;
  bottom: f32;

  near: f32;
  far: f32;

  constructor(left: f32 = -1, right: f32 = 1, top: f32 = 1, bottom: f32 = -1, near: f32 = 0.1, far: f32 = 2000) {
    super();

    this.type = "OrthographicCamera";

    this.zoom = 1;
    this.view = null;

    this.left = left;
    this.right = right;
    this.top = top;
    this.bottom = bottom;

    this.near = near;
    this.far = far;

    this.updateProjectionMatrix();
  }

  copy(source: OrthographicCamera, recursive: boolean = true): OrthographicCamera {
    super.copy(source, recursive);

    this.left = source.left;
    this.right = source.right;
    this.top = source.top;
    this.bottom = source.bottom;
    this.near = source.near;
    this.far = source.far;

    this.zoom = source.zoom;
    this.view = source.view == null ? null : new ViewProperties(source.view);

    return this;
  }

  setViewOffset(fullWidth: f32, fullHeight: f32, x: f32, y: f32, width: f32, height: f32): void {
    if (this.view == null) {
      this.view = new ViewProperties(null);
    }

    this.view.enabled = true;
    this.view.fullWidth = fullWidth;
    this.view.fullHeight = fullHeight;
    this.view.offsetX = x;
    this.view.offsetY = y;
    this.view.width = width;
    this.view.height = height;

    this.updateProjectionMatrix();
  }

  clearViewOffset(): void {
    if (this.view !== null) {
      this.view.enabled = false;
    }

    this.updateProjectionMatrix();
  }

  updateProjectionMatrix(): void {
    const dx = (this.right - this.left) / (2 * this.zoom);
    const dy = (this.top - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left) / 2;
    const cy = (this.top + this.bottom) / 2;

    let left = cx - dx;
    let right = cx + dx;
    let top = cy + dy;
    let bottom = cy - dy;

    if (this.view !== null && this.view!.enabled) {
      const scaleW = (this.right - this.left) / this.view!.fullWidth / this.zoom;
      const scaleH = (this.top - this.bottom) / this.view!.fullHeight / this.zoom;

      left += scaleW * this.view!.offsetX;
      right = left + scaleW * this.view!.width;
      top -= scaleH * this.view!.offsetY;
      bottom = top - scaleH * this.view!.height;
    }

    this.projectionMatrix.makeOrthographic(left, right, top, bottom, this.near, this.far);

    this.projectionMatrixInverse.copy(this.projectionMatrix).invertSIMD();
  }

  // toJSON( meta ) {

  // 	const data = super.toJSON( meta );

  // 	data.object.zoom = this.zoom;
  // 	data.object.left = this.left;
  // 	data.object.right = this.right;
  // 	data.object.top = this.top;
  // 	data.object.bottom = this.bottom;
  // 	data.object.near = this.near;
  // 	data.object.far = this.far;

  // 	if ( this.view !== null ) data.object.view = Object.assign( {}, this.view );

  // 	return data;

  // }
}

import { Camera } from "./Camera";
import { RAD2DEG, DEG2RAD } from "rewild-common";
import { ViewProperties } from "./ViewProperties";
import { EngineMatrix4 } from "../math/EngineMatrix4";

export class PerspectiveCamera extends Camera {
  fov: f32;
  zoom: f32;
  near: f32;
  far: f32;
  focus: f32;
  aspect: f32;
  filmGauge: f32; // width of the film (default in millimeters)
  filmOffset: f32;
  view: ViewProperties | null;

  constructor(fov: f32 = 50, aspect: f32 = 1, near: f32 = 0.1, far: f32 = 2000) {
    super();

    this.type = "PerspectiveCamera";

    this.fov = fov;
    this.zoom = 1;

    this.near = near;
    this.far = far;
    this.focus = 10;

    this.aspect = aspect;
    this.view = null;

    this.filmGauge = 35; // width of the film (default in millimeters)
    this.filmOffset = 0; // horizontal film offset (same unit as gauge)

    this.updateProjectionMatrix();
  }

  copy(source: PerspectiveCamera, recursive: boolean = true): PerspectiveCamera {
    super.copy(source, recursive);

    this.fov = source.fov;
    this.zoom = source.zoom;

    this.near = source.near;
    this.far = source.far;
    this.focus = source.focus;

    this.aspect = source.aspect;
    this.view = source.view === null ? null : new ViewProperties(source.view);

    this.filmGauge = source.filmGauge;
    this.filmOffset = source.filmOffset;

    return this;
  }

  /**
   * Sets the FOV by focal length in respect to the current .filmGauge.
   *
   * The default film gauge is 35, so that the focal length can be specified for
   * a 35mm (full frame) camera.
   *
   * Values for focal length and film gauge must have the same unit.
   */
  setFocalLength(focalLength: f32): void {
    /** see {@link http://www.bobatkins.com/photography/technical/field_of_view.html} */
    const vExtentSlope = (0.5 * this.getFilmHeight()) / focalLength;

    this.fov = RAD2DEG * 2 * Mathf.atan(vExtentSlope);
    this.updateProjectionMatrix();
  }

  /**
   * Calculates the focal length from the current .fov and .filmGauge.
   */
  getFocalLength(): f32 {
    const vExtentSlope = Mathf.tan(DEG2RAD * 0.5 * this.fov);

    return (0.5 * this.getFilmHeight()) / vExtentSlope;
  }

  getEffectiveFOV(): f32 {
    return RAD2DEG * 2 * Mathf.atan(Mathf.tan(DEG2RAD * 0.5 * this.fov) / this.zoom);
  }

  getFilmWidth(): f32 {
    // film not completely covered in portrait format (aspect < 1)
    return this.filmGauge * Mathf.min(this.aspect, 1);
  }

  getFilmHeight(): f32 {
    // film not completely covered in landscape format (aspect > 1)
    return this.filmGauge / Mathf.max(this.aspect, 1);
  }

  /**
   * Sets an offset in a larger frustum. This is useful for multi-window or
   * multi-monitor/multi-machine setups.
   *
   * For example, if you have 3x2 monitors and each monitor is 1920x1080 and
   * the monitors are in grid like this
   *
   *   +---+---+---+
   *   | A | B | C |
   *   +---+---+---+
   *   | D | E | F |
   *   +---+---+---+
   *
   * then for each monitor you would call it like this
   *
   *   const w = 1920;
   *   const h = 1080;
   *   const fullWidth = w * 3;
   *   const fullHeight = h * 2;
   *
   *   --A--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 0, h * 0, w, h );
   *   --B--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 1, h * 0, w, h );
   *   --C--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 2, h * 0, w, h );
   *   --D--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 0, h * 1, w, h );
   *   --E--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 1, h * 1, w, h );
   *   --F--
   *   camera.setViewOffset( fullWidth, fullHeight, w * 2, h * 1, w, h );
   *
   *   Note there is no reason monitors have to be the same size or in a grid.
   */
  setViewOffset(fullWidth: f32, fullHeight: f32, x: f32, y: f32, width: f32, height: f32): void {
    this.aspect = fullWidth / fullHeight;

    if (this.view === null) {
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
    if (this.view != null) {
      this.view.enabled = false;
    }

    this.updateProjectionMatrix();
  }

  updateProjectionMatrix(): void {
    const near: f32 = this.near;
    let top: f32 = (near * Mathf.tan(DEG2RAD * 0.5 * this.fov)) / this.zoom;
    let height: f32 = 2 * top;
    let width: f32 = this.aspect * height;
    let left: f32 = -0.5 * width;
    const view = this.view;

    if (view != null && view.enabled) {
      const fullWidth = view.fullWidth,
        fullHeight = view.fullHeight;

      left += (view.offsetX * width) / fullWidth;
      top -= (view.offsetY * height) / fullHeight;
      width *= view.width / fullWidth;
      height *= view.height / fullHeight;
    }

    const skew = this.filmOffset;
    if (skew != 0) left += (near * skew) / this.getFilmWidth();

    this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far);

    (this.projectionMatrixInverse.copy(this.projectionMatrix) as EngineMatrix4).invertSIMD();
  }

  // TODO
  // toJSON( meta ) {

  // 	const data = super.toJSON( meta );

  // 	data.object.fov = this.fov;
  // 	data.object.zoom = this.zoom;

  // 	data.object.near = this.near;
  // 	data.object.far = this.far;
  // 	data.object.focus = this.focus;

  // 	data.object.aspect = this.aspect;

  // 	if ( this.view != null ) data.object.view = Object.assign( {}, this.view );

  // 	data.object.filmGauge = this.filmGauge;
  // 	data.object.filmOffset = this.filmOffset;

  // 	return data;

  // }
}

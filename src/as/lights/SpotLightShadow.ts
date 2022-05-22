import { LightShadow } from "./LightShadow";
import * as MathUtils from "../../common/math/MathUtils";
import { PerspectiveCamera } from "../cameras/PerspectiveCamera";
import { SpotLight } from "./SpotLight";

export class SpotLightShadow extends LightShadow {
  focus: f32;

  constructor() {
    super(new PerspectiveCamera(50, 1, 0.5, 500));

    this.focus = 1;
  }

  updateMatrices(light: SpotLight): void {
    const camera = this.camera as PerspectiveCamera;

    const fov = MathUtils.RAD2DEG * 2 * light.angle * this.focus;
    const aspect = this.mapSize.width / this.mapSize.height;
    const far = light.distance || camera.far;

    if (fov !== camera.fov || aspect !== camera.aspect || far !== camera.far) {
      camera.fov = fov;
      camera.aspect = aspect;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    super.updateMatrices(light);
  }

  copy(source: SpotLightShadow): SpotLightShadow {
    super.copy(source);

    this.focus = source.focus;

    return this;
  }
}

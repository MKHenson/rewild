import { Camera } from "../../cameras/Camera";
import { AmbientLight } from "../../lights/AmbientLight";
import { DirectionalLight } from "../../lights/DirectionalLight";
import { Light } from "../../lights/Light";
import { Color } from "../../math/Color";
import { Vector3 } from "../../math/Vector3";

const color: Color = new Color();
const vector1: Vector3 = new Vector3();
const vector2: Vector3 = new Vector3();

// The buffer size of 1 direction light struct
// Made up of 2 vec4. The first is direction followed by color
const SIZE_DIR_LIGHT_BUFFER: u32 = 4 * 2;

export class WebGPULights {
  numDirectionLights: i32;
  lightingConfigBuffer: Uint32Array;
  sceneLightsBuffer: Float32Array;
  directionLightsBuffer!: Float32Array;

  constructor() {
    this.numDirectionLights = 0;
    this.lightingConfigBuffer = new Uint32Array(1);
    this.sceneLightsBuffer = new Float32Array(4);
  }

  setupLights(lights: Light[], camera: Camera): void {
    let directionLight: DirectionalLight;
    const viewMatrix = camera.matrixWorldInverse;

    let numDirLights: u32 = 0;
    color.setRGB(0, 0, 0);

    for (let i: i32 = 0, l = lights.length; i < l; i++) {
      if (lights[i] instanceof DirectionalLight) {
        numDirLights++;
      } else if (lights[i] instanceof AmbientLight) {
        const ambient = lights[i] as AmbientLight;
        color.setRGB(
          ambient.color.r * ambient.intensity,
          ambient.color.g * ambient.intensity,
          ambient.color.b * ambient.intensity
        );
      }
    }

    this.numDirectionLights = numDirLights;

    // Set the info buffer of num of direction lights
    this.lightingConfigBuffer[0] = numDirLights;

    // Set the scene buffer ambient value
    this.sceneLightsBuffer[0] = color.r;
    this.sceneLightsBuffer[1] = color.g;
    this.sceneLightsBuffer[2] = color.b;

    this.directionLightsBuffer = new Float32Array(SIZE_DIR_LIGHT_BUFFER * numDirLights);

    for (let i: i32 = 0, l = lights.length; i < l; i++) {
      if (lights[i] instanceof DirectionalLight) {
        directionLight = lights[i] as DirectionalLight;

        vector1.setFromMatrixPosition(directionLight.matrixWorld);
        vector2.setFromMatrixPosition(directionLight.target.matrixWorld);
        vector1.sub(vector2);
        vector1.transformDirection(viewMatrix);

        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER] = vector1.x;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 1] = vector1.y;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 2] = vector1.z;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 3] = 0; // Padding
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 4] = directionLight.color.r * directionLight.intensity;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 5] = directionLight.color.g * directionLight.intensity;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 6] = directionLight.color.b * directionLight.intensity;
        this.directionLightsBuffer[i * SIZE_DIR_LIGHT_BUFFER + 7] = 0; // Padding
      }
    }
  }
}

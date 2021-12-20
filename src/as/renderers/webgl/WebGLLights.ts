import { Camera } from "../../cameras/Camera";
import { AmbientLight } from "../../lights/AmbientLight";
import { DirectionalLight } from "../../lights/DirectionalLight";
import { HemisphereLight } from "../../lights/HemispherLight";
import { Light } from "../../lights/Light";
import { LightProbe } from "../../lights/LightProbe";
import { PointLight } from "../../lights/PointLight";
import { RectAreaLight } from "../../lights/RectAreaLight";
import { SpotLight } from "../../lights/SpotLight";
import { Color } from "../../math/Color";
import { Matrix4 } from "../../math/Matrix4";
import { Vector2 } from "../../math/Vector2";
import { Vector3 } from "../../math/Vector3";
// import { UniformsLib } from "../shaders/UniformsLib";
import { fillArray } from "../../utils";
import { PerspectiveCamera } from "../../cameras/PerspectiveCamera";

class Uniform<T> {
  value: T;
  constructor(value: T) {
    this.value = value;
  }
}

class LightUniform {
  position: Uniform<Vector3> | null;
  direction: Uniform<Vector3> | null;
  color: Uniform<Color> | null;
  distance: Uniform<i32> | null;
  coneCos: Uniform<i32> | null;
  penumbraCos: Uniform<i32> | null;
  decay: Uniform<i32> | null;
  halfWidth: Uniform<Vector3> | null;
  halfHeight: Uniform<Vector3> | null;
  skyColor: Uniform<Color> | null;
  groundColor: Uniform<Color> | null;

  constructor() {
    this.position = null;
    this.direction = null;
    this.color = null;
    this.distance = null;
    this.coneCos = null;
    this.penumbraCos = null;
    this.decay = null;
    this.halfWidth = null;
    this.halfHeight = null;
    this.skyColor = null;
    this.groundColor = null;
  }
}

class ShadowUniform {
  shadowBias: Uniform<f32> | null;
  shadowNormalBias: Uniform<f32> | null;
  shadowRadius: Uniform<f32> | null;
  shadowMapSize: Uniform<Vector2> | null;
  shadowCameraNear: Uniform<f32> | null;
  shadowCameraFar: Uniform<f32> | null;

  constructor() {
    this.shadowBias = null;
    this.shadowNormalBias = null;
    this.shadowRadius = null;
    this.shadowMapSize = null;
    this.shadowCameraNear = null;
    this.shadowCameraFar = null;
  }
}

class UniformsCache {
  lights: Map<i32, LightUniform>;

  constructor() {
    this.lights = new Map();
  }

  get(light: Light): LightUniform {
    const lights = this.lights;

    if (lights.has(light.id)) {
      return lights.get(light.id);
    }

    let uniforms = new LightUniform();

    switch (light.type) {
      case "DirectionalLight":
        uniforms.direction = new Uniform(new Vector3());
        uniforms.color = new Uniform(new Color());
        break;

      case "SpotLight":
        uniforms.position = new Uniform(new Vector3());
        uniforms.direction = new Uniform(new Vector3());
        uniforms.color = new Uniform(new Color());
        uniforms.distance = new Uniform(0);
        uniforms.coneCos = new Uniform(0);
        uniforms.penumbraCos = new Uniform(0);
        uniforms.decay = new Uniform(0);
        break;

      case "PointLight":
        uniforms.position = new Uniform(new Vector3());
        uniforms.color = new Uniform(new Color());
        uniforms.distance = new Uniform(0);
        uniforms.decay = new Uniform(0);
        break;

      case "HemisphereLight":
        uniforms.direction = new Uniform(new Vector3());
        uniforms.skyColor = new Uniform(new Color());
        uniforms.groundColor = new Uniform(new Color());
        break;

      case "RectAreaLight":
        uniforms.color = new Uniform(new Color());
        uniforms.position = new Uniform(new Vector3());
        uniforms.halfWidth = new Uniform(new Vector3());
        uniforms.halfHeight = new Uniform(new Vector3());
        break;
    }

    lights.set(light.id, uniforms);
    return uniforms;
  }
}

class ShadowUniformsCache {
  lights: Map<i32, ShadowUniform>;

  constructor() {
    this.lights = new Map();
  }

  get(light: Light): ShadowUniform {
    const lights = this.lights;

    if (lights.has(light.id)) {
      return lights.get(light.id);
    }

    let uniforms = new ShadowUniform();

    switch (light.type) {
      case "DirectionalLight":
        uniforms.shadowBias = new Uniform(0);
        uniforms.shadowNormalBias = new Uniform(0);
        uniforms.shadowRadius = new Uniform(1);
        uniforms.shadowMapSize = new Uniform(new Vector2());
        break;

      case "SpotLight":
        uniforms.shadowBias = new Uniform(0);
        uniforms.shadowNormalBias = new Uniform(0);
        uniforms.shadowRadius = new Uniform(1);
        uniforms.shadowMapSize = new Uniform(new Vector2());
        break;

      case "PointLight":
        uniforms.shadowBias = new Uniform(0);
        uniforms.shadowNormalBias = new Uniform(0);
        uniforms.shadowRadius = new Uniform(1);
        uniforms.shadowMapSize = new Uniform(new Vector2());
        uniforms.shadowCameraNear = new Uniform(1);
        uniforms.shadowCameraFar = new Uniform(1000);
        break;

      // TODO (abelnation): set RectAreaLight shadow uniforms
    }

    lights.set(light.id, uniforms);
    return uniforms;
  }
}

let nextVersion: i32 = 0;

function shadowCastingLightsFirst(lightA: Light, lightB: Light): i32 {
  return (lightB.castShadow ? 1 : 0) - (lightA.castShadow ? 1 : 0);
}

class WebGLLightsStateHash {
  directionalLength: i32;
  pointLength: i32;
  spotLength: i32;
  rectAreaLength: i32;
  hemiLength: i32;
  numDirectionalShadows: i32;
  numPointShadows: i32;
  numSpotShadows: i32;

  constructor() {
    this.directionalLength = -1;
    this.pointLength = -1;
    this.spotLength = -1;
    this.rectAreaLength = -1;
    this.hemiLength = -1;
    this.numDirectionalShadows = -1;
    this.numPointShadows = -1;
    this.numSpotShadows = -1;
  }
}

class WebGLLightsState {
  version: i32;
  hash: WebGLLightsStateHash;
  ambient: i32[];
  probe: Vector3[];
  directional: LightUniform[];
  directionalShadow: ShadowUniform[];
  directionalShadowMap: LightUniform[];
  directionalShadowMatrix: Matrix4[];
  spot: LightUniform[];
  spotShadow: ShadowUniform[];
  spotShadowMap: ShadowUniform[];
  spotShadowMatrix: Matrix4[];
  rectArea: LightUniform[];
  // TODO:
  // rectAreaLTC1: null;
  // rectAreaLTC2: null;
  point: LightUniform[];
  pointShadow: ShadowUniform[];
  pointShadowMap: ShadowUniform[];
  pointShadowMatrix: Matrix4[];
  hemi: LightUniform[];

  constructor() {
    this.version = 0;
    this.hash = new WebGLLightsStateHash();
    this.ambient = [0, 0, 0];
    this.probe = [];
    this.directional = [];
    this.directionalShadow = [];
    this.directionalShadowMap = [];
    this.directionalShadowMatrix = [];
    this.spot = [];
    this.spotShadow = [];
    this.spotShadowMap = [];
    this.spotShadowMatrix = [];
    this.rectArea = [];
    // this.rectAreaLTC1 = null;
    // this.rectAreaLTC2 = null;
    this.point = [];
    this.pointShadow = [];
    this.pointShadowMap = [];
    this.pointShadowMatrix = [];
    this.hemi = [];
  }
}

const vector3 = new Vector3();
const matrix4 = new Matrix4();
const matrix42 = new Matrix4();

export class WebGLLights {
  cache: UniformsCache;
  shadowCache: ShadowUniformsCache;
  state: WebGLLightsState;

  constructor() {
    this.cache = new UniformsCache();
    this.shadowCache = new ShadowUniformsCache();
    this.state = new WebGLLightsState();

    for (let i: i32 = 0; i < 9; i++) this.state.probe.push(new Vector3());
  }

  setup(lights: Light[], physicallyCorrectLights: boolean): void {
    const state = this.state;
    const cache = this.cache;
    const shadowCache = this.shadowCache;

    let r: f32 = 0,
      g: f32 = 0,
      b: f32 = 0;

    for (let i: i32 = 0; i < 9; i++) state.probe[i].set(0, 0, 0);

    let directionalLength: f32 = 0;
    let pointLength: f32 = 0;
    let spotLength: f32 = 0;
    let rectAreaLength: f32 = 0;
    let hemiLength: f32 = 0;

    let numDirectionalShadows: i32 = 0;
    let numPointShadows: i32 = 0;
    let numSpotShadows: i32 = 0;

    lights.sort(shadowCastingLightsFirst);

    // artist-friendly light intensity scaling factor
    const scaleFactor = physicallyCorrectLights != true ? Math.PI : 1;

    for (let i: i32 = 0, l: i32 = lights.length; i < l; i++) {
      const light = lights[i];

      const color = light.color;
      const intensity = light.intensity;
      const distance =
        light instanceof PointLight
          ? (light as PointLight).distance
          : light instanceof SpotLight
          ? (light as SpotLight).distance
          : 0;

      // TODO:
      // const shadow =
      //   light instanceof PointLight
      //     ? (light as PointLight).shadow
      //     : light instanceof SpotLight
      //     ? (light as SpotLight).shadow
      //     : light instanceof DirectionalLight
      //     ? (light as DirectionalLight).shadow
      //     : null;

      // TODO:
      // const shadowMap = shadow && shadow.map ? shadow.map.texture : null;
      const shadowMap = null;

      if (light instanceof AmbientLight) {
        r += color.r * intensity * scaleFactor;
        g += color.g * intensity * scaleFactor;
        b += color.b * intensity * scaleFactor;
      } else if (light instanceof LightProbe) {
        for (let j = 0; j < 9; j++) {
          state.probe[j].addScaledVector(light.sh.coefficients[j], intensity);
        }
      } else if (light instanceof DirectionalLight) {
        const uniforms = cache.get(light);

        uniforms.color!.value.copy(light.color).multiplyScalar(light.intensity * scaleFactor);

        if (light.castShadow) {
          const shadow = light.shadow;

          const shadowUniforms = shadowCache.get(light);

          shadowUniforms.shadowBias!.value = shadow.bias;
          shadowUniforms.shadowNormalBias!.value = shadow.normalBias;
          shadowUniforms.shadowRadius!.value = shadow.radius;
          shadowUniforms.shadowMapSize!.value = shadow.mapSize;

          state.directionalShadow[directionalLength] = shadowUniforms;
          // TODO:
          // state.directionalShadowMap[directionalLength] = shadowMap;
          state.directionalShadowMatrix[directionalLength] = light.shadow.matrix;

          numDirectionalShadows++;
        }

        state.directional[directionalLength] = uniforms;

        directionalLength++;
      } else if (light instanceof SpotLight) {
        const uniforms = cache.get(light);

        uniforms.position!.value.setFromMatrixPosition(light.matrixWorld);

        uniforms.color!.value.copy(color).multiplyScalar(intensity * scaleFactor);
        uniforms.distance!.value = distance;

        uniforms.coneCos!.value = Math.cos(light.angle);
        uniforms.penumbraCos!.value = Math.cos(light.angle * (1 - light.penumbra));
        uniforms.decay!.value = light.decay;

        if (light.castShadow) {
          const shadow = light.shadow;

          const shadowUniforms = shadowCache.get(light);

          shadowUniforms.shadowBias!.value = shadow.bias;
          shadowUniforms.shadowNormalBias!.value = shadow.normalBias;
          shadowUniforms.shadowRadius!.value = shadow.radius;
          shadowUniforms.shadowMapSize!.value = shadow.mapSize;

          state.spotShadow[spotLength] = shadowUniforms;
          // TODO:
          // state.spotShadowMap[spotLength] = shadowMap;
          state.spotShadowMatrix[spotLength] = light.shadow.matrix;

          numSpotShadows++;
        }

        state.spot[spotLength] = uniforms;

        spotLength++;
      } else if (light instanceof RectAreaLight) {
        const uniforms = cache.get(light);

        // (a) intensity is the total visible light emitted
        //uniforms.color.copy( color ).multiplyScalar( intensity / ( light.width * light.height * Math.PI ) );

        // (b) intensity is the brightness of the light
        uniforms.color!.value.copy(color).multiplyScalar(intensity);

        uniforms.halfWidth!.value.set(light.width * 0.5, 0.0, 0.0);
        uniforms.halfHeight!.value.set(0.0, light.height * 0.5, 0.0);

        state.rectArea[rectAreaLength] = uniforms;

        rectAreaLength++;
      } else if (light instanceof PointLight) {
        const uniforms = cache.get(light);

        uniforms.color!.value.copy(light.color).multiplyScalar(light.intensity * scaleFactor);
        uniforms.distance!.value = light.distance;
        uniforms.decay!.value = light.decay;

        if (light.castShadow) {
          const shadow = light.shadow;

          const shadowUniforms = shadowCache.get(light);

          const pCam = shadow.camera as PerspectiveCamera;
          shadowUniforms.shadowBias!.value = shadow.bias;
          shadowUniforms.shadowNormalBias!.value = shadow.normalBias;
          shadowUniforms.shadowRadius!.value = shadow.radius;
          shadowUniforms.shadowMapSize!.value = shadow.mapSize;
          shadowUniforms.shadowCameraNear!.value = pCam.near;
          shadowUniforms.shadowCameraFar!.value = pCam.far;

          state.pointShadow[pointLength] = shadowUniforms;
          // TODO:
          // state.pointShadowMap[pointLength] = shadowMap;
          state.pointShadowMatrix[pointLength] = light.shadow.matrix;

          numPointShadows++;
        }

        state.point[pointLength] = uniforms;

        pointLength++;
      } else if (light instanceof HemisphereLight) {
        const uniforms = cache.get(light);

        uniforms.skyColor!.value.copy(light.color).multiplyScalar(intensity * scaleFactor);
        uniforms.groundColor!.value.copy(light.groundColor).multiplyScalar(intensity * scaleFactor);

        state.hemi[hemiLength] = uniforms;

        hemiLength++;
      }
    }

    // TODO:
    // if (rectAreaLength > 0) {
    // if (capabilities.isWebGL2) {
    //   // WebGL 2

    // state.rectAreaLTC1 = UniformsLib.LTC_FLOAT_1;
    // state.rectAreaLTC2 = UniformsLib.LTC_FLOAT_2;
    // }
    // else {
    //   // WebGL 1

    //   if (extensions.has("OES_texture_float_linear") === true) {
    //     state.rectAreaLTC1 = UniformsLib.LTC_FLOAT_1;
    //     state.rectAreaLTC2 = UniformsLib.LTC_FLOAT_2;
    //   } else if (extensions.has("OES_texture_half_float_linear") === true) {
    //     state.rectAreaLTC1 = UniformsLib.LTC_HALF_1;
    //     state.rectAreaLTC2 = UniformsLib.LTC_HALF_2;
    //   } else {
    //     console.error("THREE.WebGLRenderer: Unable to use RectAreaLight. Missing WebGL extensions.");
    //   }
    // }
    // }

    state.ambient[0] = r;
    state.ambient[1] = g;
    state.ambient[2] = b;

    const hash = state.hash;

    if (
      hash.directionalLength !== directionalLength ||
      hash.pointLength !== pointLength ||
      hash.spotLength !== spotLength ||
      hash.rectAreaLength !== rectAreaLength ||
      hash.hemiLength !== hemiLength ||
      hash.numDirectionalShadows !== numDirectionalShadows ||
      hash.numPointShadows !== numPointShadows ||
      hash.numSpotShadows !== numSpotShadows
    ) {
      state.directional = fillArray(new Array(directionalLength), state.directional);
      state.spot.length = spotLength;
      state.rectArea.length = rectAreaLength;
      state.point.length = pointLength;
      state.hemi.length = hemiLength;

      state.directionalShadow.length = numDirectionalShadows;
      state.directionalShadowMap.length = numDirectionalShadows;
      state.pointShadow.length = numPointShadows;
      state.pointShadowMap.length = numPointShadows;
      state.spotShadow.length = numSpotShadows;
      state.spotShadowMap.length = numSpotShadows;
      state.directionalShadowMatrix.length = numDirectionalShadows;
      state.pointShadowMatrix.length = numPointShadows;
      state.spotShadowMatrix.length = numSpotShadows;

      hash.directionalLength = directionalLength;
      hash.pointLength = pointLength;
      hash.spotLength = spotLength;
      hash.rectAreaLength = rectAreaLength;
      hash.hemiLength = hemiLength;

      hash.numDirectionalShadows = numDirectionalShadows;
      hash.numPointShadows = numPointShadows;
      hash.numSpotShadows = numSpotShadows;

      state.version = nextVersion++;
    }
  }

  setupView(lights: Light[], camera: Camera): void {
    const state = this.state;

    let directionalLength: f32 = 0;
    let pointLength: f32 = 0;
    let spotLength: f32 = 0;
    let rectAreaLength: f32 = 0;
    let hemiLength: f32 = 0;

    const viewMatrix = camera.matrixWorldInverse;

    for (let i: i32 = 0, l: i32 = lights.length; i < l; i++) {
      const light = lights[i];

      if (light instanceof DirectionalLight) {
        const uniforms = state.directional[directionalLength];

        uniforms.direction!.value.setFromMatrixPosition(light.matrixWorld);
        vector3.setFromMatrixPosition(light.target.matrixWorld);
        uniforms.direction!.value.sub(vector3);
        uniforms.direction!.value.transformDirection(viewMatrix);

        directionalLength++;
      } else if (light instanceof SpotLight) {
        const uniforms = state.spot[spotLength];

        uniforms.position!.value.setFromMatrixPosition(light.matrixWorld);
        uniforms.position!.value.applyMatrix4(viewMatrix);

        uniforms.direction!.value.setFromMatrixPosition(light.matrixWorld);
        vector3.setFromMatrixPosition(light.target.matrixWorld);
        uniforms.direction!.value.sub(vector3);
        uniforms.direction!.value.transformDirection(viewMatrix);

        spotLength++;
      } else if (light instanceof RectAreaLight) {
        const uniforms = state.rectArea[rectAreaLength];

        uniforms.position!.value.setFromMatrixPosition(light.matrixWorld);
        uniforms.position!.value.applyMatrix4(viewMatrix);

        // extract local rotation of light to derive width/height half vectors
        matrix42.identity();
        matrix4.copy(light.matrixWorld);
        matrix4.premultiply(viewMatrix);
        matrix42.extractRotation(matrix4);

        uniforms.halfWidth!.value.set(light.width * 0.5, 0.0, 0.0);
        uniforms.halfHeight!.value.set(0.0, light.height * 0.5, 0.0);

        uniforms.halfWidth!.value.applyMatrix4(matrix42);
        uniforms.halfHeight!.value.applyMatrix4(matrix42);

        rectAreaLength++;
      } else if (light instanceof PointLight) {
        const uniforms = state.point[pointLength];

        uniforms.position!.value.setFromMatrixPosition(light.matrixWorld);
        uniforms.position!.value.applyMatrix4(viewMatrix);

        pointLength++;
      } else if (light instanceof HemisphereLight) {
        const uniforms = state.hemi[hemiLength];

        uniforms.direction!.value.setFromMatrixPosition(light.matrixWorld);
        uniforms.direction!.value.transformDirection(viewMatrix);
        uniforms.direction!.value.normalize();

        hemiLength++;
      }
    }
  }
}

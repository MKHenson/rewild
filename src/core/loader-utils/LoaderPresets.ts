import { IActor, Vector3 } from 'models';
import {
  AmbientLight,
  Component,
  DirectionalLight,
  Object3D,
  PhysicsComponent,
  wasm,
} from 'packages/rewild-wasmtime';
import { geometryManager } from 'src/core/renderer/AssetManagers/GeometryManager';
import { SphereGeometry } from 'src/core/renderer/geometry/SphereGeometry';

export type LoaderPresetType =
  | 'crate'
  | 'planet'
  | 'ball'
  | 'ambient-light'
  | 'directional-light';

export const LoaderPresets: {
  [key in LoaderPresetType]: (actor: IActor, object: Object3D) => void;
} = {
  crate: (actor, object) => {
    const component = new PhysicsComponent(
      wasm.createBodyBox(0.5, 0.5, 0.5, 30)
    );
    component.mass = 30;

    const position = actor.properties.find((prop) => prop.type === 'position')
      ?.value as Vector3;

    if (position) {
      component.positionX = position[0];
      component.positionY = position[1];
      component.positionZ = position[2];
    }

    object.addComponent(component);
  },
  ball: (actor, object) => {
    const geometryName = actor.properties.find(
      (prop) => prop.type === 'geometry'
    )?.value as string;
    const geometry = geometryManager.getAsset(geometryName);

    const component = new PhysicsComponent(
      wasm.createBodyBall((geometry as SphereGeometry).parameters.radius, 1)
    );
    component.mass = 1;

    const [x, y, z] = actor.properties.find((prop) => prop.type === 'position')
      ?.value as Vector3;
    component.positionX = x;
    component.positionY = y;
    component.positionZ = z;

    object.addComponent(component);
  },
  planet: (actor, object) => {
    const size = actor.properties.find((prop) => prop.type === 'size')?.value;
    const speed = actor.properties.find((prop) => prop.type === 'speed')?.value;

    const component = new Component(
      wasm.createPlanetComponent(size as number, speed as number)
    );
    object.addComponent(component);
  },
  'ambient-light': (actor, object) => {
    const [r, g, b] = actor.properties.find((prop) => prop.type === 'color')
      ?.value as Vector3;
    const light = object as AmbientLight;
    light.setColor(r, g, b);
    light.intensity = parseFloat(
      actor.properties.find((prop) => prop.type === 'intensity')
        ?.value as string
    );
  },
  'directional-light': (actor, object) => {
    const [r, g, b] = actor.properties.find((prop) => prop.type === 'color')
      ?.value as Vector3;
    const [x, y, z] = actor.properties.find((prop) => prop.type === 'position')
      ?.value as Vector3;
    const [tx, ty, tz] = actor.properties.find((prop) => prop.type === 'target')
      ?.value as Vector3;
    const light = object as DirectionalLight;
    light.setColor(r, g, b);
    light.setPosition(x, y, z);
    light.setTarget(tx, ty, tz);
    light.intensity = parseFloat(
      actor.properties.find((prop) => prop.type === 'intensity')
        ?.value as string
    );
  },
};

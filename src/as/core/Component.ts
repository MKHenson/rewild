import { Intersection } from "../components/MeshComponent";
import { Raycaster } from "./Raycaster";
import { addComponent, TransformNode } from "./TransformNode";

export class Component {
  transform: TransformNode | null;

  constructor() {}

  raycast(raycaster: Raycaster, intersects: Intersection[]): void {}

  copy(source: Component): Component {
    if (source.transform) addComponent(source.transform, this);
    return this;
  }
}

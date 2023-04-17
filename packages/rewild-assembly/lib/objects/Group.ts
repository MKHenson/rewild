import { TransformNode } from "../core/TransformNode";

export class Group extends TransformNode {
  constructor() {
    super();
    this.type = "Group";
  }
}

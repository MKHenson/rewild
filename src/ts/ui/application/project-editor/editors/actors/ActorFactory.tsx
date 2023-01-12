import { IActor } from "models";
import { ITreeNode, NodeDragData } from "../../../../common/Tree";
import { createUUID } from "../../../../utils";

const actors: IActor[] = [
  {
    baseType: "static",
    geometry: "sphere",
    id: createUUID(),
    name: "Earth",
    pipeline: "earth",
    type: "actor",
  },
];

export class ActorFactory {
  buildTree() {
    return [
      {
        name: "Actors",
        icon: "man",
        children: actors.map((actor) => ({
          name: actor.name,
          icon: "label_important",
          canSelect: true,
          iconSize: "xs",
          resource: actor,
          children: [],
          onDragStart: (node) => ({ type: "treenode", data: { ...actor, id: createUUID() } } as NodeDragData),
        })),
      } as ITreeNode,
    ];
  }
}

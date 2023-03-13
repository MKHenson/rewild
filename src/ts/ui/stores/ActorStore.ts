import { IActor, IProperty, ITemplateTreeNode, ITreeNode } from "models";
import { Store } from "../Store";
import { createUUID } from "../utils";

export interface IActorStoreStore {
  nodes: ITreeNode[];
}

const baseActorTemplate: ITreeNode = {
  canRename: true,
  canSelect: true,
  icon: "label_important",
  iconSize: "xs",
};

const baseActorProperties: IProperty[] = [
  {
    name: "Size",
    type: "string",
    value: "1",
  },
];

const actorTemplates: { name: string; template: () => ITreeNode }[] = [
  {
    name: "Earth",
    template: () => ({
      ...baseActorTemplate,
      resource: {
        properties: [...baseActorProperties],
        target: {
          name: "Earth",
          type: "actor",
          id: createUUID(),
          baseType: "static",
          geometry: "sphere",
          pipeline: "earth",
        } as IActor,
      },
    }),
  },
];

export class ActorStore extends Store<IActorStoreStore> {
  constructor() {
    super({
      nodes: [
        {
          name: "Actors",
          icon: "man",
          children: actorTemplates.map(
            (actor) =>
              ({
                icon: "label_important",
                iconSize: "xs",
                name: actor.name,
                template: actor.template,
              } as ITemplateTreeNode)
          ),
        },
      ],
    });
  }
}

export const actorStore = new ActorStore();

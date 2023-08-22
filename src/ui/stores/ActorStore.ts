import { IActor, ITemplateTreeNode, ITreeNode, ITreeNodeAction } from "models";
import { Store, createUUID } from "rewild-ui";
import { baseActorTemplate } from "../utils/TemplateFactories";
import { Vector3 } from "packages/rewild-common";

export interface IActorStoreStore {
  nodes: ITreeNode[];
}

const actorTemplates: ITemplateTreeNode[] = [
  {
    name: "Earth",
    factoryKey: "actor",
    template: () => ({
      ...baseActorTemplate,
      icon: "label_important",
      resource: {
        properties: [
          {
            name: "Size",
            type: "string",
            value: "1",
          },
          {
            name: "Speed",
            type: "string",
            value: "1",
          },
          {
            name: "Geometry",
            type: "enum",
            value: "sphere",
            options: [
              { value: "sphere", label: "Sphere" },
              { value: " box", label: "Box" },
            ],
          },
          {
            name: "Pipeline",
            type: "hidden",
            value: "earth",
          },
        ],
        name: "Earth",
        type: "actor",
        id: createUUID(),
        baseType: "static",
      } as IActor,
    }),
  },
  {
    name: "Crate",
    factoryKey: "actor",
    template: () => ({
      ...baseActorTemplate,
      icon: "label_important",
      resource: {
        name: "Crate",
        id: createUUID(),
        type: "actor",
        properties: [
          {
            name: "Geometry",
            type: "hidden",
            value: "box",
          },
          {
            name: "Pipeline",
            type: "hidden",
            value: "crate",
          },
          {
            name: "Position",
            type: "vec3",
            value: new Vector3(),
          },
        ],
        baseType: "static",
      } as IActor,
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
          children: actorTemplates.map((actor) => ({
            icon: "label_important",
            iconSize: "xs",
            name: actor.name,
            template: actor.template,
            onDragStart(node) {
              return { type: "treenode", node: { ...(node as ITemplateTreeNode).template() } } as ITreeNodeAction;
            },
          })),
        },
      ],
    });
  }
}

export const actorStore = new ActorStore();

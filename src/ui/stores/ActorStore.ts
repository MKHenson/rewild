import { IActor, ITemplateTreeNode, ITreeNode, ITreeNodeAction, Vector3 } from "models";
import { Store, createUUID } from "rewild-ui";
import { baseActorTemplate } from "../utils/TemplateFactories";

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
            label: "Size",
            type: "size",
            valueType: "string",
            value: "1",
          },
          {
            label: "Speed",
            type: "speed",
            valueType: "string",
            value: "1",
          },
          {
            label: "Geometry",
            type: "geometry",
            valueType: "enum",
            value: "sphere",
            options: [
              { value: "sphere", label: "Sphere" },
              { value: " box", label: "Box" },
            ],
          },
          {
            label: "Pipeline",
            type: "pipeline",
            valueType: "hidden",
            value: "earth",
          },
        ],
        name: "Earth",
        type: "actor",
        id: createUUID(),
        actorLoaderPreset: "planet",
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
            label: "Geometry",
            type: "geometry",
            valueType: "hidden",
            value: "box",
          },
          {
            label: "Pipeline",
            type: "pipeline",
            valueType: "hidden",
            value: "crate",
          },
          {
            label: "Position",
            type: "position",
            valueType: "vec3",
            value: [0, 0, 0] as Vector3,
          },
        ],
        actorLoaderPreset: "crate",
        baseType: "dynamic",
      } as IActor,
    }),
  },
  {
    name: "Basketball",
    factoryKey: "actor",
    template: () => ({
      ...baseActorTemplate,
      icon: "label_important",
      resource: {
        name: "Basketball",
        id: createUUID(),
        type: "actor",
        properties: [
          {
            label: "Geometry",
            type: "geometry",
            valueType: "hidden",
            value: "ball",
          },
          {
            label: "Pipeline",
            type: "pipeline",
            valueType: "hidden",
            value: "basketball",
          },
          {
            label: "Position",
            type: "position",
            valueType: "vec3",
            value: [0, 0, 0] as Vector3,
          },
        ],
        baseType: "dynamic",
        actorLoaderPreset: "ball",
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

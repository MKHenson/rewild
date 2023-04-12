import { ITemplateTreeNode, ITreeNode, ITreeNodeAction } from "models";
import { Store } from "@rewild/ui/lib/Store";
import { actorFactory } from "../utils/TemplateFactories";

export interface IActorStoreStore {
  nodes: ITreeNode[];
}

const actorTemplates: ITemplateTreeNode[] = [
  {
    name: "Earth",
    factoryKey: "actor",
    template: actorFactory,
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

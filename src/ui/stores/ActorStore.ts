import {
  IActorTemplates,
  IResource,
  ITemplateTreeNode,
  ITreeNodeAction,
} from 'models';
import { ITreeNode, Store, createUUID } from 'rewild-ui';
import { baseActorTemplate } from '../utils/TemplateFactories';

export interface IActorStoreStore {
  loading: boolean;
}

export class ActorStore extends Store<IActorStoreStore> {
  nodes: ITreeNode<IResource>[];

  constructor() {
    super({
      loading: false,
    });

    this.nodes = [];
  }

  async loadTemplate() {
    this.defaultProxy.loading = true;

    const actorTemplates = (await fetch('/templates/actors-library.json').then(
      (res) => res.json()
    )) as IActorTemplates;

    this.nodes = actorTemplates['actor-templates'].map(
      (template) =>
        ({
          name: template.name,
          icon: template.icon,
          children: template.actors.map(
            (actor) =>
              ({
                icon: 'label_important',
                iconSize: 'xs',
                name: actor.name,
                template: () => ({
                  ...baseActorTemplate,
                  icon: 'label_important',
                  resource: {
                    ...actor,
                    id: createUUID(),
                    type: actor.type || 'actor',
                  },
                }),
                onDragStart(node) {
                  return {
                    type: 'treenode',
                    node: {
                      ...(node as ITemplateTreeNode).template(),
                    } as ITreeNodeAction,
                  };
                },
              } as ITreeNode<IResource>)
          ),
        } as ITreeNode<IResource>)
    );

    this.defaultProxy.loading = false;
  }
}

export const actorStore = new ActorStore();

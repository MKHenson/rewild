import {
  IActorTemplates,
  IResource,
  ITemplateTreeNode,
  ITreeNodeAction,
} from 'models';
import { ITreeNode, createUUID } from 'rewild-ui';
import { baseActorTemplate } from '../utils/TemplateFactories';
import { Dispatcher } from 'rewild-common';

export type ActorStoreEvents = { kind: 'changed' };

export class ActorStore {
  loading = false;
  nodes: ITreeNode<IResource>[] = [];

  readonly dispatcher = new Dispatcher<ActorStoreEvents>();

  async loadTemplate() {
    this.loading = true;
    this.dispatcher.dispatch({ kind: 'changed' });

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

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }
}

export const actorStore = new ActorStore();

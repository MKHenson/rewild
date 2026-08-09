import 'rewild-ui/compiler/jsx';
import { ITreeNode } from 'rewild-ui';
import { IResource, ITemplateTreeNode } from 'models';
import { SceneGraphEvents, SceneGraphStore } from './SceneGraphStore';

describe('SceneGraphStore', () => {
  let store: SceneGraphStore;
  let containersNode: ITemplateTreeNode;
  let events: SceneGraphEvents[];

  const findContainer = (name: string) =>
    containersNode.children!.find((child) => child.name === name)!;

  beforeEach(() => {
    store = new SceneGraphStore();

    // Two containers under a Containers root, mirroring buildTreeFromProject.
    containersNode = {
      name: 'Containers',
      factoryKey: 'container',
      template: () => ({
        name: 'New Container',
        resource: { id: 'new', name: 'New Container', type: 'container' },
      }),
      children: [],
    } as unknown as ITemplateTreeNode;

    for (const id of ['a', 'b']) {
      const container: ITreeNode<IResource> = {
        name: id,
        parent: containersNode,
        resource: { id, name: id, type: 'container' } as IResource,
      };
      containersNode.children!.push(container);
    }

    store.nodes = [containersNode];

    events = [];
    store.dispatcher.add((event) => events.push(event));
  });

  describe('setActiveContainer', () => {
    it('deactivates the previous container when switching directly between two', () => {
      store.setActiveContainer('a');
      events.length = 0;

      store.setActiveContainer('b');

      expect(events).toEqual([
        { kind: 'container-deactivated', container: findContainer('a') },
        { kind: 'container-activated', container: findContainer('b') },
      ]);
      expect(store.selectedContainerId).toBe('b');
    });

    it('deactivates without activating when cleared', () => {
      store.setActiveContainer('a');
      events.length = 0;

      store.setActiveContainer(null);

      expect(events).toEqual([
        { kind: 'container-deactivated', container: findContainer('a') },
      ]);
      expect(store.selectedContainerId).toBeNull();
    });

    it('does nothing when the container is already active', () => {
      store.setActiveContainer('a');
      events.length = 0;

      store.setActiveContainer('a');

      expect(events).toEqual([]);
    });
  });

  describe('createChildNode', () => {
    it('links the new node to its parent so sibling lookups work', () => {
      store.createChildNode(containersNode);

      const created = containersNode.children![2];
      expect(created.parent).toBe(containersNode);
    });
  });
});

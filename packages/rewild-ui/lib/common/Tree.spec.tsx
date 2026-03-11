import '../../compiler/jsx';
import { traverseTree, Tree } from './Tree';

type TreeOptions = NonNullable<ConstructorParameters<typeof Tree>[0]>;
type TreeProps = TreeOptions['props'];

describe('traverseTree', () => {
  it('visits all nodes in order', () => {
    const visited: string[] = [];
    const nodes = [
      {
        name: 'root1',
        canSelect: true,
        children: [
          { name: 'child1', canSelect: true },
          { name: 'child2', canSelect: true },
        ],
      },
      { name: 'root2', canSelect: true },
    ];

    traverseTree(nodes, (node) => {
      visited.push(node.name!);
      return false;
    });

    expect(visited).toEqual(['root1', 'child1', 'child2', 'root2']);
  });

  it('stops early when callback returns true', () => {
    const visited: string[] = [];
    const nodes = [
      {
        name: 'a',
        canSelect: true,
        children: [{ name: 'b', canSelect: true }],
      },
      { name: 'c', canSelect: true },
    ];

    traverseTree(nodes, (node) => {
      visited.push(node.name!);
      return node.name === 'b';
    });

    expect(visited).toEqual(['a', 'b']);
  });

  it('handles empty tree', () => {
    const visited: string[] = [];
    traverseTree([], (node) => {
      visited.push(node.name!);
      return false;
    });

    expect(visited).toEqual([]);
  });

  it('passes parent to callback', () => {
    const parents: (string | null)[] = [];
    const nodes = [
      {
        name: 'root',
        canSelect: true,
        children: [{ name: 'child', canSelect: true }],
      },
    ];

    traverseTree(nodes, (node, parent) => {
      parents.push(parent?.name || null);
      return false;
    });

    expect(parents).toEqual([null, 'root']);
  });
});

describe('Tree', () => {
  it('renders a tree container div', () => {
    const props: TreeProps = { rootNodes: [] };
    const tree = new Tree({ props });

    tree._createRenderer();
    tree.render();

    const div = tree.shadow?.querySelector('div.tree');
    expect(div).not.toBeNull();
  });

  it('renders TreeNode for each root node', () => {
    const props: TreeProps = {
      rootNodes: [
        { name: 'node1', canSelect: true },
        { name: 'node2', canSelect: true },
      ],
    };
    const tree = new Tree({ props });

    tree._createRenderer();
    tree.render();

    const treeNodes = tree.shadow?.querySelectorAll('x-treenode');
    expect(treeNodes?.length).toBe(2);
  });
});

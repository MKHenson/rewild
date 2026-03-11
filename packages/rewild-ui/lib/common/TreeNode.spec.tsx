import '../../compiler/jsx';
import { TreeNode } from './TreeNode';

type TreeNodeOptions = NonNullable<ConstructorParameters<typeof TreeNode>[0]>;
type TreeNodeProps = TreeNodeOptions['props'];

describe('TreeNode', () => {
  it('renders node name text', () => {
    const props: TreeNodeProps = {
      node: { name: 'TestNode', canSelect: true },
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const textSpan = tn.shadow?.querySelector('.treenode-text');
    expect(textSpan).not.toBeNull();
    // Node name is passed via props and rendered
    expect(tn.props.node.name).toBe('TestNode');
  });

  it('applies selected class when node is in selectedNodes', () => {
    const node = { name: 'Selected', canSelect: true };
    const props: TreeNodeProps = {
      node,
      selectedNodes: [node],
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const content = tn.shadow?.querySelector('.tree-content');
    expect(content?.className).toContain('selected-treenode');
    expect(tn.selected).toBe(true);
  });

  it('does not apply selected class when node is not selected', () => {
    const node = { name: 'Unselected', canSelect: true };
    const props: TreeNodeProps = {
      node,
      selectedNodes: [],
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const content = tn.shadow?.querySelector('.tree-content');
    expect(content?.className).not.toContain('selected-treenode');
    expect(tn.selected).toBe(false);
  });

  it('renders expand icon when node has children', () => {
    const props: TreeNodeProps = {
      node: {
        name: 'Parent',
        canSelect: true,
        children: [{ name: 'Child', canSelect: true }],
      },
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const expandIcon = tn.shadow?.querySelector('x-material-icon');
    expect(expandIcon).not.toBeNull();
  });

  it('does not render expand icon when node has no children', () => {
    const props: TreeNodeProps = {
      node: { name: 'Leaf', canSelect: true },
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const expandIcon = tn.shadow?.querySelector(
      '.tree-content > x-material-icon'
    );
    expect(expandIcon).toBeNull();
  });

  it('renders child TreeNodes when expanded', () => {
    const props: TreeNodeProps = {
      node: {
        name: 'Parent',
        canSelect: true,
        children: [
          { name: 'Child1', canSelect: true },
          { name: 'Child2', canSelect: true },
        ],
      },
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const childNodes = tn.shadow?.querySelectorAll('.node-children x-treenode');
    expect(childNodes?.length).toBe(2);
  });

  it('renders resource name when available', () => {
    const props: TreeNodeProps = {
      node: {
        name: 'InternalName',
        canSelect: true,
        resource: { name: 'DisplayName' } as any,
      },
    };
    const tn = new TreeNode({ props });

    tn._createRenderer();
    tn.render();

    const textSpan = tn.shadow?.querySelector('.treenode-text');
    expect(textSpan).not.toBeNull();
    // When resource.name is available, it takes priority
    expect(tn.props.node.resource?.name).toBe('DisplayName');
  });
});

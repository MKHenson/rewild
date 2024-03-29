import { Component, register } from "../Component";
import { ITreeNode } from "models";
import { TreeNode } from "./TreeNode";

interface TreeProps {
  rootNodes: ITreeNode[];
  selectedNodes?: ITreeNode[];
  onSelectionChanged?: (nodes: ITreeNode[]) => void;
  onDrop?: (node: ITreeNode) => void;
}

export function traverseTree(rootNodes: ITreeNode[], onNode: (node: ITreeNode, parent: ITreeNode | null) => boolean) {
  function traverseNode(node: ITreeNode, parent: ITreeNode | null): boolean {
    const complete = onNode(node, parent);

    if (complete) return true;

    if (node.children) {
      for (const child of node.children) {
        if (traverseNode(child, node)) return true;
      }
    }

    return false;
  }

  for (const root of rootNodes) if (traverseNode(root, null)) return;
}

@register("x-tree")
export class Tree extends Component<TreeProps> {
  init() {
    return () => {
      const props = this.props;

      return (
        <div class="tree">
          {props.rootNodes.map((node) => (
            <TreeNode
              selectedNodes={props.selectedNodes}
              onSelectionChanged={props.onSelectionChanged}
              node={node}
              onDrop={this.props.onDrop}
            />
          ))}
        </div>
      );
    };
  }

  getSelectedNode(): TreeNode | null {
    const nodes = Array.from(this.shadow!.querySelectorAll("x-treenode")) as TreeNode[];
    let selectedNode: TreeNode | null;
    for (const node of nodes) {
      if (node.selected) return node;
      else {
        selectedNode = node.getSelectedNode();
        if (selectedNode) return selectedNode;
      }
    }

    return null;
  }

  getStyle() {
    return StyledTree;
  }
}

const StyledTree = cssStylesheet(css`
  div {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 1rem 0;
  }
`);

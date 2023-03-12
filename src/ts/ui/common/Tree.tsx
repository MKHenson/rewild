import { Typography } from "./Typography";
import { IconType, MaterialIcon, StyledMaterialIcon } from "./MaterialIcon";
import { Component, register } from "../Component";
import { theme } from "../theme";

export type ITreeNode<Resource extends any = any> = {
  name: string;
  icon?: IconType;
  iconSize?: "s" | "xs";
  canSelect?: boolean;
  canRename?: boolean;
  children: ITreeNode<Resource>[];
  resource?: Resource;
  id?: string;
};

interface TreeProps {
  rootNodes: ITreeNode[];
  selectedNodes: ITreeNode[];
  onSelectionChanged: (nodes: ITreeNode[]) => void;
}

interface NodeProps {
  node: ITreeNode;
  selectedNodes: ITreeNode[];
  onSelectionChanged: (nodes: ITreeNode[]) => void;
}

export function traverseTree(rootNodes: ITreeNode[], onNode: (node: ITreeNode) => void) {
  function traverseNode(node: ITreeNode) {
    onNode(node);

    if (node.children) {
      for (const child of node.children) traverseNode(child);
    }
  }

  for (const root of rootNodes) traverseNode(root);
}

@register("x-tree")
export class Tree extends Component<TreeProps> {
  init() {
    return () => {
      const props = this.props;

      return (
        <div class="tree">
          {props.rootNodes.map((node) => (
            <TreeNode selectedNodes={props.selectedNodes} onSelectionChanged={props.onSelectionChanged} node={node} />
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

  connectedCallback(): void {
    super.connectedCallback();
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

@register("x-treenode")
export class TreeNode extends Component<NodeProps> {
  selected: boolean = false;

  editName(): Promise<string> {
    return new Promise<string>((resolve) => {
      const node = this.shadow!.querySelector(".treenode-text") as HTMLElement;
      node.contentEditable = "true";
      node.classList.add("editting");
      node.focus();

      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const onDeactivate = (event: Event) => {
        if ((event as KeyboardEvent).key !== undefined && (event as KeyboardEvent).key !== "Enter") {
          return;
        }

        node.contentEditable = "false";
        node.classList.remove("editting");
        const newName = (node.textContent || "").trim();
        node.removeEventListener("blur", onDeactivate);
        node.removeEventListener("keydown", onDeactivate);
        resolve(newName);
      };

      node.addEventListener("blur", onDeactivate);
      node.addEventListener("keydown", onDeactivate);
    });
  }

  init() {
    this.selected = this.props.selectedNodes.includes(this.props.node);
    const [expanded, setExpanded] = this.useState(true);

    const handleExpandedClick = () => {
      setExpanded(!expanded());
    };

    const handleNodeClick = (e: MouseEvent) => {
      const props = this.props;
      if (!props.node.canSelect) return;

      const isSelected = props.selectedNodes.includes(props.node);
      if (e.shiftKey) {
        if (isSelected) props.onSelectionChanged(props.selectedNodes.filter((node) => node !== props.node));
        else props.onSelectionChanged(props.selectedNodes.concat(props.node));
      } else props.onSelectionChanged([props.node]);
    };

    return () => {
      const props = this.props;
      this.selected = props.selectedNodes.includes(props.node);

      return (
        <div class="treenode">
          <div class={"tree-content" + (this.selected ? " selected-treenode" : "")}>
            {props.node.children && props.node.children.length ? (
              expanded() ? (
                <MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_down" size="s" />
              ) : (
                <MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_up" size="s" />
              )
            ) : null}
            <Typography variant="body2" onClick={handleNodeClick}>
              {props.node.icon && (
                <span class="node-icon">
                  <StyledMaterialIcon icon={props.node.icon} size={props.node.iconSize || "s"} />
                </span>
              )}
              <span class="treenode-text">{props.node.name}</span>
            </Typography>
          </div>
          {expanded() ? (
            <div class="node-children">
              {props.node.children.map((node) => (
                <TreeNode
                  selectedNodes={props.selectedNodes}
                  onSelectionChanged={props.onSelectionChanged}
                  node={node}
                />
              ))}
            </div>
          ) : null}
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
    return StyledTreeNode;
  }
}

const StyledTreeNode = cssStylesheet(css`
  .tree-content {
    margin: 0 0 0 0.5rem;
    cursor: pointer;
    user-select: none;
  }
  .tree-content .node-icon {
    vertical-align: middle;
    margin: 0 4px 0 0;
  }
  .tree-content.selected-treenode x-typography {
    color: ${theme?.colors.primary400};
    font-weight: 500;
  }
  .tree-content .expand-icon {
    vertical-align: middle;
    margin: 0 4px 0 0;
  }
  .tree-content x-typography {
    display: inline-block;
  }

  .treenode-text {
    vertical-align: middle;
  }

  .node-children {
    margin: 0 0 0 0.5rem;
  }
`);

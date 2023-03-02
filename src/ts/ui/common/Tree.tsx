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
  id?: Resource | string;
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
  init() {
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

      return (
        <div class="treenode">
          <div class={"tree-content" + props.selectedNodes.includes(props.node) ? "selected-treenode" : ""}>
            {props.node.children && props.node.children.length ? (
              expanded() ? (
                <MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_down" size="s" />
              ) : (
                <MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_up" size="s" />
              )
            ) : (
              ""
            )}
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
          ) : (
            ""
          )}
        </div>
      );
    };
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
  .tree-content.selected-treenode {
    .body2 {
      color: ${theme?.colors.primary400};
      font-weight: 500;
    }
  }
  .tree-content .expand-icon {
    vertical-align: middle;
    margin: 0 4px 0 0;
  }
  .tree-content .body2 {
    display: inline-block;
  }

  .node-children {
    margin: 0 0 0 0.5rem;
  }
`);

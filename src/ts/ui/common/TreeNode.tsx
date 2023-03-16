import { Typography } from "./Typography";
import { MaterialIcon, StyledMaterialIcon } from "./MaterialIcon";
import { Component, register } from "../Component";
import { theme } from "../theme";
import { IDragDropAction, ITreeNode, ITreeNodeAction } from "models";
import { compelteDragDrop, curDragAction, startDragDrop } from "../utils/dragDrop";

interface NodeProps {
  node: ITreeNode;
  selectedNodes?: ITreeNode[];
  onSelectionChanged?: (nodes: ITreeNode[]) => void;
}

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
    this.selected = this.props.selectedNodes?.includes(this.props.node) || false;
    const [expanded, setExpanded] = this.useState(true);

    const onDragStart = (e: DragEvent) => {
      const props = this.props;

      const action = props.node.onDragStart!(props.node);
      startDragDrop<IDragDropAction>(e, action);
    };

    const handleExpandedClick = () => {
      setExpanded(!expanded());
    };

    const handleNodeClick = (e: MouseEvent) => {
      const props = this.props;
      if (!props.onSelectionChanged || !props.selectedNodes) return;
      if (!props.node.canSelect) return;

      const isSelected = props.selectedNodes.includes(props.node) || false;
      if (e.shiftKey) {
        if (isSelected) props.onSelectionChanged(props.selectedNodes.filter((node) => node !== props.node));
        else props.onSelectionChanged(props.selectedNodes.concat(props.node));
      } else props.onSelectionChanged([props.node]);
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const json = compelteDragDrop<ITreeNodeAction>(e);
      if (!json) return;

      if (!this.props.node.onDrop!(json, this.props.node)) return;
      this.props.node.children = this.props.node.children ? this.props.node.children.concat(json.node) : [json.node];
    };

    /** Allow drop */
    const onDragOverEvent = (e: DragEvent) => {
      if (!this.props.node.onDragOver!(curDragAction, this.props.node)) return;

      (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "true");
      e.preventDefault();
      e.stopPropagation();
    };

    return () => {
      const props = this.props;
      this.selected = props.selectedNodes?.includes(props.node) || false;

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
            <div
              class="treenode-drop-area"
              draggable
              ondragstart={props.node.onDragStart ? onDragStart : undefined}
              onclick={handleNodeClick}
              ondragover={props.node.onDragOver ? onDragOverEvent : undefined}
              ondragleave={onDragLeaveEvent}
              ondragend={onDragEndEvent}
              ondrop={props.node.onDrop ? onDrop : undefined}
            >
              <Typography variant="body2">
                {props.node.icon && (
                  <span class="node-icon">
                    <StyledMaterialIcon icon={props.node.icon} size={props.node.iconSize || "s"} />
                  </span>
                )}
                <span class="treenode-text">{props.node.resource?.target.name || props.node.name}</span>
              </Typography>
            </div>
          </div>
          {expanded() && props.node.children ? (
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

const onDragLeaveEvent = (e: DragEvent) => {
  (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
  e.preventDefault();
  e.stopPropagation();
};

const onDragEndEvent = (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

const StyledTreeNode = cssStylesheet(css`
  :host {
    display: block;
  }

  .treenode-drop-area {
    display: inline-block;
  }

  .treenode-drop-area[drop-active="true"] {
    background: #1e5ebf7f;
  }

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

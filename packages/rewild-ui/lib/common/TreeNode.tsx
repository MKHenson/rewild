import { Typography } from './Typography';
import { Icon, StyledIcon } from './Icon';
import { Component, register } from '../Component';
import { theme } from '../theme';
import {
  compelteDragDrop,
  curDragAction,
  startDragDrop,
} from '../utils/dragDrop';
import {
  IDragDropAction,
  ITreeNode,
  ITreeNodeAction,
} from '../../types/ui-types';

interface NodeProps {
  node: ITreeNode;
  selectedNodes?: ITreeNode[];
  /** Marked as the current/live node with an accent and a dot marker. */
  activeNode?: ITreeNode | null;
  /** Rendered muted. */
  dimmedNodes?: ITreeNode[];
  onSelectionChanged?: (nodes: ITreeNode[]) => void;
  onNodeDblClick?: (node: ITreeNode) => void;
  onDrop?: (node: ITreeNode) => void;
}

@register('x-treenode')
export class TreeNode extends Component<NodeProps> {
  selected: boolean = false;

  editName(): Promise<string> {
    return new Promise<string>((resolve) => {
      const node = this.shadow!.querySelector('.treenode-text') as HTMLElement;
      node.contentEditable = 'true';
      node.classList.add('editting');
      node.focus();

      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);

      const onDeactivate = (event: Event) => {
        if (
          (event as KeyboardEvent).key !== undefined &&
          (event as KeyboardEvent).key !== 'Enter'
        ) {
          return;
        }

        node.contentEditable = 'false';
        node.classList.remove('editting');
        const newName = (node.textContent || '').trim();
        node.removeEventListener('blur', onDeactivate);
        node.removeEventListener('keydown', onDeactivate);
        resolve(newName);
      };

      node.addEventListener('blur', onDeactivate);
      node.addEventListener('keydown', onDeactivate);
    });
  }

  init() {
    this.selected =
      this.props.selectedNodes?.includes(this.props.node) || false;
    const [expanded, setExpanded] = this.useState(
      this.props.node.expanded ?? true
    );

    const onDragStart = (e: DragEvent) => {
      const props = this.props;

      const action = props.node.onDragStart!(props.node);
      startDragDrop<IDragDropAction>(e, action);
    };

    // Written back to the node: this component is rebuilt whenever the owning
    // tree re-renders, so local state alone would be lost on the next click.
    const handleExpandedClick = () => {
      const next = !expanded();
      this.props.node.expanded = next;
      setExpanded(next);
    };

    const handleNodeClick = (e: MouseEvent) => {
      const props = this.props;
      if (!props.onSelectionChanged || !props.selectedNodes) return;
      if (!props.node.canSelect) return;

      const isSelected = props.selectedNodes.includes(props.node) || false;
      if (e.shiftKey) {
        if (isSelected)
          props.onSelectionChanged(
            props.selectedNodes.filter((node) => node !== props.node)
          );
        else props.onSelectionChanged(props.selectedNodes.concat(props.node));
      } else props.onSelectionChanged([props.node]);
    };

    const handleNodeDblClick = (e: MouseEvent) => {
      const props = this.props;
      if (props.onNodeDblClick) props.onNodeDblClick(props.node);
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const json = compelteDragDrop<ITreeNodeAction>(e);
      if (!json) return;

      if (!this.props.node.onDrop!(json, this.props.node)) return;

      json.node.parent = this.props.node;
      this.props.node.children = this.props.node.children
        ? this.props.node.children.concat(json.node)
        : [json.node];

      this.props.onDrop?.(this.props.node);
    };

    /** Allow drop */
    const onDragOverEvent = (e: DragEvent) => {
      if (!this.props.node.onDragOver!(curDragAction, this.props.node)) return;

      (e.currentTarget as HTMLDivElement).setAttribute('drop-active', 'true');
      e.preventDefault();
      e.stopPropagation();
    };

    return () => {
      const props = this.props;
      this.selected = props.selectedNodes?.includes(props.node) || false;
      const active = !!props.activeNode && props.activeNode === props.node;
      const dimmed = props.dimmedNodes?.includes(props.node) || false;

      return (
        <div class="treenode">
          <div
            class={
              'tree-content' +
              (this.selected ? ' selected-treenode' : '') +
              (active ? ' active-treenode' : '') +
              (dimmed ? ' dimmed-treenode' : '')
            }>
            {props.node.children && props.node.children.length ? (
              expanded() ? (
                <Icon
                  class="expand-icon"
                  onClick={handleExpandedClick}
                  icon="chevron-down"
                  size="s"
                />
              ) : (
                <Icon
                  class="expand-icon"
                  onClick={handleExpandedClick}
                  icon="chevron-right"
                  size="s"
                />
              )
            ) : null}
            <div
              class="treenode-drop-area"
              draggable
              ondragstart={props.node.onDragStart ? onDragStart : undefined}
              onclick={handleNodeClick}
              ondblclick={handleNodeDblClick}
              ondragover={props.node.onDragOver ? onDragOverEvent : undefined}
              ondragleave={onDragLeaveEvent}
              ondragend={onDragEndEvent}
              ondrop={props.node.onDrop ? onDrop : undefined}>
              <Typography variant="body2">
                {active && (
                  <span class="active-marker">
                    <Icon icon="circle-dot" size="xs" />
                  </span>
                )}
                {props.node.icon && (
                  <span class="node-icon">
                    <StyledIcon
                      icon={props.node.icon}
                      size={props.node.iconSize || 's'}
                    />
                  </span>
                )}
                <span class="treenode-text">
                  {props.node.resource?.name || props.node.name}
                </span>
              </Typography>
            </div>
          </div>
          {expanded() && props.node.children ? (
            <div class="node-children">
              {props.node.children.map((node) => (
                <TreeNode
                  selectedNodes={props.selectedNodes}
                  activeNode={props.activeNode}
                  dimmedNodes={props.dimmedNodes}
                  onSelectionChanged={props.onSelectionChanged}
                  onNodeDblClick={props.onNodeDblClick}
                  node={node}
                  onDrop={this.props.onDrop}
                />
              ))}
            </div>
          ) : null}
        </div>
      );
    };
  }

  getSelectedNode(): TreeNode | null {
    const nodes = Array.from(
      this.shadow!.querySelectorAll('x-treenode')
    ) as TreeNode[];
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
  (e.currentTarget as HTMLDivElement).setAttribute('drop-active', '');
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

  .treenode-drop-area[drop-active='true'] {
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
  .tree-content.active-treenode .treenode-drop-area {
    background: ${theme?.colors.subtle500};
    border-radius: 3px;
    padding: 0 6px 0 4px;
  }
  .tree-content.active-treenode x-typography {
    font-weight: 600;
  }
  .tree-content.active-treenode .active-marker {
    color: ${theme?.colors.secondary400};
    vertical-align: middle;
    margin: 0 4px 0 0;
  }
  .tree-content.dimmed-treenode {
    opacity: 0.5;
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

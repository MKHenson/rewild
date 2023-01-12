import { IDragData, ITreeNode } from "models";
import { styled } from "solid-styled-components";
import { createSignal, For, ParentComponent, Show } from "solid-js";
import { Typography } from "./Typography";
import { MaterialIcon, StyledMaterialIcon } from "./MaterialIcon";
import { getDragData, getDraggedData, setDragData } from "../application/project-editor/hooks/useGlobalDragDrop";

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

export interface NodeDragData extends IDragData {
  type: "treenode";
  data: any;
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

export const Tree: ParentComponent<TreeProps> = (props) => {
  return (
    <StyledTree class="tree">
      <For each={props.rootNodes}>
        {(node) => (
          <TreeNode selectedNodes={props.selectedNodes} onSelectionChanged={props.onSelectionChanged} node={node} />
        )}
      </For>
    </StyledTree>
  );
};

export const TreeNode: ParentComponent<NodeProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  const handleExpandedClick = () => {
    setExpanded(!expanded());
  };

  const handleNodeClick = (e: MouseEvent) => {
    if (!props.node.canSelect) return;

    const isSelected = props.selectedNodes.includes(props.node);
    if (e.shiftKey) {
      if (isSelected) props.onSelectionChanged(props.selectedNodes.filter((node) => node !== props.node));
      else props.onSelectionChanged(props.selectedNodes.concat(props.node));
    } else props.onSelectionChanged([props.node]);
  };

  const handleDragStart = (e: DragEvent) => {
    if (props.node.onDragStart) {
      const data = props.node.onDragStart(props.node) as NodeDragData;
      setDragData(e, data);
    }
  };

  const handleDragEnd = (e: DragEvent) => {
    e.dataTransfer?.clearData();
  };

  const handleDragOver = (e: DragEvent) => {
    const data = getDraggedData<NodeDragData>();
    if (data && props.node.onDragOver?.(data, props.node)) {
      (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "true");
      e.preventDefault();
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
  };

  const handleDrop = (e: DragEvent) => {
    const data = getDragData(e) as NodeDragData;
    if (!data) return;
    props.node.onDrop?.(data, props.node);
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
  };

  return (
    <StyledTreenode class="treenode">
      <StyledTreenodeContent class={props.selectedNodes.includes(props.node) ? "selected-treenode" : ""}>
        <Show when={props.node.children && props.node.children.length}>
          <Show
            when={expanded()}
            fallback={<MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_up" size="s" />}
          >
            <MaterialIcon class="expand-icon" onClick={handleExpandedClick} icon="arrow_drop_down" size="s" />
          </Show>
        </Show>
        <Typography
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          variant="body2"
          onClick={handleNodeClick}
        >
          {props.node.icon && (
            <span class="node-icon">
              <StyledMaterialIcon icon={props.node.icon} size={props.node.iconSize || "s"} />
            </span>
          )}
          <span class="treenode-text">{props.node.name}</span>
        </Typography>
      </StyledTreenodeContent>
      <Show when={expanded()}>
        <StyledTreenodeChildren>
          <For each={props.node.children}>
            {(node) => (
              <TreeNode selectedNodes={props.selectedNodes} onSelectionChanged={props.onSelectionChanged} node={node} />
            )}
          </For>
        </StyledTreenodeChildren>
      </Show>
    </StyledTreenode>
  );
};

const StyledTree = styled.div`
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  padding: 1rem 0;
`;

const StyledTreenode = styled.div`
  display: block;
`;

const StyledTreenodeContent = styled.div`
  margin: 0 0 0 0.5rem;
  cursor: pointer;
  user-select: none;

  *[drop-active="true"] {
    background: ${(e) => e.theme?.colors.primary400};
    color: ${(e) => e.theme?.colors.onPrimary400};

    .icon {
      color: ${(e) => e.theme?.colors.onPrimary400} !important;
    }
  }

  .node-icon {
    vertical-align: middle;
    margin: 0 4px 0 0;
  }

  &.selected-treenode {
    .body2 {
      color: ${(e) => e.theme?.colors.primary400};
      font-weight: 500;
    }
  }

  .expand-icon {
    vertical-align: middle;
    margin: 0 4px 0 0;
  }

  .body2 {
    display: inline-block;
  }
`;

const StyledTreenodeChildren = styled.div`
  margin: 0 0 0 0.5rem;
`;

import { styled } from "solid-styled-components";
import { createSignal, For, ParentComponent, Show } from "solid-js";
import { Typography } from "./Typography";
import { MaterialIcon } from "./MaterialIcon";

export type ITreeNode<Resource extends any = any> = {
  name: string;
  children: ITreeNode<Resource>[];
  resource: Resource;
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
    const isSelected = props.selectedNodes.includes(props.node);
    if (e.shiftKey) {
      if (isSelected) props.onSelectionChanged(props.selectedNodes.filter((node) => node !== props.node));
      else props.onSelectionChanged(props.selectedNodes.concat(props.node));
    } else props.onSelectionChanged([props.node]);
  };

  return (
    <StyledTreenode class="treenode">
      <StyledTreenodeContent class={props.selectedNodes.includes(props.node) ? "selected" : ""}>
        <Show when={props.node.children && props.node.children.length}>
          <Show when={expanded()} fallback={<MaterialIcon onClick={handleExpandedClick} icon="add" size="s" />}>
            <MaterialIcon onClick={handleExpandedClick} icon="remove" size="s" />
          </Show>
        </Show>
        <Typography variant="body2" onClick={handleNodeClick}>
          {props.node.name}
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

  &.selected {
    .body2 {
      color: ${(e) => e.theme?.colors.primary400};
      font-weight: 500;
    }
  }

  .icon {
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

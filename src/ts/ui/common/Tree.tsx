import { styled } from "solid-styled-components";
import { createSignal, For, ParentComponent, Show } from "solid-js";
import { Typography } from "./Typography";
import { MaterialIcon } from "./MaterialIcon";

export type ITreeNode = {
  name: string;
  children: ITreeNode[];
};

interface TreeProps {
  rootNodes: ITreeNode[];
}

interface NodeProps {
  node: ITreeNode;
}

export const Tree: ParentComponent<TreeProps> = (props) => {
  return (
    <StyledTree class="tree">
      <For each={props.rootNodes}>{(node) => <TreeNode node={node} />}</For>
    </StyledTree>
  );
};

export const TreeNode: ParentComponent<NodeProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const handleExpandedClick = () => {
    setExpanded(!expanded());
  };

  return (
    <StyledTreenode class="treenode">
      <StyledTreenodeContent>
        <Show when={expanded()} fallback={<MaterialIcon onClick={handleExpandedClick} icon="cancel" />}>
          <MaterialIcon onClick={handleExpandedClick} icon="add" />
        </Show>
        <Typography variant="label">{props.node.name}</Typography>
      </StyledTreenodeContent>
      <Show when={expanded()}>
        <StyledTreenodeChildren>
          <For each={props.node.children}>{(node) => <TreeNode node={node} />}</For>
        </StyledTreenodeChildren>
      </Show>
    </StyledTreenode>
  );
};

const StyledTree = styled.div`
  width: 100%;
  height: 100%;
  overflow: auto;
`;

const StyledTreenode = styled.div`
  display: inline-block;
`;

const StyledTreenodeContent = styled.div`
  margin: 0 0 0 0.5rem;
`;

const StyledTreenodeChildren = styled.div`
  margin: 0 0 0 0.5rem;
`;

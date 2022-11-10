import { Component, createEffect, createSignal, onMount, onCleanup, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { IResource, IProject, IContainer } from "models";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Loading } from "../../../common/Loading";
import { ITreeNode, Tree } from "../../../common/Tree";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";

interface Props {
  project?: IProject;
  onChange: (val: IProject) => void;
}

export const SceneGraph: Component<Props> = (props) => {
  const [selectedNodes, setSelectedNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const [nodes, setNodes] = createSignal<ITreeNode<IResource>[]>([]);
  let activeNode: HTMLDivElement | null = null;

  createEffect(() => {
    if (props.project)
      setNodes([
        {
          name: "Containers",
          canSelect: false,
          icon: <StyledMaterialIcon icon="group_work" size="s" />,
          children: props.project.containers.map(
            (container) =>
              ({
                name: container.name,
                icon: <StyledMaterialIcon icon="label" size="xs" />,
                canSelect: true,
                resource: container,
                canRename: true,
              } as ITreeNode)
          ),
        },
      ]);
  });

  onMount(() => {
    document.addEventListener("keydown", onKeyUp);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", onKeyUp);
    handleNodeDeactivate();
  });

  const handleNodeDeactivate = () => {
    if (!activeNode) return;

    activeNode.removeEventListener("blur", handleNodeDeactivate);
    activeNode.contentEditable = "false";
    activeNode.classList.remove("editting");
    const selected = selectedNodes();
    const newName = (activeNode.textContent || "").trim() || (selected[0].resource as IContainer).name;

    props.onChange({
      ...props.project!,
      containers: props.project!.containers.map((c) =>
        c === selected[0].resource ? { ...(selected[0].resource as IContainer), name: newName } : c
      ),
    });
  };

  const activateNodeEdit = (node: HTMLDivElement) => {
    node.contentEditable = "true";
    node.classList.add("editting");
    node.focus();
    activeNode = node;

    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    node.addEventListener("blur", handleNodeDeactivate);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const node = document.querySelector(".selected-treenode .treenode-text") as HTMLDivElement;
    if (e.key === "F2" && selectedNodes().length === 1 && selectedNodes()[0].canRename && node) {
      activateNodeEdit(node);
    } else if (activeNode && e.key === "Enter") {
      handleNodeDeactivate();
    }
  };

  const onContainerAdd = () => {
    const newContainer = {
      name: `New Container ${props.project?.containers.length || ""}`,
      activeOnStartup: true,
    } as IContainer;

    props.onChange({
      ...props.project!,
      containers: props.project!.containers.concat(newContainer),
    });
  };

  const onContainerRemove = () => {
    props.onChange({
      ...props.project!,
      containers: props.project!.containers.filter((c) => !selectedNodes().find((selected) => selected.resource === c)),
    });
    setSelectedNodes([]);
  };

  const onSelectionChanged = (val: ITreeNode[]) => {
    setSelectedNodes(val);
  };

  return (
    <Card>
      <StyleSceneGraph>
        <div class="header">
          <Typography variant="h3">Scene</Typography>
        </div>
        <div class="nodes">
          <Show when={props.project} fallback={<Loading />}>
            <Tree onSelectionChanged={onSelectionChanged} selectedNodes={selectedNodes()} rootNodes={nodes()} />
          </Show>
        </div>
        <div class="graph-actions">
          <ButtonGroup>
            <Button variant="text" onClick={onContainerAdd}>
              <StyledMaterialIcon icon="add_circle" size="s" />
            </Button>
            <Button variant="text" onClick={onContainerRemove}>
              <StyledMaterialIcon icon="delete" size="s" />
            </Button>
          </ButtonGroup>
        </div>
      </StyleSceneGraph>
    </Card>
  );
};

const StyleSceneGraph = styled.div`
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: 20px 1fr 30px;

  .graph-actions button {
    color: ${(e) => e.theme?.colors.onSubtle};
    padding: 0.5rem;
  }

  .nodes {
    max-height: 100%;
    overflow: hidden;
  }

  .selected-treenode .treenode-text.editting {
    border: 1px dashed grey;
    outline: none;
    padding: 2px 4px;
  }
`;

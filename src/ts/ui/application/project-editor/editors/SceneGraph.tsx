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
import { useEditor } from "../EditorProvider";
import { produce } from "solid-js/store";
import { createContainer } from "../factories/containerFactory";

interface Props {}

function buildTree(project: IProject) {
  return [
    {
      name: "Containers",
      canSelect: false,
      icon: "group_work",
      children: project.containers.map(
        (container) =>
          ({
            name: container.name,
            icon: "label",
            iconSize: "xs",
            canSelect: true,
            resource: container,
            canRename: true,
          } as ITreeNode)
      ),
    } as ITreeNode,
  ];
}

export const SceneGraph: Component<Props> = (props) => {
  const [selectedNodes, setSelectedNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const [nodes, setNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const { setResource, setProjectStore, project } = useEditor();

  let activeNode: HTMLDivElement | null = null;

  createEffect(() => {
    if (project) setNodes(buildTree(project as IProject));
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
    const selectedResource = selected[0].resource;

    const oldName = (selectedResource as IContainer).name;
    const newName = (activeNode.textContent || "").trim() || oldName;

    if (newName === oldName) {
      activeNode.innerText = oldName;
      activeNode = null;
      return;
    }

    activeNode = null;

    setProjectStore(
      produce((state) => {
        const resource = state.containers!.find((c) => c.id === selectedResource!.id);
        if (!resource) return;
        resource.name = newName;
      })
    );
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
    const newContainer = createContainer();
    setProjectStore("containers", (c) => [...c!, newContainer]);
  };

  const onContainerRemove = () => {
    setProjectStore("containers", (c) =>
      c!.filter((c) => !selectedNodes().find((selected) => selected.resource === c))
    );
    setSelectedNodes([]);
  };

  const onSelectionChanged = (val: ITreeNode[]) => {
    setSelectedNodes(val);

    if (val.length === 1 && val[0].resource) setResource(val[0].resource!);
    else setResource(null);
  };

  return (
    <Card>
      <StyleSceneGraph>
        <div class="header">
          <Typography variant="h3">Scene</Typography>
        </div>
        <div class="nodes">
          <Show when={project} fallback={<Loading />}>
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

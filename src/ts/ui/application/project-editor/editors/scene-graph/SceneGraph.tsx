import { Component, createEffect, createSignal, onMount, onCleanup, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { produce } from "solid-js/store";
import { IResource, IProject, IContainer, IActor, IDragData, ITreeNode } from "models";
import { Card } from "../../../../common/Card";
import { Typography } from "../../../../common/Typography";
import { Loading } from "../../../../common/Loading";
import { Tree, traverseTree, NodeDragData } from "../../../../common/Tree";
import { Button } from "../../../../common/Button";
import { ButtonGroup } from "../../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../../common/MaterialIcon";
import { useEditor } from "../../EditorProvider";
import { SceneGraphFactory } from "./SceneGraphFactory";

interface Props {}

const factory = new SceneGraphFactory();

export type NodeDroppedDelegate = (data: IDragData, node: ITreeNode) => void;

// Keep track of prev nodes so we can match it if nodes
// added and tree is rebuilt
let selectedNodesCache: ITreeNode<IResource>[] = [];

export const SceneGraph: Component<Props> = (props) => {
  const [selectedNodes, setSelectedNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const [nodes, setNodes] = createSignal<ITreeNode<IResource>[]>([]);
  const { selectedResource, setResource, setProject, project } = useEditor();

  let activeNode: HTMLDivElement | null = null;

  createEffect(() => {
    if (project) {
      const newNodes = factory.buildTree(project as IProject, onNodeDropped);
      const prevNodesCache = selectedNodesCache;
      let prevNode: ITreeNode | undefined = undefined;
      const newSelection: ITreeNode[] = [];
      traverseTree(newNodes, (node) => {
        prevNode = prevNodesCache.find((prevNode) => prevNode.id === node.id);
        if (prevNode) {
          newSelection.push(node);
        }
      });
      setNodes(newNodes);
      setSelectedNodes(newSelection);
    }
  });

  const setSelection = (val: ITreeNode<IResource>[]) => {
    selectedNodesCache = val;
    setSelectedNodes(val);
  };

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

    setProject(
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

  const onNodeDropped: NodeDroppedDelegate = (data, node) => {
    const castNode = node as ITreeNode<IResource>;

    if (castNode.resource?.type === "container")
      setProject("containers", (c) =>
        c?.map((container) => {
          if (castNode.resource?.id === container.id) {
            return { ...container, actors: container.actors.concat((data as NodeDragData).data as IActor) };
          }
          return container;
        })
      );
  };

  const onAdd = () => {
    const selectedNode = selectedNodes()[0];
    const childNode = factory.createChildNode(selectedNode);
    if (!childNode) return;
    if (selectedNode?.id === "CONTAINERS") setProject("sceneGraph", "containers", (c) => [...c, childNode]);
  };

  const onDelete = () => {
    const selected = selectedResource();
    if (!selected) return;

    if (selected.id === "CONTAINERS") {
      setProject("containers", (c) =>
        c!.filter((c) => !selectedNodes().find((selected) => selected.resource?.id === c.id))
      );
    }
    setSelection([]);
  };

  const onSelectionChanged = (val: ITreeNode[]) => {
    setSelection(val);

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
            <Button
              disabled={selectedNodes().length > 0 && !factory.canCreateNode(selectedNodes()[0])}
              variant="text"
              onClick={onAdd}
            >
              <StyledMaterialIcon icon="add_circle" size="s" />
            </Button>
            <Button
              disabled={selectedNodes().length > 0 && !factory.canDeleteNode(selectedNodes()[0])}
              variant="text"
              onClick={onDelete}
            >
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

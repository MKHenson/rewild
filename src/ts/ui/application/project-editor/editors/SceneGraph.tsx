import { IResource, IProject, IContainer } from "models";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Component, register } from "../../../Component";
import { ITreeNode, Tree, traverseTree } from "../../../common/Tree";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";
import { SceneGraphFactory } from "./SceneGraphFactory";
import { theme } from "../../../theme";
import { projectStore } from "../../../stores/Project";

interface Props {}

const factory = new SceneGraphFactory();

// Keep track of prev nodes so we can match it if nodes
// added and tree is rebuilt
let selectedNodesCache: ITreeNode<IResource>[] = [];

@register("x-scene-graph")
export class SceneGraph extends Component<Props> {
  keyUpDelegate: (e: KeyboardEvent) => void;
  nodeDeactivatedDelegate: () => void;

  init() {
    const [selectedNodes, setSelectedNodes] = this.useState<ITreeNode<IResource>[]>([]);
    const [nodes, setNodes] = this.useState<ITreeNode<IResource>[]>([]);

    const projectStoreProxy = this.observeStore(projectStore, (prop, prevVal, value) => {
      const newNodes = factory.buildTree(project as IProject);
      const prevNodesCache = selectedNodesCache;
      let prevNode: ITreeNode | undefined = undefined;
      const newSelection: ITreeNode[] = [];
      traverseTree(newNodes, (node) => {
        prevNode = prevNodesCache.find((prevNode) => prevNode.id === node.id);
        if (prevNode) {
          newSelection.push(node);
        }
      });
      setNodes(newNodes, false);
      setSelectedNodes(newSelection, false);
      this.render();
    });

    const project = projectStoreProxy.project!;
    const selectedResource = projectStoreProxy.selectedResource;

    let activeNode: HTMLDivElement | null = null;

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

      node.addEventListener("blur", this.nodeDeactivatedDelegate);
    };

    this.keyUpDelegate = (e: KeyboardEvent) => {
      const node = document.querySelector(".selected-treenode .treenode-text") as HTMLDivElement;
      if (e.key === "F2" && selectedNodes().length === 1 && selectedNodes()[0].canRename && node) {
        activateNodeEdit(node);
      } else if (activeNode && e.key === "Enter") {
        this.nodeDeactivatedDelegate();
      }
    };

    const setSelection = (val: ITreeNode<IResource>[]) => {
      selectedNodesCache = val;
      setSelectedNodes(val);
    };

    this.nodeDeactivatedDelegate = () => {
      if (!activeNode) return;

      activeNode.removeEventListener("blur", this.nodeDeactivatedDelegate);
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

      const resource = project!.containers!.find((c) => c.id === selectedResource!.id);
      if (!resource) return;
      resource.name = newName;
    };

    const onAdd = () => {
      const newResource = factory.createChildNode(selectedNodes()[0]);
      if (newResource?.type === "container")
        project!.containers = project!.containers!.concat(newResource as IContainer);
    };

    const onDelete = () => {
      if (selectedResource!.type === "container") {
        project!.containers = project!.containers.filter(
          (c) => !selectedNodes().find((selected) => selected.resource?.id === c.id)
        );
      }
      setSelection([]);
    };

    const onSelectionChanged = (val: ITreeNode[]) => {
      setSelection(val);

      if (val.length === 1 && val[0].resource) projectStoreProxy.selectedResource = val[0].resource!;
      else projectStoreProxy.selectedResource = null;
    };

    return () => (
      <Card stretched>
        <div class="content">
          <div class="header">
            <Typography variant="h3">Scene</Typography>
          </div>
          <div class="nodes">
            <Tree onSelectionChanged={onSelectionChanged} selectedNodes={selectedNodes()} rootNodes={nodes()} />
          </div>
          <div class="graph-actions">
            <ButtonGroup>
              <Button
                disabled={selectedNodes().length == 0 || !factory.canCreateNode(selectedNodes()[0])}
                variant="text"
                onClick={onAdd}
              >
                <StyledMaterialIcon icon="add_circle" size="s" />
              </Button>
              <Button
                disabled={selectedNodes().length == 0 || !factory.canDeleteNode(selectedNodes()[0])}
                variant="text"
                onClick={onDelete}
              >
                <StyledMaterialIcon icon="delete" size="s" />
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </Card>
    );
  }

  getStyle() {
    return StyleSceneGraph;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.keyUpDelegate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.keyUpDelegate);
    this.nodeDeactivatedDelegate();
  }
}

const StyleSceneGraph = cssStylesheet(css`
  .content {
    display: grid;
    height: 100%;
    width: 100%;
    grid-template-rows: 20px 1fr 30px;
  }

  .graph-actions button {
    color: ${theme.colors.onSubtle};
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
`);

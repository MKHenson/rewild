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

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      const node = tree.getSelectedNode();
      if (e.key === "F2" && selectedNodes().length === 1 && selectedNodes()[0].canRename && node) {
        const newName = await node.editName();
        projectStoreProxy.selectedResource!.name = newName;
      }
    };

    const setSelection = (val: ITreeNode<IResource>[]) => {
      selectedNodesCache = val;
      setSelectedNodes(val);
    };

    const onAdd = () => {
      const newResource = factory.createChildNode(selectedNodes()[0]);
      if (newResource?.type === "container")
        project!.containers = project!.containers!.concat(newResource as IContainer);

      projectStoreProxy.dirty = true;
    };

    const onDelete = () => {
      if (projectStoreProxy.selectedResource!.type === "container") {
        project!.containers = project!.containers.filter(
          (c) => !selectedNodes().find((selected) => selected.resource?.id === c.id)
        );

        projectStoreProxy.dirty = true;
      }
      setSelection([]);
    };

    const onSelectionChanged = (val: ITreeNode[]) => {
      setSelection(val);

      if (val.length === 1 && val[0].resource) projectStoreProxy.selectedResource = val[0].resource!;
      else projectStoreProxy.selectedResource = null;
    };

    let tree: Tree;

    return () => {
      tree = (
        <Tree onSelectionChanged={onSelectionChanged} selectedNodes={selectedNodes()} rootNodes={nodes()} />
      ) as Tree;

      return (
        <Card stretched>
          <div class="content">
            <div class="header">
              <Typography variant="h3">Scene</Typography>
            </div>
            <div class="nodes">{tree}</div>
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
    };
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

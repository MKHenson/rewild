import { ITreeNode, ITemplateTreeNode } from "models";
import { Card } from "../../../common/Card";
import { Typography } from "../../../common/Typography";
import { Component, register } from "../../../Component";
import { Tree } from "../../../common/Tree";
import { Button } from "../../../common/Button";
import { ButtonGroup } from "../../../common/ButtonGroup";
import { StyledMaterialIcon } from "../../../common/MaterialIcon";
import { theme } from "../../../theme";
import { sceneGraphStore } from "../../../stores/SceneGraphStore";
import { projectStore } from "../../../stores/Project";

interface Props {}

@register("x-scene-graph")
export class SceneGraph extends Component<Props> {
  keyUpDelegate: (e: KeyboardEvent) => void;

  init() {
    const [selectedNodes, setSelectedNodes] = this.useState<ITreeNode[]>([]);

    const sceneGraphStoreProxy = this.observeStore(sceneGraphStore);
    const projectStoreProxy = this.observeStore(projectStore);

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      const node = tree.getSelectedNode();
      if (e.key === "F2" && selectedNodes().length === 1 && selectedNodes()[0].canRename && node) {
        const newName = await node.editName();
        projectStoreProxy.selectedResource!.name = newName;
      }
    };

    const setSelection = (val: ITreeNode[]) => {
      setSelectedNodes(val);
    };

    const onAdd = () => {
      sceneGraphStore.createChildNode(selectedNodes()[0] as ITemplateTreeNode);
      this.render();
    };

    const onDelete = () => {
      sceneGraphStore.removeNode(selectedNodes()[0]);
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
        <Tree
          onSelectionChanged={onSelectionChanged}
          selectedNodes={selectedNodes()}
          rootNodes={sceneGraphStoreProxy.nodes}
        />
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
                  disabled={selectedNodes().length == 0 || !(selectedNodes()[0] as ITemplateTreeNode).template}
                  variant="text"
                  onClick={onAdd}
                >
                  <StyledMaterialIcon icon="add_circle" size="s" />
                </Button>
                <Button
                  disabled={selectedNodes().length == 0 || !selectedNodes()[0].resource}
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

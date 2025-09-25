import { IResource, ITemplateTreeNode } from 'models';
import {
  theme,
  StyledMaterialIcon,
  ButtonGroup,
  Button,
  Tree,
  Component,
  register,
  Typography,
  Card,
  ITreeNode,
} from 'rewild-ui';
import { sceneGraphStore } from '../../../stores/SceneGraphStore';
import { projectStore } from '../../../stores/ProjectStore';

interface Props {}

@register('x-scene-graph')
export class SceneGraph extends Component<Props> {
  keyUpDelegate: (e: KeyboardEvent) => void;

  init() {
    const [selectedNodes, setSelectedNodes] = this.useState<
      ITreeNode<IResource>[]
    >([]);

    const sceneGraphStoreProxy = this.observeStore(sceneGraphStore);
    const projectStoreProxy = this.observeStore(projectStore);

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      const node = tree.getSelectedNode();
      if (
        e.key === 'F2' &&
        selectedNodes().length === 1 &&
        selectedNodes()[0].canRename &&
        node
      ) {
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

      if (val.length === 1 && val[0].resource)
        projectStoreProxy.selectedResource = val[0].resource!;
      else projectStoreProxy.selectedResource = null;
    };

    const onDrop = (val: ITreeNode) => {
      projectStoreProxy.dirty = true;
    };

    this.onMount = () => {
      document.addEventListener('keydown', this.keyUpDelegate);
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', this.keyUpDelegate);
    };

    let tree: Tree;

    let html = (
      <Card stretched>
        <div class="content">
          <div class="header">
            <Typography variant="h3">Scene</Typography>
          </div>
          <div class="nodes"></div>
          <div class="graph-actions">
            <ButtonGroup>
              <Button
                disabled={
                  selectedNodes().length == 0 ||
                  !(selectedNodes()[0] as ITemplateTreeNode).template
                }
                variant="text"
                id="add-scene-node"
                onClick={onAdd}>
                <StyledMaterialIcon icon="add_circle" size="s" />
              </Button>
              <Button
                disabled={
                  selectedNodes().length == 0 || !selectedNodes()[0].resource
                }
                variant="text"
                id="delete-scene-node"
                onClick={onDelete}>
                <StyledMaterialIcon icon="delete" size="s" />
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </Card>
    );

    return () => {
      tree = (
        <Tree
          onSelectionChanged={onSelectionChanged}
          selectedNodes={selectedNodes()}
          onDrop={onDrop}
          rootNodes={sceneGraphStoreProxy.nodes}
        />
      ) as Tree;

      html.querySelector('.nodes')!.replaceChildren(tree);
      const addSceneBtn = html.querySelector('#add-scene-node') as Button;
      const deleteSceneBtn = html.querySelector('#delete-scene-node') as Button;

      if (addSceneBtn)
        addSceneBtn.disabled =
          selectedNodes().length == 0 ||
          !(selectedNodes()[0] as ITemplateTreeNode).template;

      if (deleteSceneBtn)
        deleteSceneBtn.disabled =
          selectedNodes().length == 0 || !selectedNodes()[0].resource;

      return html;
    };
  }

  getStyle() {
    return StyleSceneGraph;
  }
}

const StyleSceneGraph = cssStylesheet(css`
  .content {
    display: grid;
    height: 100%;
    width: 100%;
    grid-template-rows: 26px 1fr 30px;
  }

  .graph-actions button {
    color: ${theme.colors.onSubtle};
    padding: 0.5rem;
  }
  .nodes {
    max-height: 100%;
    overflow: hidden;
  }
`);

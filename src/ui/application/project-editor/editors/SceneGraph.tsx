import { IResource, ITemplateTreeNode } from 'models';
import {
  theme,
  StyledMaterialIcon,
  ButtonGroup,
  Button,
  Tree,
  Component,
  register,
  Card,
  ITreeNode,
} from 'rewild-ui';
import {
  SceneGraphEvents,
  sceneGraphStore,
} from '../../../stores/SceneGraphStore';
import { projectStore } from '../../../stores/ProjectStore';
import { Subscriber } from 'rewild-common';

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

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = (event) => {
      if (event.kind === 'nodes-updated') {
        this.render();
      }
    };

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      const node = tree.getSelectedNode();
      if (
        e.key === 'F2' &&
        selectedNodes().length === 1 &&
        selectedNodes()[0].canRename &&
        node
      ) {
        const newName = await node.editName();
        sceneGraphStoreProxy.selectedResource!.name = newName;
      }
    };

    const setSelection = (val: ITreeNode[]) => {
      setSelectedNodes(val);
    };

    const onAdd = () => {
      sceneGraphStore.createChildNode(selectedNodes()[0] as ITemplateTreeNode);
    };

    const onDelete = () => {
      sceneGraphStore.removeNode(selectedNodes()[0]);
      setSelection([]);
    };

    const onSelectionChanged = (val: ITreeNode<IResource>[]) => {
      setSelection(val);

      if (val.length === 1 && val[0].resource)
        sceneGraphStoreProxy.selectedResource = val[0].resource!;
      else sceneGraphStoreProxy.selectedResource = null;
    };

    const handleNodeDblClick = (node: ITreeNode<IResource>) => {
      if (node === goBackTreeNode)
        sceneGraphStoreProxy.selectedContainerId = null;
      else if (node.resource && node.resource.type === 'container') {
        sceneGraphStoreProxy.selectedContainerId = node.resource.id;

        if (!projectStore.containerPods[node.resource.id])
          projectStore.containerPods[node.resource.id] = {
            asset3D: [],
          };
      }
    };

    const onDrop = (val: ITreeNode<IResource>) => {
      projectStoreProxy.dirty = true;
    };

    this.onMount = () => {
      document.addEventListener('keydown', this.keyUpDelegate);
      sceneGraphStore.dispatcher.add(onSceneGraphEvent);
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', this.keyUpDelegate);
      sceneGraphStore.dispatcher.remove(onSceneGraphEvent);
    };

    let tree: Tree;
    const goBackTreeNode: ITreeNode = {
      canRename: false,
      canSelect: false,
      icon: 'chevron_left',
      name: '..',
    };

    let html = (
      <Card stretched css={CardCss}>
        <div class="content">
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
          css={TreeCss}
          onSelectionChanged={onSelectionChanged}
          onNodeDblClick={handleNodeDblClick}
          selectedNodes={selectedNodes()}
          onDrop={onDrop}
          rootNodes={
            sceneGraphStoreProxy.selectedContainerId
              ? [
                  goBackTreeNode,
                  sceneGraphStore.findNodeById(
                    sceneGraphStoreProxy.selectedContainerId
                  )!,
                ]
              : sceneGraphStore.nodes
          }
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

const CardCss = css`
  :host {
    padding: 0;
  }
`;

const TreeCss = css`
  :host {
    height: 100%;
  }
`;

const StyleSceneGraph = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
    box-sizing: border-box;
  }

  .content {
    display: grid;
    height: 100%;
    width: 100%;
    grid-template-rows: 1fr 36px;
  }

  .graph-actions {
    border-top: 1px solid ${theme.colors.subtle500};
  }

  .graph-actions button {
    color: ${theme.colors.onSubtle};
    padding: 0.5rem;
  }
  .nodes {
    max-height: 100%;
    overflow: auto;
    padding: 0.5rem;
    box-sizing: border-box;
  }
`);

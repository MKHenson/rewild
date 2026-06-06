import { IResource, ITemplateTreeNode } from 'models';
import {
  theme,
  StyledMaterialIcon,
  ButtonGroup,
  Button,
  Tree,
  traverseTree,
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

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = (event) => {
      if (
        event.kind === 'nodes-updated' ||
        event.kind === 'container-activated' ||
        event.kind === 'container-deactivated'
      ) {
        this.render();
      } else if (event.kind === 'resource-selected') {
        setSelectedNodes(event.node ? [event.node] : []);
      }
    };

    this.on(sceneGraphStore.dispatcher, onSceneGraphEvent);

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      const node = tree.getSelectedNode();
      if (
        e.key === 'F2' &&
        selectedNodes().length === 1 &&
        selectedNodes()[0].canRename &&
        node
      ) {
        const newName = await node.editName();
        sceneGraphStore.selectedResource!.name = newName;
        sceneGraphStore.dispatcher.dispatch({
          kind: 'nodes-updated',
          nodes: sceneGraphStore.nodes,
        });
      }
    };

    const setSelection = (val: ITreeNode[]) => {
      setSelectedNodes(val);
    };

    // Resolve a (possibly spread-copied) node back to its original in the store.
    // Nodes in rootNodes are copied each render, so mutations must target originals.
    const resolveOriginal = (
      sel: ITreeNode<IResource>
    ): ITreeNode<IResource> | null => {
      if (sel.resource) return sceneGraphStore.findNodeById(sel.resource.id);
      return sceneGraphStore.nodes.find((n) => n.name === sel.name) ?? null;
    };

    const onAdd = () => {
      const original = resolveOriginal(
        selectedNodes()[0]
      ) as ITemplateTreeNode | null;
      if (original) sceneGraphStore.createChildNode(original);
    };

    const onDelete = () => {
      const original = resolveOriginal(selectedNodes()[0]);
      if (!original) return;

      if (original.resource?.type === 'container') {
        delete projectStore.containerPods[original.resource.id];
      }
      sceneGraphStore.removeNode(original);
      setSelection([]);
    };

    const onSelectionChanged = (val: ITreeNode<IResource>[]) => {
      setSelection(val);

      if (val.length === 1) sceneGraphStore.setSelectedNode(val[0]);
      else sceneGraphStore.setSelectedNode(null);
    };

    const handleNodeDblClick = (node: ITreeNode<IResource>) => {
      if (node === goBackTreeNode) sceneGraphStore.setActiveContainer(null);
      else if (node.resource && node.resource.type === 'container')
        sceneGraphStore.setActiveContainer(node.resource.id);
    };

    const onDrop = (val: ITreeNode<IResource>) => {
      projectStore.dirty = true;
      projectStore.dispatcher.dispatch({ kind: 'changed' });
    };

    this.onMount = () => {
      document.addEventListener('keydown', this.keyUpDelegate);
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', this.keyUpDelegate);
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
      const rootNodes: ITreeNode<IResource>[] =
        sceneGraphStore.selectedContainerId
          ? [
              goBackTreeNode,
              sceneGraphStore.findNodeById(
                sceneGraphStore.selectedContainerId
              )!,
            ]
          : sceneGraphStore.nodes.map((node) =>
              (node as ITemplateTreeNode).factoryKey === 'container'
                ? {
                    ...node,
                    children: node.children?.map((c) => ({
                      ...c,
                      children: undefined,
                    })),
                  }
                : node
            );

      // Container nodes are spread-copied in rootNodes on each render, so
      // selectedNodes state holds stale references that fail Array.includes.
      // Reconcile against the current rootNodes by resource ID before passing.
      const currentSelected = selectedNodes().reduce<ITreeNode<IResource>[]>(
        (acc, sel) => {
          let found: ITreeNode<IResource> | undefined;
          traverseTree(rootNodes, (n) => {
            const match = sel.resource
              ? (n as ITreeNode<IResource>).resource?.id === sel.resource.id
              : n.name === sel.name;
            if (match) {
              found = n as ITreeNode<IResource>;
              return true;
            }
            return false;
          });
          if (found) acc.push(found);
          return acc;
        },
        []
      );

      tree = (
        <Tree
          css={TreeCss}
          onSelectionChanged={onSelectionChanged}
          onNodeDblClick={handleNodeDblClick}
          selectedNodes={currentSelected}
          onDrop={onDrop}
          rootNodes={rootNodes}
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

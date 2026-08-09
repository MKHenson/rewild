import { IResource, ITemplateTreeNode } from 'models';
import {
  theme,
  Icon,
  StyledIcon,
  ButtonGroup,
  Button,
  Tree,
  traverseTree,
  Component,
  register,
  Card,
  Typography,
  ITreeNode,
} from 'rewild-ui';
import {
  SceneGraphEvents,
  sceneGraphStore,
} from '../../../stores/SceneGraphStore';
import { projectStore } from '../../../stores/ProjectStore';
import { sculptStore } from '../../../stores/SculptStore';
import { biomePaintStore } from '../../../stores/BiomePaintStore';
import { Subscriber } from 'rewild-common';

interface Props {}

@register('x-scene-graph')
export class SceneGraph extends Component<Props> {
  keyUpDelegate: (e: KeyboardEvent) => void;

  init() {
    const [selectedNodes, setSelectedNodes] = this.useState<
      ITreeNode<IResource>[]
    >([]);

    // Runs on activation only, never from the render path — re-applying it on
    // every render would undo the user's own expand on the next click.
    const collapseSiblingsOf = (container: ITreeNode<IResource>) => {
      container.expanded = true;
      container.parent?.children?.forEach((node) => {
        if (node !== container) node.expanded = false;
      });
    };

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = (event) => {
      if (
        event.kind === 'nodes-updated' ||
        event.kind === 'container-activated' ||
        event.kind === 'container-deactivated'
      ) {
        if (event.kind === 'container-activated')
          collapseSiblingsOf(event.container);
        this.render();
      } else if (event.kind === 'resource-selected') {
        setSelectedNodes(event.node ? [event.node] : []);
      }
    };

    this.on(sceneGraphStore.dispatcher, onSceneGraphEvent);

    this.keyUpDelegate = async (e: KeyboardEvent) => {
      // Escape is already claimed by the sculpt and biome brushes, so it only
      // deactivates the container once no brush mode is running.
      if (
        e.key === 'Escape' &&
        sceneGraphStore.selectedContainerId &&
        !sculptStore.enabled &&
        !biomePaintStore.enabled
      ) {
        sceneGraphStore.setActiveContainer(null);
        return;
      }

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

    // Resolve a node held in selection state back to the live store node, which
    // is replaced whenever the tree is rebuilt from a project.
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

    // Double click toggles, so the same gesture activates and deactivates.
    const handleNodeDblClick = (node: ITreeNode<IResource>) => {
      if (!node.resource || node.resource.type !== 'container') return;

      if (node.resource.id === sceneGraphStore.selectedContainerId)
        sceneGraphStore.setActiveContainer(null);
      else sceneGraphStore.setActiveContainer(node.resource.id);
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

    let html = (
      <Card stretched css={CardCss}>
        <div class="content">
          <div class="active-banner"></div>
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
                <StyledIcon icon="circle-plus" size="s" />
              </Button>
              <Button
                disabled={
                  selectedNodes().length == 0 || !selectedNodes()[0].resource
                }
                variant="text"
                id="delete-scene-node"
                onClick={onDelete}>
                <StyledIcon icon="trash-2" size="s" />
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </Card>
    );

    return () => {
      const activeNode = sceneGraphStore.selectedContainerId
        ? sceneGraphStore.findNodeById(sceneGraphStore.selectedContainerId)
        : null;

      // Only the active container's siblings dim, so global nodes such as Sky
      // stay at full strength and remain editable while a container is open.
      // Descendants are listed too — the muted style sits on the row, so it does
      // not cascade down to child rows on its own.
      const dimmedNodes: ITreeNode<IResource>[] = [];
      const siblings = activeNode?.parent?.children?.filter(
        (node) => node !== activeNode
      );
      if (siblings)
        traverseTree(siblings, (node) => {
          dimmedNodes.push(node);
          return false;
        });

      // The store rebuilds its nodes on project load, so selection state can
      // hold references that are no longer in the tree.
      const currentSelected = selectedNodes()
        .map(resolveOriginal)
        .filter((node): node is ITreeNode<IResource> => !!node);

      tree = (
        <Tree
          css={TreeCss}
          onSelectionChanged={onSelectionChanged}
          onNodeDblClick={handleNodeDblClick}
          selectedNodes={currentSelected}
          activeNode={activeNode}
          dimmedNodes={dimmedNodes}
          onDrop={onDrop}
          rootNodes={sceneGraphStore.nodes}
        />
      ) as Tree;

      html.querySelector('.nodes')!.replaceChildren(tree);

      const banner = html.querySelector('.active-banner')!;
      if (activeNode) {
        banner.replaceChildren(
          (
            <div class="banner-inner">
              <Icon icon="circle-dot" size="xs" />
              <Typography variant="body2">
                {activeNode.resource?.name || activeNode.name}
              </Typography>
              <span
                class="banner-close"
                title="Deactivate container (Esc)"
                onclick={() => sceneGraphStore.setActiveContainer(null)}>
                <StyledIcon icon="x" size="xs" />
              </span>
            </div>
          ) as HTMLElement
        );
      } else banner.replaceChildren();

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
    grid-template-rows: auto 1fr 36px;
    min-height: 0;
  }

  .banner-inner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.35rem 0.5rem;
    background: ${theme.colors.subtle500};
    margin: 5px;
    border-radius: 4px;
  }

  /* Icons colour from their host element, not from an inherited ancestor —
     their internal :host rule beats plain inheritance. */
  .banner-inner x-icon {
    color: ${theme.colors.secondary400};
  }

  .banner-inner x-typography {
    flex: 1;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .banner-close {
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .banner-close:hover x-styled-icon {
    color: ${theme.colors.onSurface};
  }

  .graph-actions {
    border-top: 1px solid ${theme.colors.subtle500};
  }

  .graph-actions button {
    color: ${theme.colors.onSubtle};
    padding: 0.5rem;
  }
  .nodes {
    min-height: 0;
    max-height: 100%;
    overflow: auto;
    padding: 0.5rem;
    box-sizing: border-box;
  }
`);

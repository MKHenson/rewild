import { ILevel, StoredRecord } from 'models';
import {
  theme,
  StyledIcon,
  ButtonGroup,
  Button,
  Tree,
  Component,
  register,
  Card,
  InfoBox,
  ITreeNode,
} from 'rewild-ui';
import { levelsStore } from '../../../stores/LevelsStore';
import { projectStore } from '../../../stores/ProjectStore';
import { confirmationStore } from '../../../stores/ConfirmationStore';

type LevelNode = ITreeNode<StoredRecord<ILevel>>;

interface Props {}

/**
 * The project's levels under a project root. The flag marks the start level and
 * the dot marks the level open in the editor. Double click opens a level.
 */
@register('x-levels-tree')
export class LevelsTree extends Component<Props> {
  init() {
    const [selectedId, setSelectedId] = this.useState<string | null>(null);

    this.on(levelsStore.dispatcher);
    this.on(projectStore.dispatcher, (event) => {
      if (event.kind === 'loading-completed')
        levelsStore.load(event.project.id);
      this.render();
    });

    this.onMount = () => {
      const project = projectStore.project;
      if (
        project &&
        !levelsStore.levels.some((l) => l.projectId === project.id)
      )
        levelsStore.load(project.id);
    };

    const selectedLevel = () =>
      levelsStore.levels.find((l) => l.id === selectedId()) ?? null;

    const onLoad = (level = selectedLevel()) => {
      if (level) projectStore.loadLevel(level.id);
    };

    const onSetStart = () => {
      const level = selectedLevel();
      if (level) projectStore.setStartLevel(level.id);
    };

    const onAdd = async () => {
      const project = projectStore.project;
      if (project) await levelsStore.add(project.id);
    };

    const onDelete = () => {
      const level = selectedLevel();
      if (!level || !levelsStore.canRemove(level.id)) return;

      confirmationStore.show(
        'Delete Level',
        `Are you sure you want to delete "${level.name}" and all of its terrain? This action cannot be undone.`,
        async () => {
          await levelsStore.remove(level.id);
          if (!levelsStore.error) setSelectedId(null);
        },
        { okLabel: 'Delete', okColor: 'error' }
      );
    };

    // Handled on the pane, so F2 renames a level only while the pane has focus.
    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== 'F2') return;
      const level = selectedLevel();
      const node = tree?.getSelectedNode();
      if (!level || !node) return;

      e.stopPropagation();
      e.preventDefault();
      const name = await node.editName();
      await levelsStore.rename(level.id, name);
      this.render();
    };

    const onSelectionChanged = (nodes: LevelNode[]) => {
      setSelectedId(nodes.length === 1 ? nodes[0].resource?.id ?? null : null);
    };

    let tree: Tree | null = null;

    const addButton = (
      <Button variant="text" onClick={onAdd}>
        <StyledIcon icon="circle-plus" size="s" />
      </Button>
    ) as Button;
    const loadButton = (
      <Button variant="text" onClick={() => onLoad()}>
        <StyledIcon icon="folder-open" size="s" />
      </Button>
    ) as Button;
    const startButton = (
      <Button variant="text" onClick={onSetStart}>
        <StyledIcon icon="flag" size="s" />
      </Button>
    ) as Button;
    const deleteButton = (
      <Button variant="text" onClick={onDelete}>
        <StyledIcon icon="trash-2" size="s" />
      </Button>
    ) as Button;

    const content = (
      <div class="content" tabIndex={-1} onkeydown={onKeyDown}>
        <div class="error"></div>
        <div class="nodes"></div>
        <div class="graph-actions">
          <ButtonGroup>
            {addButton}
            {loadButton}
            {startButton}
            {deleteButton}
          </ButtonGroup>
        </div>
      </div>
    ) as HTMLElement;

    const html = (
      <Card stretched css={CardCss}>
        {content}
      </Card>
    );

    return () => {
      const project = projectStore.project;
      const startLevelId = project?.levelId;
      const loadedLevelId = projectStore.level?.id;

      const levelNodes: LevelNode[] = levelsStore.levels.map((level) => ({
        name: level.name,
        icon: level.id === startLevelId ? 'flag' : 'box',
        canSelect: true,
        iconSize: 'xs',
        canRename: true,
        resource: level,
      }));

      const root: LevelNode = {
        name: project?.name ?? 'Project',
        icon: 'folder',
        canSelect: false,
        canRename: false,
        expanded: true,
        children: levelNodes,
      };
      levelNodes.forEach((node) => (node.parent = root));

      const selected = levelNodes.filter(
        (node) => node.resource?.id === selectedId()
      );
      const active =
        levelNodes.find((node) => node.resource?.id === loadedLevelId) ?? null;

      tree = (
        <Tree
          css={TreeCss}
          rootNodes={[root]}
          selectedNodes={selected}
          activeNode={active}
          onSelectionChanged={onSelectionChanged}
          onNodeDblClick={(node: LevelNode) => onLoad(node.resource)}
        />
      ) as Tree;
      content.querySelector('.nodes')!.replaceChildren(tree);

      content.querySelector('.error')!.replaceChildren(
        ...(levelsStore.error
          ? [
              (
                <InfoBox title="Error" variant="error">
                  {levelsStore.error}
                </InfoBox>
              ) as HTMLElement,
            ]
          : [])
      );

      const level = selectedLevel();
      const busy = levelsStore.loading || projectStore.loading || !project;
      addButton.disabled = busy;
      loadButton.disabled = busy || !level || level.id === loadedLevelId;
      startButton.disabled = busy || !level || level.id === startLevelId;
      deleteButton.disabled =
        busy || !level || !levelsStore.canRemove(level.id);

      return html;
    };
  }

  getStyle() {
    return StyleLevelsTree;
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

const StyleLevelsTree = cssStylesheet(css`
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
    outline: none;
  }

  .error x-info-box {
    display: block;
    margin: 5px;
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

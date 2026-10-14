import { IProject, StoredRecord } from 'models';
import {
  Button,
  ButtonGroup,
  Component,
  Date as DateView,
  InfoBox,
  register,
  Table,
  TableColumn,
  theme,
  Typography,
} from 'rewild-ui';
import { getAllProjects } from '../../../api/projects';
import { getLevels } from '../../../api/levels';
import { getPlayProject } from '../../../api/play';
import { getSharedProjects, SharedProject } from '../../../api/shares';
import { authStore } from '../../stores/AuthStore';
import { ProjectImage } from '../common/ProjectImage';

type LocalProject = StoredRecord<IProject>;
type Project = LocalProject | SharedProject;
type Filter = 'mine' | 'shared';
type LevelSummary = { id: string; name: string };

type Props = {
  /** Called with the project Start should play, or null when there is none. */
  onSelect: (projectId: string | null) => void;
};

const columns: TableColumn<Project>[] = [
  { label: 'Name', render: (p) => p.name || 'Untitled Project' },
  {
    label: 'Last modified',
    width: '220px',
    render: (p) => <DateView date={p.updatedAt} variant="short" />,
  },
];

/**
 * The My Games tab: the player's own projects, or those other players shared with them, newest first,
 * with the details of the selected one. Logged out players see only their own.
 */
@register('x-my-games-panel')
export class MyGamesPanel extends Component<Props> {
  init() {
    const [filter, setFilter] = this.useState<Filter>('mine');
    const [projects, setProjects] = this.useState<Project[] | null>(null);
    const [selected, setSelected] = this.useState<Project | null>(null);
    const [levels, setLevels] = this.useState<LevelSummary[]>([]);
    const [levelsError, setLevelsError] = this.useState<string | null>(null);
    const [error, setError] = this.useState<string | null>(null);

    const loadLevels = async (project: Project): Promise<LevelSummary[]> =>
      filter() === 'shared'
        ? (await getPlayProject(project.id)).levels
        : getLevels(project.id);

    const select = async (project: Project | null) => {
      setSelected(project);
      setLevels([], false);
      setLevelsError(null, false);
      this.props.onSelect(project?.id ?? null);
      if (!project) return;

      try {
        const projectLevels = await loadLevels(project);
        if (selected() === project) setLevels(projectLevels);
      } catch (err) {
        if (selected() === project)
          setLevelsError(err instanceof Error ? err.message : String(err));
      }
    };

    const load = async (next: Filter) => {
      setFilter(next, false);
      setProjects(null);
      setError(null);
      await select(null);
      try {
        const list: Project[] =
          next === 'shared'
            ? await getSharedProjects()
            : await getAllProjects();
        if (filter() !== next) return;
        setProjects(list);
        await select(list[0] ?? null);
      } catch (err) {
        if (filter() !== next) return;
        setError(err instanceof Error ? err.message : String(err));
        setProjects([]);
      }
    };

    this.on(authStore.dispatcher, () => {
      if (!authStore.loggedIn && filter() === 'shared') load('mine');
      else this.render();
    });

    this.onMount = () => load(filter());

    const author = (project: Project) => {
      if (filter() === 'shared')
        return (project as SharedProject).authorName ?? 'Unknown';
      return authStore.loggedIn ? authStore.user.displayName : 'You';
    };

    const details = (project: Project) => (
      <div class="details">
        <ProjectImage project={project} />
        <Typography variant="h3">
          {project.name || 'Untitled Project'}
        </Typography>
        {project.description ? (
          <Typography variant="body1">{project.description}</Typography>
        ) : null}
        <dl>
          <dt>Author</dt>
          <dd>{author(project)}</dd>
          <dt>Last modified</dt>
          <dd>
            <DateView date={project.updatedAt} />
          </dd>
          {filter() === 'mine' ? <dt>Saved to your account</dt> : null}
          {filter() === 'mine' ? (
            <dd>
              {(project as LocalProject).syncedAt > 0 ? (
                <DateView date={(project as LocalProject).syncedAt} />
              ) : (
                'Only on this device'
              )}
            </dd>
          ) : null}
          <dt>Levels</dt>
          <dd>
            {levelsError() ? (
              levelsError()
            ) : levels().length ? (
              <ul>
                {levels().map((level) => (
                  <li>
                    {level.name || 'Untitled Level'}
                    {level.id === project.levelId ? (
                      <span class="start"> · start level</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              'None'
            )}
          </dd>
        </dl>
      </div>
    );

    return () => {
      const list = projects();
      const current = selected();
      const shared = filter() === 'shared';

      return (
        <div class={current ? 'panel' : 'panel no-details'}>
          <div class="list">
            {authStore.loggedIn ? (
              <ButtonGroup>
                <Button
                  variant="outlined"
                  size="s"
                  selected={!shared}
                  onClick={() => shared && load('mine')}>
                  My Games
                </Button>
                <Button
                  variant="outlined"
                  size="s"
                  selected={shared}
                  onClick={() => !shared && load('shared')}>
                  Shared Games
                </Button>
              </ButtonGroup>
            ) : null}
            {error() ? (
              <InfoBox
                variant="error"
                title={
                  shared
                    ? 'Could not load the shared games'
                    : 'Could not load your games'
                }>
                {error()}
              </InfoBox>
            ) : null}
            <Table
              columns={columns}
              rows={list ?? []}
              loading={!list}
              emptyMessage={
                shared
                  ? 'No games are shared with you yet.'
                  : 'You have no games yet. Make one in the editor.'
              }
              onRowClick={(project) => select(project)}
              isSelected={(project) => project.id === current?.id}
            />
          </div>
          {current ? details(current) : null}
        </div>
      );
    };
  }

  getStyle() {
    return StyledMyGamesPanel;
  }
}

const StyledMyGamesPanel = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
  }

  .panel {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: ${theme.space.xl};
    height: 100%;
  }

  .panel.no-details {
    grid-template-columns: 1fr;
  }

  .list,
  .details {
    min-height: 0;
    overflow: auto;
  }

  .list x-typography,
  .list x-button-group,
  .list x-info-box {
    display: block;
    margin: 0 0 ${theme.space.m} 0;
  }

  .details x-project-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: ${theme.sizes.radius};
    margin: 0 0 ${theme.space.m} 0;
  }

  .details x-typography {
    display: block;
    margin: 0 0 ${theme.space.s} 0;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: ${theme.space.s} ${theme.space.l};
    margin: ${theme.space.l} 0 0 0;
    font-family: var(--font-family);
    font-size: 13px;
  }

  dt {
    color: ${theme.colors.onSurfaceLight};
  }

  dd {
    margin: 0;
    color: ${theme.colors.onSurface};
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .start {
    color: ${theme.colors.onSurfaceLight};
  }
`);

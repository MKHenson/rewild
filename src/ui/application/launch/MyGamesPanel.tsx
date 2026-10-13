import { ILevel, IProject, StoredRecord } from 'models';
import {
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
import { authStore } from '../../stores/AuthStore';
import { ProjectImage } from '../common/ProjectImage';

type Project = StoredRecord<IProject>;

type Props = {
  /** Called with the project Start should play, or null when there is none. */
  onSelect: (projectId: string | null) => void;
};

const columns: TableColumn<Project>[] = [
  { label: 'Name', render: (p) => p.name || 'Untitled Project' },
  {
    label: 'Last modified',
    width: '220px',
    render: (p) => <DateView date={p.updatedAt} />,
  },
];

/** The My Games tab: the player's own projects, newest first, with the details of the selected one. */
@register('x-my-games-panel')
export class MyGamesPanel extends Component<Props> {
  init() {
    this.on(authStore.dispatcher);

    const [projects, setProjects] = this.useState<Project[] | null>(null);
    const [selected, setSelected] = this.useState<Project | null>(null);
    const [levels, setLevels] = this.useState<StoredRecord<ILevel>[]>([]);
    const [error, setError] = this.useState<string | null>(null);

    const select = async (project: Project | null) => {
      setSelected(project);
      setLevels([], false);
      this.props.onSelect(project?.id ?? null);
      if (!project) return;

      const projectLevels = await getLevels(project.id);
      if (selected() === project) setLevels(projectLevels);
    };

    this.onMount = async () => {
      try {
        const list = await getAllProjects();
        setProjects(list);
        await select(list[0] ?? null);
      } catch (err: any) {
        setError(err.message);
        setProjects([]);
        this.props.onSelect(null);
      }
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
          <dd>{authStore.loggedIn ? authStore.user.displayName : 'You'}</dd>
          <dt>Last modified</dt>
          <dd>
            <DateView date={project.updatedAt} />
          </dd>
          <dt>Saved to your account</dt>
          <dd>
            {project.syncedAt > 0 ? (
              <DateView date={project.syncedAt} />
            ) : (
              'Only on this device'
            )}
          </dd>
          <dt>Levels</dt>
          <dd>
            {levels().length ? (
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

      return (
        <div class={current ? 'panel' : 'panel no-details'}>
          <div class="list">
            <Typography variant="info">
              Games you made in the editor. Start plays the selected game from
              its start level.
            </Typography>
            {error() ? (
              <InfoBox variant="error" title="Could not load your games">
                {error()}
              </InfoBox>
            ) : null}
            <Table
              columns={columns}
              rows={list ?? []}
              loading={!list}
              emptyMessage="You have no games yet. Make one in the editor."
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

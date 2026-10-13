import {
  Button,
  Component,
  Date as DateView,
  InfoBox,
  Loading,
  PropertyGroup,
  PropertyRow,
  register,
  Select,
  theme,
  Typography,
} from 'rewild-ui';
import { DetailPage } from './DetailPage';
import { AdminProject, getAdminProjects } from '../../../api/admin';
import { getPublicGame, setPublicGame } from '../../../api/public-game';
import { ProjectImage } from '../common/ProjectImage';

const NONE = '';
export const PUBLIC_PATH = '/admin/public';

/** The `/admin/public` route: picks the project all players see in Story Mode, with a preview of the pick. */
@register('x-admin-public-game')
export class PublicGamePanel extends Component {
  init() {
    const [projects, setProjects] = this.useState<AdminProject[] | null>(null);
    const [savedId, setSavedId] = this.useState(NONE);
    const [selected, setSelected] = this.useState(NONE);
    const [saving, setSaving] = this.useState(false);
    const [justSaved, setJustSaved] = this.useState(false);
    const [loadError, setLoadError] = this.useState<string | null>(null);
    const [saveError, setSaveError] = this.useState<string | null>(null);

    const load = async () => {
      try {
        const [list, game] = await Promise.all([
          getAdminProjects(),
          getPublicGame(),
        ]);
        setSavedId(game?.id ?? NONE, false);
        setSelected(game?.id ?? NONE, false);
        setProjects(list);
      } catch (err: any) {
        setLoadError(err.message);
      }
    };

    this.onMount = load;

    const onSave = async () => {
      setSaving(true);
      setSaveError(null, false);
      try {
        const game = await setPublicGame(selected() || null);
        setSavedId(game?.id ?? NONE, false);
        setSelected(game?.id ?? NONE, false);
        setJustSaved(true, false);
      } catch (err: any) {
        setSaveError(err.message, false);
      }
      setSaving(false);
    };

    const onSelect = (value: string) => {
      setJustSaved(false, false);
      setSaveError(null, false);
      setSelected(value);
    };

    const preview = (project: AdminProject | undefined) =>
      project ? (
        <div class="preview">
          <ProjectImage project={project} />
          <div class="details">
            <div class="name">{project.name || 'Untitled Project'}</div>
            <div class="meta">
              by {project.authorName} · updated{' '}
              <DateView date={project.updatedAt} />
            </div>
            <Typography variant="body1">{project.description}</Typography>
          </div>
        </div>
      ) : (
        <div class="preview">
          <ProjectImage project={{ id: NONE, imageUrl: null }} />
          <div class="details">
            <div class="name">No public game</div>
            <Typography variant="body1">
              Story Mode is unavailable until a project is promoted.
            </Typography>
          </div>
        </div>
      );

    return () => {
      const err = loadError();
      if (err)
        return (
          <InfoBox variant="error" title="Could not load the public game">
            {err}
          </InfoBox>
        );

      const list = projects();
      if (!list) return <Loading />;

      const options = [
        { value: NONE, label: 'None' },
        ...list.map((p) => ({
          value: p.id,
          label: `${p.name || 'Untitled Project'} (${p.authorName})`,
        })),
      ];
      const saveFailure = saveError();

      return (
        <DetailPage breadcrumbs={[{ label: 'Public Game' }]}>
          <div slot="actions" class="actions">
            {justSaved() ? <span class="saved">✓ Saved</span> : null}
            <Button
              onClick={onSave}
              disabled={saving() || selected() === savedId()}>
              {saving() ? 'Saving…' : 'Save'}
            </Button>
          </div>

          {saveFailure ? (
            <InfoBox variant="error" title="Save failed">
              {saveFailure}
            </InfoBox>
          ) : null}

          {preview(list.find((p) => p.id === selected()))}

          <PropertyGroup title="Promoted Content">
            <Typography variant="info">
              All players see and play this project in Story Mode, also when
              logged out. The game starts at the project's start level.
            </Typography>
            <PropertyRow label="Project">
              <Select
                value={selected()}
                options={options}
                disabled={saving()}
                onChange={onSelect}
              />
            </PropertyRow>
          </PropertyGroup>
        </DetailPage>
      );
    };
  }

  getStyle() {
    return StyledPublicGamePanel;
  }
}

const StyledPublicGamePanel = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: ${theme.space.m};
  }

  .saved {
    font-family: var(--font-family);
    font-size: 13px;
    color: ${theme.colors.onSurfaceLight};
  }

  x-info-box {
    display: block;
    margin: 0 0 ${theme.space.l} 0;
  }

  .preview {
    display: flex;
    gap: ${theme.space.xl};
    align-items: flex-start;
    margin: 0 0 ${theme.space.xl} 0;
  }

  x-project-image {
    flex: none;
    width: 320px;
    aspect-ratio: 16 / 9;
    border-radius: ${theme.sizes.radius};
  }

  .details {
    min-width: 0;
  }

  .name {
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeLarge};
    font-weight: 500;
    color: ${theme.colors.onSurface};
  }

  .meta {
    margin: 2px 0 ${theme.space.m} 0;
    font-family: var(--font-family);
    font-size: 13px;
    color: ${theme.colors.onSurfaceLight};
  }

  x-select {
    flex: 1;
    max-width: 480px;
  }
`);

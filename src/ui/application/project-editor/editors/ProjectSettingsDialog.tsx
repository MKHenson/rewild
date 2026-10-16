import {
  Modal,
  Component,
  register,
  Typography,
  Input,
  Select,
  Tabs,
  Tab,
  Button,
  Icon,
  theme,
} from 'rewild-ui';
import { ILevel, StoredRecord } from 'models';
import { projectStore } from '../../../stores/ProjectStore';
import { getLevels } from '../../../../api/levels';
import {
  PROJECT_IMAGE_TYPES,
  projectImageAsset,
  projectImageProblem,
} from '../../../../api/assets/asset-api';
import { authService } from '../../../../api/auth/auth-service';
import { db } from '../../../../database/database';
import { ProjectSharingPanel } from './ProjectSharingPanel';

interface Props {
  onClose: () => void;
}

@register('x-project-settings-dialog')
export class ProjectSettingsDialog extends Component<Props> {
  init() {
    const project = projectStore.project!;

    const [name, setName] = this.useState(project.name);
    const [description, setDescription] = this.useState(project.description);
    const [levelId, setLevelId] = this.useState(project.levelId);
    const [levels, setLevels] = this.useState<StoredRecord<ILevel>[]>([]);
    const [saving, setSaving] = this.useState(false);
    const [nameMissing, setNameMissing] = this.useState(false);
    const [imageUrl, setImageUrl] = this.useState<string | null>(null);
    const [imagePending, setImagePending] = this.useState(false);
    const [imageError, setImageError] = this.useState<string | null>(null);
    const [tab, setTab] = this.useState(0);
    // A blob URL for the image shown.
    let previewUrl: string | null = null;
    // Set by a Save that failed validation, so the Modal's close that follows is skipped.
    let keepOpen = false;

    // Built once, so a re-render of the dialog keeps its shares and the picker's text.
    const sharingPanel = <ProjectSharingPanel project={project} />;

    const fileInput = (
      <input type="file" accept={PROJECT_IMAGE_TYPES.join(',')} hidden />
    ) as HTMLInputElement;

    const showImage = (image: Blob, pending: boolean) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(image);
      setImagePending(pending, false);
      setImageUrl(previewUrl);
    };

    // The image applies at once, independent of Save and Cancel. Sync uploads it.
    const onFilePicked = async (file: File) => {
      const problem = projectImageProblem(file);
      if (problem) {
        setImageError(problem);
        return;
      }

      setImageError(null);
      try {
        await db.writeAsset({ ...projectImageAsset(project.id), contentType: file.type }, file);
      } catch (err) {
        setImageError(err instanceof Error ? err.message : String(err));
        return;
      }
      showImage(file, true);
      if (authService.getToken())
        db.syncAll().catch((err) => console.warn('Image sync failed:', err));
    };

    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) onFilePicked(file);
    };

    this.onMount = async () => {
      setLevels(await getLevels(project.id));
      const image = await db.getProjectImage(project);
      if (image) showImage(image, await db.assets.isPending(projectImageAsset(project.id)));
    };

    this.onCleanup = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };

    const onSave = async () => {
      const trimmedName = name().trim();
      if (!trimmedName) {
        keepOpen = true;
        setTab(0, false);
        setNameMissing(true);
        return;
      }

      setSaving(true);
      const current = projectStore.project!;
      current.name = trimmedName;
      current.description = description();
      current.levelId = levelId();
      await projectStore.updateProject();
      this.props.onClose();
    };

    // Modal closes itself after Save; the dialog stays open until the save ends.
    const onModalClose = () => {
      if (keepOpen) keepOpen = false;
      else if (!saving()) this.props.onClose();
    };

    const onNameInput = (value: string) => {
      setName(value, false);
      if (nameMissing() && value.trim()) setNameMissing(false);
    };

    const field = (
      label: string,
      control: JSX.Element,
      hint?: string,
      error?: string
    ) => (
      <div class="field">
        <Typography variant="label">{label}</Typography>
        {control}
        {error ? <div class="error">{error}</div> : null}
        {hint ? (
          <div class="hint">
            <Typography variant="info">{hint}</Typography>
          </div>
        ) : null}
      </div>
    );

    return () => {
      const levelOptions = levels().map((level) => ({
        value: level.id,
        label: level.name || 'Untitled Level',
      }));

      return (
        <Modal
          open
          title="Project Settings"
          okLabel={saving() ? 'Saving…' : 'Save'}
          cancelLabel="Cancel"
          okDisabled={saving()}
          cancelDisabled={saving()}
          onOk={onSave}
          onClose={onModalClose}
          backgroundCanClose={false}
          css={ProjectSettingsModalOverrides}>
          <Tabs
            orientation="vertical"
            activeIndex={tab()}
            onChange={(index) => setTab(index)}>
            <Tab label="General">
              {field(
                'Image',
                <div class="image-row">
                  {imageUrl() ? (
                    <img class="image" src={imageUrl()!} alt="Project image" />
                  ) : (
                    <div class="image placeholder">
                      <Icon icon="mountain" />
                    </div>
                  )}
                  <Button variant="outlined" onClick={() => fileInput.click()}>
                    Change Image
                  </Button>
                  {fileInput}
                </div>,
                imagePending()
                  ? 'PNG, JPEG or WebP, up to 2 MB. Uploads when the project syncs'
                  : 'PNG, JPEG or WebP, up to 2 MB',
                imageError() ?? undefined
              )}
              {field(
                'Name',
                <Input
                  fullWidth
                  value={name()}
                  placeholder="What players see in the game list"
                  onInput={onNameInput}
                  onChange={onNameInput}
                />,
                undefined,
                nameMissing() ? 'Enter a name for the project' : undefined
              )}
              {field(
                'Description',
                <Input
                  fullWidth
                  value={description()}
                  placeholder="Shown to players when they choose a game"
                  onChange={(v) => setDescription(v, false)}
                />
              )}
              {field(
                'Start Level',
                <Select
                  value={levelId()}
                  options={levelOptions}
                  disabled={levelOptions.length === 0}
                  onChange={(v) => setLevelId(v, false)}
                />,
                'The level a game of this project starts in'
              )}
            </Tab>
            <Tab label="Sharing">{sharingPanel}</Tab>
          </Tabs>
        </Modal>
      );
    };
  }

  getStyle() {
    return StyledProjectSettingsDialog;
  }
}

const StyledProjectSettingsDialog = cssStylesheet(css`
  x-tab {
    padding: 0 0 0 1.5rem;
  }

  .field {
    margin-bottom: 1.5rem;
  }

  .field x-input,
  .field x-select {
    display: block;
    margin-top: 0.25rem;
  }

  .hint {
    margin-top: 0.5rem;
  }

  .image-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.25rem;
  }

  .image {
    width: 192px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: ${theme.sizes.radius};
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed ${theme.colors.onSurfaceBorder};
    color: ${theme.colors.onSurfaceLight};
  }

  .error {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: ${theme.colors.error500};
  }
`);

const ProjectSettingsModalOverrides = css`
  :host .modal {
    width: 760px;
    max-width: 94vw;
  }
`;

import {
  Modal,
  Component,
  register,
  Typography,
  Input,
  Select,
  Tabs,
  Tab,
  theme,
} from 'rewild-ui';
import { ILevel, StoredRecord } from 'models';
import { projectStore } from '../../../stores/ProjectStore';
import { getLevels } from '../../../../api/levels';

interface Props {
  onClose: () => void;
}

@register('x-project-settings-dialog')
export class ProjectSettingsDialog extends Component<Props> {
  init() {
    const project = projectStore.project!;

    const [name, setName] = this.useState(project.name);
    const [description, setDescription] = this.useState(project.description);
    const [startEvent, setStartEvent] = this.useState(project.startEvent);
    const [levelId, setLevelId] = this.useState(project.levelId);
    const [levels, setLevels] = this.useState<StoredRecord<ILevel>[]>([]);
    const [saving, setSaving] = this.useState(false);
    const [nameMissing, setNameMissing] = this.useState(false);
    // Set by a Save that failed validation, so the Modal's close that follows is skipped.
    let keepOpen = false;

    this.onMount = async () => {
      setLevels(await getLevels(project.id));
    };

    const onSave = async () => {
      const trimmedName = name().trim();
      if (!trimmedName) {
        keepOpen = true;
        setNameMissing(true);
        return;
      }

      setSaving(true);
      const current = projectStore.project!;
      current.name = trimmedName;
      current.description = description();
      current.startEvent = startEvent();
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
          <Tabs orientation="vertical">
            <Tab label="General">
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
              {field(
                'Start Event',
                <Input
                  fullWidth
                  value={startEvent()}
                  onChange={(v) => setStartEvent(v, false)}
                />
              )}
            </Tab>
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

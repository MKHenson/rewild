import {
  Component,
  Divider,
  Field,
  Modal,
  register,
  Select,
  Tab,
  Tabs,
  Typography,
} from 'rewild-ui';
import {
  QUALITY_ASPECTS,
  QualityAspect,
  QualityOverrides,
  RENDER_QUALITIES,
  RenderQuality,
} from 'rewild-renderer/lib/utils/RenderQuality';
import { getQualitySettings } from '../utils/getQualitySettings';

type Props = {
  /** Leave the settings, discarding anything not applied. */
  onClose: () => void;
};

const qualityOptions = RENDER_QUALITIES.map((quality) => ({
  value: quality,
  label: quality.charAt(0).toUpperCase() + quality.slice(1),
}));

/** What each subsystem costs, in the terms a player picking a tier cares about. */
const ASPECTS: Record<QualityAspect, { label: string; description: string }> = {
  clouds: {
    label: 'Clouds',
    description:
      'Volumetric cloud detail, and the resolution they are drawn at. By far ' +
      'the most expensive part of the sky — the first thing to lower on a ' +
      'machine that is struggling.',
  },
  cloudShadows: {
    label: 'Cloud Shadows',
    description:
      'How finely the shadows clouds cast across the landscape are traced.',
  },
  godRays: {
    label: 'God Rays',
    description:
      'Shafts of sunlight through gaps in the cloud. Cheap to lower — the ' +
      'shafts are soft, so a coarser trace is hard to spot.',
  },
  bloom: {
    label: 'Bloom',
    description: 'The glow that spreads out of the brightest parts of a frame.',
  },
};

/**
 * The game's settings screen — the `/settings` route from the main menu, and the
 * panel the in-game menu swaps itself out for.
 */
@register('x-settings-panel')
export class SettingsPanel extends Component<Props> {
  init() {
    const settings = getQualitySettings();
    const [level, setLevel] = this.useState<RenderQuality>(settings.level);
    const [overrides, setOverrides] = this.useState<QualityOverrides>({
      ...settings.overrides,
    });
    const [tabIndex, setTabIndex] = this.useState(0);

    const onLevelChange = (value: string) => {
      setLevel(value as RenderQuality, false);
      setOverrides({});
    };

    const onAspectChange = (aspect: QualityAspect, value: string) => {
      const next = { ...overrides() };
      if (value === level()) delete next[aspect];
      else next[aspect] = value as RenderQuality;
      setOverrides(next);
    };

    const onApply = () => {
      getQualitySettings().apply(level(), overrides());
    };

    return () => {
      return (
        <Modal
          open
          title="Settings"
          okLabel="Apply"
          cancelLabel="Cancel"
          onOk={onApply}
          onCancel={this.props.onClose}
          onClose={this.props.onClose}
          css={SettingsModalOverrides}>
          <Tabs
            orientation="vertical"
            activeIndex={tabIndex()}
            onChange={setTabIndex}>
            <Tab label="Display">
              <div class="section">
                <Field label="Render Quality">
                  <Select
                    value={level()}
                    options={qualityOptions}
                    onChange={onLevelChange}
                  />
                </Field>
                <Typography variant="light">
                  Sets every section below at once. Lower it if the game runs
                  poorly, then raise anything back that you want to keep.
                </Typography>
              </div>

              <Divider />

              <div class="aspects">
                {QUALITY_ASPECTS.map((aspect) => (
                  <div class="section">
                    <Field label={ASPECTS[aspect].label}>
                      <Select
                        value={overrides()[aspect] || level()}
                        options={qualityOptions}
                        onChange={(value) => onAspectChange(aspect, value)}
                      />
                    </Field>
                    <Typography variant="light">
                      {ASPECTS[aspect].description}
                    </Typography>
                  </div>
                ))}
              </div>

              <Typography variant="info">
                Applying rebuilds the affected shaders, so expect a brief pause
                on the next frame.
              </Typography>
            </Tab>
          </Tabs>
        </Modal>
      );
    };
  }

  getStyle() {
    return StyledSettingsPanel;
  }
}

const StyledSettingsPanel = cssStylesheet(css`
  x-tabs {
    height: 60vh;
  }
  x-tab {
    padding: 0 0.5rem 0 1.5rem;
  }
  .section {
    margin: 0 0 1.25rem 0;
  }
  .section x-typography {
    margin: -0.25rem 0 0 0;
  }

  .divider {
    margin: 0 0 1.25rem 0;
  }
`);

const SettingsModalOverrides = css`
  :host .modal {
    width: 720px;
    max-width: 90vw;
  }
  :host .content {
    overflow: hidden;
  }
`;

import {
  Component,
  Divider,
  Field,
  InfoBox,
  Modal,
  register,
  Select,
  Slider,
  Switch,
  Tab,
  Tabs,
  Typography,
  theme,
} from 'rewild-ui';
import {
  QUALITY_ASPECTS,
  QualityAspect,
  QualityOverrides,
  RenderQuality,
  RenderScale,
} from 'rewild-renderer/lib/utils/RenderQuality';
import { getQualitySettings } from '../utils/getQualitySettings';
import { VOLUME_SETTINGS, VolumeSetting } from 'rewild-audio';
import { audioSettings } from '../../core/audio/audio';
import { OutputDeviceField } from './OutputDeviceField';
import { getUiTheme, setUiTheme, UiTheme } from '../utils/uiTheme';
import {
  APPLY_NOTE,
  ASPECTS,
  QUALITY_OPTIONS,
  RENDER_QUALITY_DESCRIPTION,
  RENDER_SCALE_DESCRIPTION,
  SCALE_OPTIONS,
  THEME_DESCRIPTION,
  THEME_OPTIONS,
  VOLUMES,
} from '../../core/menus/settingsOptions';

type Props = {
  /** Leave the settings, discarding anything not applied. */
  onClose: () => void;
};

/** A volume slider and its percentage, wired straight to the audio settings. */
function volumeRow(setting: VolumeSetting) {
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const value = (
    <span class="value">{percent(audioSettings.volume(setting))}</span>
  ) as HTMLSpanElement;
  return (
    <div class="section">
      <Field label={VOLUMES[setting].label}>
        <div class="volume">
          <Slider
            min={0}
            max={100}
            step={1}
            fullWidth
            value={Math.round(audioSettings.volume(setting) * 100)}
            onChange={(v: number) => {
              audioSettings.setVolume(setting, v / 100);
              value.textContent = percent(v / 100);
            }}
          />
          {value}
        </div>
      </Field>
      <Typography variant="light">{VOLUMES[setting].description}</Typography>
    </div>
  );
}

/**
 * The game's settings screen: the `/settings` route from the main menu. The
 * in-game menu opens `SettingsMenu`, which shows the same settings.
 */
@register('x-settings-panel')
export class SettingsPanel extends Component<Props> {
  init() {
    const settings = getQualitySettings();
    const [level, setLevel] = this.useState<RenderQuality>(settings.level);
    const [overrides, setOverrides] = this.useState<QualityOverrides>({
      ...settings.overrides,
    });
    const [renderScale, setRenderScale] = this.useState<RenderScale>(
      settings.renderScale
    );
    const [tabIndex, setTabIndex] = this.useState(0);
    const [uiTheme, setUiThemeState] = this.useState<UiTheme>(getUiTheme());

    const onThemeChange = (value: string) => {
      setUiTheme(value as UiTheme);
      setUiThemeState(value as UiTheme);
    };

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
      const settings = getQualitySettings();
      settings.apply(level(), overrides());
      settings.renderScale = renderScale();
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
                    options={QUALITY_OPTIONS}
                    onChange={onLevelChange}
                  />
                </Field>
                <Typography variant="light">
                  {RENDER_QUALITY_DESCRIPTION}
                </Typography>
              </div>

              <div class="section render-scale">
                <Field label="Render Scale">
                  <Select
                    value={String(renderScale())}
                    options={SCALE_OPTIONS}
                    onChange={(value) =>
                      setRenderScale(Number(value) as RenderScale)
                    }
                  />
                </Field>
                <Typography variant="light">
                  {RENDER_SCALE_DESCRIPTION}
                </Typography>
              </div>

              <Divider />

              <div class="aspects">
                {QUALITY_ASPECTS.map((aspect) => (
                  <div class="section">
                    <Field label={ASPECTS[aspect].label}>
                      <Select
                        value={overrides()[aspect] || level()}
                        options={QUALITY_OPTIONS}
                        onChange={(value) => onAspectChange(aspect, value)}
                      />
                    </Field>
                    <Typography variant="light">
                      {ASPECTS[aspect].description}
                    </Typography>
                  </div>
                ))}
              </div>

              <Typography variant="info">{APPLY_NOTE}</Typography>
            </Tab>
            <Tab label="Audio">
              <div class="volumes">{VOLUME_SETTINGS.map(volumeRow)}</div>

              <Divider />

              <OutputDeviceField />

              <div class="section">
                <Field label="Mute when in the background">
                  <Switch
                    checked={audioSettings.muteInBackground}
                    onClick={() =>
                      (audioSettings.muteInBackground =
                        !audioSettings.muteInBackground)
                    }
                  />
                </Field>
                <Typography variant="info">
                  Silences the game while another window has focus.
                </Typography>
              </div>

              <InfoBox variant="info" title="">
                Audio changes apply straight away, without Apply.
              </InfoBox>
            </Tab>
            <Tab label="Interface">
              <div class="section">
                <Field label="Theme">
                  <Select
                    value={uiTheme()}
                    options={THEME_OPTIONS}
                    onChange={onThemeChange}
                  />
                </Field>
                <Typography variant="light">{THEME_DESCRIPTION}</Typography>
              </div>

              <InfoBox variant="info" title="">
                The theme changes straight away, without Apply.
              </InfoBox>
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
    display: block;
    margin: ${theme.space.s} 0 0 0;
  }

  .divider {
    margin: 0 0 1.25rem 0;
  }

  .volume {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .volume x-slider {
    flex: 1;
  }
  .volume .value {
    width: 3rem;
    text-align: right;
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

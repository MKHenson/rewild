import {
  Button,
  Divider,
  Field,
  InfoBox,
  Label,
  Modal,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
  UIChild,
  UIComponent,
  UINode,
  UIRenderer,
} from 'rewild-gpu-ui';
import {
  OutputDevice,
  OutputMedia,
  VOLUME_SETTINGS,
  VolumeSetting,
  canChooseOutputDevice,
  listOutputDevices,
  revealOutputDevices,
} from 'rewild-audio';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import {
  QUALITY_ASPECTS,
  QualityOverrides,
  RenderQuality,
  RenderScale,
} from 'rewild-renderer/lib/utils/RenderQuality';
import { audioSettings } from '../audio/audio';
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
} from './settingsOptions';

export type ThemeChoice = typeof THEME_OPTIONS[number]['value'];

export interface SettingsMenuOptions {
  /** The renderer's quality settings. Apply writes the Display tab to them. */
  quality: QualitySettings;
  /** The stored theme choice. */
  getTheme: () => ThemeChoice;
  /** Stores a theme choice and applies it. */
  setTheme: (theme: ThemeChoice) => void;
  /** Apply, Cancel, Escape or the gamepad's B closed the settings. */
  onClose: () => void;
  /** The browser's media devices. Defaults to `navigator.mediaDevices`. */
  media?: OutputMedia | null;
  /** Whether the browser can choose a device. Defaults to asking the browser. */
  supported?: boolean;
}

/** The width of the label column of each field. */
const LABEL_WIDTH = 180;

/** The content of each tab, with a gutter on the left and right. */
const TAB_CONTENT = {
  padding: [0, 8, 0, 24] as [number, number, number, number],
};

/**
 * The settings that the in-game menu opens, on a glass modal. It shows the
 * same settings as the DOM's `SettingsPanel`, and reads and writes the same
 * stores, so a change in one shows in the other.
 *
 * Each `open` reads the settings again. The Display tab changes nothing
 * until Apply. Audio and the theme change straight away.
 */
export class SettingsMenu {
  private readonly modal: Modal;
  private readonly selects: Select[] = [];
  private readonly level: Select;
  private readonly scale: Select;
  private readonly aspects = new Map<string, Select>();
  private readonly volumes = new Map<
    VolumeSetting,
    { slider: Slider; percent: Label }
  >();
  private readonly mute: Switch;
  private readonly theme: Select;
  private readonly tabs: Tabs;
  private readonly device: OutputDeviceField;
  /** The Display tab's draft, which Apply writes. */
  private draft: {
    level: RenderQuality;
    overrides: QualityOverrides;
    scale: RenderScale;
  };

  constructor(private ui: UIRenderer, private options: SettingsMenuOptions) {
    this.draft = this.readDraft();
    this.modal = new Modal(ui, {
      name: 'settings',
      closeOnBackdrop: false,
      onClose: () => this.close(),
      style: { width: 720, maxWidth: '90%', height: '80%', gap: 16 },
    });

    const select = (
      options: { value: string; label: string }[],
      onChange: (value: string) => void
    ) => {
      const control = new Select(ui, { options, onChange });
      this.selects.push(control);
      return control;
    };
    const field = (label: string, control: UIChild, description?: string) =>
      new Field({ label, control, description, labelWidth: LABEL_WIDTH });

    this.level = select(QUALITY_OPTIONS, (value) => {
      this.draft.level = value as RenderQuality;
      this.draft.overrides = {};
      this.showDraft();
    });
    this.scale = select(SCALE_OPTIONS, (value) => {
      this.draft.scale = Number(value) as RenderScale;
    });
    const aspectFields = QUALITY_ASPECTS.map((aspect) => {
      const control = select(QUALITY_OPTIONS, (value) => {
        const overrides = { ...this.draft.overrides };
        if (value === this.draft.level) delete overrides[aspect];
        else overrides[aspect] = value as RenderQuality;
        this.draft.overrides = overrides;
      });
      this.aspects.set(aspect, control);
      return field(ASPECTS[aspect].label, control, ASPECTS[aspect].description);
    });

    const volumeFields = VOLUME_SETTINGS.map((setting) => {
      const percent = new Label({
        text: '',
        style: { width: 48, textAlign: 'right', flexShrink: 0 },
      });
      const slider = new Slider({
        style: { flexGrow: 1 },
        onChange: (value) => {
          audioSettings.setVolume(setting, value / 100);
          percent.text = `${value}%`;
        },
      });
      this.volumes.set(setting, { slider, percent });
      const row = new Stack({
        direction: 'row',
        style: { alignItems: 'center', height: 32 },
        children: [slider, percent],
      });
      return field(VOLUMES[setting].label, row, VOLUMES[setting].description);
    });
    this.mute = new Switch({
      onChange: (on) => (audioSettings.muteInBackground = on),
    });
    this.device = new OutputDeviceField(
      ui,
      options.media,
      options.supported,
      (control) => this.selects.push(control)
    );

    this.theme = select(THEME_OPTIONS, (value) =>
      this.options.setTheme(value as ThemeChoice)
    );

    this.tabs = new Tabs({
      orientation: 'vertical',
      style: { flexGrow: 1, flexBasis: 0, minHeight: 0 },
      tabs: [
        {
          label: 'Display',
          children: [
            new Stack({
              gap: 'xl',
              style: TAB_CONTENT,
              children: [
                field('Render Quality', this.level, RENDER_QUALITY_DESCRIPTION),
                field('Render Scale', this.scale, RENDER_SCALE_DESCRIPTION),
                new Divider(),
                ...aspectFields,
                new InfoBox({ text: APPLY_NOTE }),
              ],
            }),
          ],
        },
        {
          label: 'Audio',
          children: [
            new Stack({
              gap: 'xl',
              style: TAB_CONTENT,
              children: [
                ...volumeFields,
                new Divider(),
                this.device,
                field(
                  'Mute when in the background',
                  this.mute,
                  'Silences the game while another window has focus.'
                ),
                new InfoBox({
                  text: 'Audio changes apply straight away, without Apply.',
                }),
              ],
            }),
          ],
        },
        {
          label: 'Interface',
          children: [
            new Stack({
              gap: 'xl',
              style: TAB_CONTENT,
              children: [
                field('Theme', this.theme, THEME_DESCRIPTION),
                new InfoBox({
                  text: 'The theme changes straight away, without Apply.',
                }),
              ],
            }),
          ],
        },
      ],
    });

    this.modal.append(
      new Label({
        name: 'title',
        text: 'Settings',
        style: { fontSize: 24, fontWeight: 'bold' },
      }),
      this.tabs,
      new Stack({
        name: 'buttons',
        direction: 'row',
        style: { justifyContent: 'flex-end' },
        children: [
          new Button({
            name: 'cancel',
            label: 'Cancel',
            variant: 'text',
            onClick: () => this.dismiss(),
          }),
          new Button({
            name: 'apply',
            label: 'Apply',
            onClick: () => this.apply(),
          }),
        ],
      })
    );
  }

  get isOpen(): boolean {
    return this.modal.isOpen;
  }

  /** Opening reads the settings again, so it shows changes made elsewhere. */
  set isOpen(open: boolean) {
    if (open === this.isOpen) return;
    if (open) {
      this.read();
      this.device.open();
      this.modal.open();
    } else {
      this.modal.close();
      this.stop();
    }
  }

  dispose(): void {
    this.stop();
    for (const select of this.selects)
      this.ui.removeSurface(select.popup.surface);
    this.ui.removeSurface(this.modal.surface);
  }

  /** Writes the Display tab to the quality settings and closes. */
  private apply(): void {
    const { quality } = this.options;
    quality.apply(this.draft.level, this.draft.overrides);
    quality.renderScale = this.draft.scale;
    this.dismiss();
  }

  private dismiss(): void {
    this.isOpen = false;
    this.options.onClose();
  }

  /** Escape or B closed the modal. */
  private close(): void {
    this.stop();
    this.options.onClose();
  }

  /** Closes the lists and stops watching the devices. */
  private stop(): void {
    this.device.close();
    for (const select of this.selects) select.close();
  }

  private readDraft() {
    const { quality } = this.options;
    return {
      level: quality.level,
      overrides: { ...quality.overrides },
      scale: quality.renderScale,
    };
  }

  /** Shows the stored settings, and starts a new draft from them. */
  private read(): void {
    this.draft = this.readDraft();
    this.showDraft();
    this.scale.value = String(this.draft.scale);
    for (const [setting, { slider, percent }] of this.volumes) {
      slider.value = Math.round(audioSettings.volume(setting) * 100);
      percent.text = `${slider.value}%`;
    }
    this.mute.checked = audioSettings.muteInBackground;
    this.theme.value = this.options.getTheme();
    this.tabs.active = 0;
  }

  /** Shows the draft's tier, and the tier of each aspect. */
  private showDraft(): void {
    const { level, overrides } = this.draft;
    this.level.value = level;
    for (const [aspect, select] of this.aspects)
      select.value = overrides[aspect as keyof QualityOverrides] ?? level;
  }
}

const DEFAULT_DEVICE = 'System default';

/**
 * Picks the device the game plays through, applied and stored at once, as
 * the DOM's `OutputDeviceField`. The browser names devices only after it
 * gives the page the microphone, so with no named devices a button asks
 * for it.
 */
class OutputDeviceField implements UIComponent {
  readonly node: UINode;
  private readonly media: OutputMedia | null;
  private readonly select: Select | null = null;
  private readonly hint: Label;
  private readonly reveal: Button | null = null;
  private devices: OutputDevice[] | null = null;
  private asked: 'no' | 'allowed' | 'refused' = 'no';
  private listening = false;

  constructor(
    ui: UIRenderer,
    media: OutputMedia | null | undefined,
    supported: boolean | undefined,
    addSelect: (select: Select) => void
  ) {
    this.media =
      media !== undefined
        ? media
        : typeof navigator !== 'undefined'
        ? navigator.mediaDevices ?? null
        : null;
    const canChoose = !!this.media && (supported ?? canChooseOutputDevice());
    this.hint = new Label({
      name: 'hint',
      text: '',
      style: { fontSize: 14, color: 'onSurfaceLight' },
    });
    const control = new Stack({ gap: 's' });
    if (canChoose) {
      this.select = new Select(ui, {
        options: [],
        onChange: (id) => this.choose(id),
      });
      addSelect(this.select);
      this.reveal = new Button({
        label: 'Show devices',
        color: 'secondary',
        style: { alignSelf: 'flex-start' },
        onClick: () => this.askToReveal(),
      });
      control.append(this.select, this.hint, this.reveal);
    } else {
      this.hint.text =
        "This browser plays through the system's default device only.";
      this.hint.node.style.minHeight = 32;
      control.append(this.hint);
    }
    this.node = new Field({
      label: 'Output device',
      control,
      labelWidth: LABEL_WIDTH,
    }).node;
    this.show();
  }

  /** Lists the devices, and again each time one connects or goes. */
  open(): void {
    if (!this.select || !this.media || this.listening) return;
    this.listening = true;
    this.media.addEventListener('devicechange', this.refresh);
    this.refresh();
  }

  close(): void {
    if (!this.listening) return;
    this.listening = false;
    this.media!.removeEventListener('devicechange', this.refresh);
  }

  private refresh = async () => {
    try {
      this.devices = await listOutputDevices(this.media!);
    } catch {
      this.devices = [];
    }
    this.show();
  };

  private async askToReveal(): Promise<void> {
    this.asked = (await revealOutputDevices(this.media!))
      ? 'allowed'
      : 'refused';
    await this.refresh();
  }

  private choose(id: string): void {
    const chosen = audioSettings.outputDevice;
    const label =
      this.devices?.find((d) => d.id === id)?.label ??
      (id === chosen.id ? chosen.label : '');
    audioSettings.setOutputDevice({ id, label });
  }

  private show(): void {
    if (!this.select || !this.reveal) return;
    const list = this.devices ?? [];
    const chosen = audioSettings.outputDevice;
    const options = [
      { value: '', label: DEFAULT_DEVICE },
      ...list.map((d) => ({ value: d.id, label: d.label })),
    ];
    if (chosen.id && !list.some((d) => d.id === chosen.id))
      options.push({
        value: chosen.id,
        label: `${chosen.label || 'Chosen device'} (not connected)`,
      });
    this.select.options = options;
    this.select.value = chosen.id;

    const listed = this.devices !== null;
    const none = listed && !list.length;
    this.hint.text =
      none && this.asked === 'allowed'
        ? 'No other devices are connected.'
        : none && this.asked === 'refused'
        ? 'The browser was not allowed to name your devices.'
        : none
        ? 'Your browser names your devices only once the game may use the microphone. The game never records.'
        : 'Speakers or headphones to play the game through.';
    this.reveal.node.style.display =
      none && this.asked !== 'allowed' ? 'flex' : 'none';
  }
}

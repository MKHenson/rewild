import {
  UIInput,
  UINode,
  UIRenderer,
  UISurface,
  UISurfaceOptions,
} from 'rewild-gpu-ui';
import { DEFAULT_VOLUMES } from 'rewild-audio';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { audioSettings } from '../audio/audio';
import { SettingsMenu, SettingsMenuOptions, ThemeChoice } from './SettingsMenu';

const MOUSE = { pointerId: 1, pointerType: 'mouse' as const, button: 0 };

function setup(options: Partial<SettingsMenuOptions> = {}) {
  const surfaces: UISurface[] = [];
  const ui = {
    createSurface(options: UISurfaceOptions) {
      const surface = new UISurface(options);
      surfaces.push(surface);
      return surface;
    },
    removeSurface(surface: UISurface) {
      surfaces.splice(surfaces.indexOf(surface), 1);
    },
  } as unknown as UIRenderer;
  const quality = new QualitySettings();
  let theme: ThemeChoice = 'dark';
  const setTheme = jest.fn((value: ThemeChoice) => (theme = value));
  const onClose = jest.fn();
  const menu = new SettingsMenu(ui, {
    quality,
    getTheme: () => theme,
    setTheme,
    onClose,
    media: null,
    ...options,
  });
  const input = new UIInput({ surfaces });
  const update = () => {
    for (const surface of surfaces) surface.update(1280, 800);
  };
  const escape = () => {
    input.key('down', { key: 'Escape', code: 'Escape' });
    input.key('up', { key: 'Escape', code: 'Escape' });
    update();
  };
  /** Clicks the middle of a node with the mouse. */
  const click = (node: UINode) => {
    const { x, y, width, height } = node.rect;
    const point = { ...MOUSE, x: x + width / 2, y: y + height / 2 };
    input.pointer('down', point);
    input.pointer('up', point);
    update();
  };
  menu.isOpen = true;
  update();
  return { menu, quality, setTheme, onClose, surfaces, escape, click };
}

/** The menu's controls, by the names the menu gives its fields. */
const controls = (menu: SettingsMenu) => ({
  level: menu['level'],
  scale: menu['scale'],
  clouds: menu['aspects'].get('clouds')!,
  master: menu['volumes'].get('master')!,
  mute: menu['mute'],
  theme: menu['theme'],
});

const button = (menu: SettingsMenu, name: string) =>
  menu['modal'].panel.children
    .find((n) => n.name === 'buttons')!
    .children.find((n) => n.name === name)!;

describe('SettingsMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const [setting, volume] of Object.entries(DEFAULT_VOLUMES))
      audioSettings.setVolume(setting as keyof typeof DEFAULT_VOLUMES, volume);
    audioSettings.muteInBackground = true;
  });

  it('shows the stored settings when it opens', () => {
    const stored = new QualitySettings();
    stored.apply('low', { clouds: 'ultra' });
    stored.renderScale = 0.75;
    audioSettings.setVolume('master', 0.4);
    audioSettings.muteInBackground = false;

    const { menu } = setup();
    const c = controls(menu);
    expect(menu.isOpen).toBe(true);
    expect(c.level.value).toBe('low');
    expect(c.clouds.value).toBe('ultra');
    expect(c.scale.value).toBe('0.75');
    expect(c.master.slider.value).toBe(40);
    expect(c.master.percent.text).toBe('40%');
    expect(c.mute.checked).toBe(false);
    expect(c.theme.value).toBe('dark');
  });

  it('changes no quality setting until Apply', () => {
    const { menu, quality, onClose, click } = setup();
    const c = controls(menu);
    c.level.onChange!('low');
    c.scale.onChange!('0.5');
    expect(quality.level).toBe('high');
    expect(quality.renderScale).toBe(1);

    click(button(menu, 'apply'));
    expect(quality.level).toBe('low');
    expect(quality.renderScale).toBe(0.5);
    expect(menu.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets each aspect to a new overall tier, and keeps a pin on Apply', () => {
    const { menu, quality, click } = setup();
    const c = controls(menu);
    c.clouds.onChange!('ultra');
    c.level.onChange!('medium');
    expect(c.clouds.value).toBe('medium');

    c.clouds.onChange!('low');
    click(button(menu, 'apply'));
    expect(quality.level).toBe('medium');
    expect(quality.overrides).toEqual({ clouds: 'low' });
  });

  it('drops the draft on Cancel, and shows the stored settings again', () => {
    const { menu, quality, onClose, click } = setup();
    const c = controls(menu);
    c.level.onChange!('low');
    click(button(menu, 'cancel'));
    expect(menu.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(quality.level).toBe('high');

    menu.isOpen = true;
    expect(c.level.value).toBe('high');
  });

  it('closes with Escape and drops the draft', () => {
    const { menu, quality, onClose, escape } = setup();
    controls(menu).level.onChange!('low');
    escape();
    expect(menu.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(quality.level).toBe('high');
  });

  it('applies audio and the theme straight away', () => {
    const { menu, setTheme } = setup();
    const c = controls(menu);
    c.master.slider.onChange!(25);
    expect(audioSettings.volume('master')).toBe(0.25);
    expect(c.master.percent.text).toBe('25%');

    c.mute.onChange!(false);
    expect(audioSettings.muteInBackground).toBe(false);

    c.theme.onChange!('light');
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('shows a change made elsewhere when it opens again', () => {
    const { menu, quality } = setup();
    menu.isOpen = false;
    quality.apply('ultra');
    audioSettings.setVolume('music', 0.3);
    menu.isOpen = true;
    const c = controls(menu);
    expect(c.level.value).toBe('ultra');
    expect(menu['volumes'].get('music')!.slider.value).toBe(30);
  });

  it('removes its surfaces and the lists on dispose', () => {
    const { menu, surfaces } = setup();
    expect(surfaces.length).toBeGreaterThan(1);
    menu.dispose();
    expect(surfaces).toEqual([]);
  });

  describe('output device', () => {
    function fakeMedia(devices: MediaDeviceInfo[]) {
      const listeners: (() => void)[] = [];
      return {
        enumerateDevices: jest.fn(async () => devices),
        getUserMedia: jest.fn(async () => ({ getTracks: () => [] })),
        addEventListener: jest.fn((_: string, l: () => void) =>
          listeners.push(l)
        ),
        removeEventListener: jest.fn(),
        listeners,
      };
    }
    const device = (deviceId: string, label: string) =>
      ({ kind: 'audiooutput', deviceId, label } as MediaDeviceInfo);

    it('says when the browser cannot choose a device', () => {
      const { menu } = setup({ media: null });
      const field = menu['device'];
      expect(field['select']).toBeNull();
      expect(field['hint'].text).toMatch(/default device only/);
    });

    it('lists the devices when it opens, and watches for changes', async () => {
      const media = fakeMedia([device('a', 'Headphones')]);
      const { menu } = setup({ media: media as any, supported: true });
      await Promise.resolve();
      await Promise.resolve();
      const select = menu['device']['select']!;
      expect(select.options.map((o) => o.label)).toEqual([
        'System default',
        'Headphones',
      ]);
      expect(media.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );

      select.onChange!('a');
      expect(audioSettings.outputDevice).toEqual({
        id: 'a',
        label: 'Headphones',
      });
      audioSettings.setOutputDevice({ id: '', label: '' });

      menu.isOpen = false;
      expect(media.removeEventListener).toHaveBeenCalled();
    });

    it('offers to show devices when the browser names none', async () => {
      const media = fakeMedia([]);
      const { menu } = setup({ media: media as any, supported: true });
      await Promise.resolve();
      await Promise.resolve();
      const field = menu['device'];
      expect(field['reveal']!.node.style.display).toBe('flex');
      expect(field['hint'].text).toMatch(/microphone/);
    });
  });
});

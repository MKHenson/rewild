import {
  UIInput,
  UINode,
  UIRenderer,
  UISurface,
  UISurfaceOptions,
} from 'rewild-gpu-ui';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { audio } from '../audio/audio';
import { GameMenus } from './GameMenus';

function setup() {
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
  const options = {
    quality: new QualitySettings(),
    getTheme: () => 'dark' as const,
    setTheme: jest.fn(),
    onResume: jest.fn(),
    onRestart: jest.fn(),
    onQuit: jest.fn(),
  };
  const menus = new GameMenus(ui, options);
  const input = new UIInput({ surfaces });
  const update = () => {
    for (const surface of surfaces) surface.update(1280, 800);
  };
  /** Clicks the button with this label on the menu that shows. */
  const click = (label: string) => {
    update();
    const surface = surfaces.find((s) => s.input === 'all')!;
    const { x, y, width, height } = findButton(surface.root, label)!.rect;
    const point = { ...MOUSE, x: x + width / 2, y: y + height / 2 };
    input.pointer('down', point);
    input.pointer('up', point);
  };
  const escape = () => {
    update();
    input.key('down', { key: 'Escape', code: 'Escape' });
    input.key('up', { key: 'Escape', code: 'Escape' });
  };
  return { menus, options, surfaces, click, escape };
}

const MOUSE = { pointerId: 1, pointerType: 'mouse' as const, button: 0 };

/** The node of a `Button` whose label has this text. */
function findButton(node: UINode, label: string): UINode | null {
  if (node.children.some((child) => child.text === label)) return node;
  for (const child of node.children) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

/** The surface that takes all input, which is the menu that shows. */
const shown = (surfaces: UISurface[]) =>
  surfaces.filter((s) => s.input === 'all').map((s) => s.name);

const opacity = (surfaces: UISurface[], name: string) =>
  surfaces.find((s) => s.name === name)!.root.style.opacity;

describe('GameMenus', () => {
  let duck: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    duck = jest.spyOn(audio, 'duckWorld');
  });
  afterEach(() => {
    duck.mockRestore();
    jest.useRealTimers();
  });

  it('starts in play, with no menu', () => {
    const { menus, surfaces } = setup();
    expect(menus.state).toBe('playing');
    expect(shown(surfaces)).toEqual([]);
  });

  it('opens the menu and dims the world sound', () => {
    const { menus, surfaces } = setup();
    menus.openMenu();
    expect(menus.state).toBe('menu');
    expect(shown(surfaces)).toEqual(['in-game-menu']);
    expect(duck.mock.calls).toEqual([[true]]);
  });

  it('goes to settings and back without lifting the dim', () => {
    const { menus, surfaces, click, escape } = setup();
    menus.openMenu();
    click('Settings');
    expect(menus.state).toBe('settings');
    expect(shown(surfaces)).toEqual(['settings']);
    escape();
    expect(menus.state).toBe('menu');
    expect(shown(surfaces)).toEqual(['in-game-menu']);
    expect(duck.mock.calls).toEqual([[true]]);
  });

  it('resumes play and gives the pointer back', () => {
    const { menus, options, surfaces, click } = setup();
    menus.openMenu();
    click('Resume');
    expect(menus.state).toBe('playing');
    expect(shown(surfaces)).toEqual([]);
    expect(options.onResume).toHaveBeenCalledTimes(1);
    expect(duck.mock.calls).toEqual([[true], [false]]);
  });

  it('closes on Escape, and leaves the pointer free', () => {
    const { menus, options, escape } = setup();
    menus.openMenu();
    escape();
    expect(menus.state).toBe('playing');
    expect(options.onResume).not.toHaveBeenCalled();
  });

  it('opens nothing over another menu', () => {
    const { menus, click } = setup();
    menus.openMenu();
    click('Settings');
    menus.openMenu();
    expect(menus.state).toBe('settings');
  });

  it('shows game over, and stays on it', () => {
    const { menus, surfaces } = setup();
    menus.openMenu();
    menus.showGameOver();
    expect(menus.state).toBe('gameOver');
    expect(shown(surfaces)).toEqual([]);
    expect(duck.mock.calls).toEqual([[true], [false]]);

    menus.openMenu();
    expect(menus.state).toBe('gameOver');
    jest.runAllTimers();
    expect(shown(surfaces)).toEqual(['game-over']);
  });

  it('quits from the menu', () => {
    const { menus, options, click } = setup();
    menus.openMenu();
    click('Quit');
    expect(options.onQuit).toHaveBeenCalledTimes(1);
  });

  it('restarts from game over', () => {
    const { menus, options, click } = setup();
    menus.showGameOver();
    jest.runAllTimers();
    click('Restart');
    expect(options.onRestart).toHaveBeenCalledTimes(1);
  });

  it('restarts from the menu', () => {
    const { menus, options, click } = setup();
    menus.openMenu();
    click('Restart');
    expect(options.onRestart).toHaveBeenCalledTimes(1);
  });

  it('covers game over with the loading screen, then plays with nothing shown', () => {
    const { menus, surfaces } = setup();
    menus.showGameOver();
    jest.runAllTimers();
    expect(shown(surfaces)).toEqual(['game-over']);

    menus.showLoading();
    expect(menus.state).toBe('loading');
    expect(shown(surfaces)).toEqual([]);
    expect(opacity(surfaces, 'loading')).toBe(1);

    menus.openMenu();
    expect(menus.state).toBe('loading');

    menus.play();
    expect(menus.state).toBe('playing');
    expect(shown(surfaces)).toEqual([]);
    expect(opacity(surfaces, 'loading')).toBe(0);
    menus.showGameOver();
    jest.runAllTimers();
    expect(shown(surfaces)).toEqual(['game-over']);
  });

  it('does not show the game over options after a restart', () => {
    const { menus, surfaces } = setup();
    menus.showGameOver();
    menus.showLoading();
    menus.play();
    jest.runAllTimers();
    expect(shown(surfaces)).toEqual([]);
  });

  it('lifts the dim when a load covers the menu', () => {
    const { menus } = setup();
    menus.openMenu();
    menus.showLoading();
    expect(duck.mock.calls).toEqual([[true], [false]]);
  });

  it('quits from a load error', () => {
    const { menus, options, surfaces, click } = setup();
    menus.showLoading();
    menus.showLoadError('Not found');
    expect(menus.state).toBe('loadError');
    expect(shown(surfaces)).toEqual(['load-error']);
    click('Main Menu');
    expect(options.onQuit).toHaveBeenCalledTimes(1);
  });

  it('removes its surfaces and lifts the dim on dispose', () => {
    const { menus, surfaces } = setup();
    menus.openMenu();
    menus.dispose();
    expect(surfaces).toEqual([]);
    expect(duck.mock.calls).toEqual([[true], [false]]);
  });
});

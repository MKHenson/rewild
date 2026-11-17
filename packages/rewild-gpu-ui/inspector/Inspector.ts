import {
  CanvasResize,
  observeCanvasSize,
  UICanvas,
  UIFont,
  UIIcons,
  UIRenderer,
  UISurface,
} from '../lib';
import { parseComputedColor } from './cssColor';
import { mirrorTree } from './domMirror';
import { Example, ExampleRegistry } from './registry';
import {
  InspectorSettings,
  PIXEL_RATIOS,
  PixelRatioChoice,
  resolvePixelRatio,
  saveSettings,
} from './settings';

const DEFAULT_HEIGHT = 240;
const LOG_LINES = 40;

/** One example, drawn by Mica on the left and as DOM elements on the right. */
class ExampleCard {
  readonly element: HTMLElement;
  readonly canvas: UICanvas;
  private renderer: UIRenderer;
  private surface: UISurface;
  private micaPane: HTMLElement;
  private micaCaption: HTMLElement;
  private stopObserving: () => void;
  private size: CanvasResize | null = null;
  private animate: ((seconds: number) => void) | null;

  constructor(
    device: GPUDevice,
    font: UIFont,
    icons: UIIcons,
    example: Example,
    private getPixelRatio: () => number,
    private requestDraw: () => void
  ) {
    this.element = el('section', 'example');
    const title = el('h2');
    title.textContent = example.name;
    this.element.append(title);
    if (example.description) {
      const description = el('p', 'description');
      description.textContent = example.description;
      this.element.append(description);
    }

    const sides = el('div', 'sides');
    const height = `${example.height ?? DEFAULT_HEIGHT}px`;

    const mica = el('figure', 'side');
    this.micaPane = el('div', 'pane');
    this.micaPane.style.height = height;
    const canvasElement = el('canvas') as HTMLCanvasElement;
    this.micaPane.append(canvasElement);
    this.micaCaption = el('figcaption');
    mica.append(this.micaPane, this.micaCaption);

    const dom = el('figure', 'side');
    const domPane = el('div', example.log ? 'pane log' : 'pane');
    domPane.style.height = height;
    const domCaption = el('figcaption');
    domCaption.textContent = example.log ? 'Events, the newest first' : 'DOM';
    dom.append(domPane, domCaption);

    sides.append(mica, dom);
    this.element.append(sides);

    this.canvas = new UICanvas(device, canvasElement);
    this.renderer = new UIRenderer(device, this.canvas.format);
    this.renderer.font = font;
    this.renderer.icons = icons;
    // Focus on the canvas sends keys to it.
    canvasElement.tabIndex = 0;
    this.renderer.input.attach(canvasElement);
    this.renderer.input.onDispatch = () => requestDraw();
    this.surface = this.renderer.createSurface({
      kind: 'screen',
      name: example.name,
    });
    const log = (line: string) => {
      if (!example.log) return;
      const entry = el('div');
      entry.textContent = line;
      domPane.prepend(entry);
      while (domPane.childElementCount > LOG_LINES) domPane.lastChild!.remove();
    };
    this.animate =
      example.build({ surface: this.surface, canvas: canvasElement, log }) ??
      null;
    if (!example.log) domPane.append(mirrorTree(this.surface.root));

    this.stopObserving = observeCanvasSize(canvasElement, (size) => {
      this.size = size;
      this.resize();
    });
  }

  get animated(): boolean {
    return this.animate !== null;
  }

  showLayout(show: boolean): void {
    this.surface.showLayout = show;
    this.requestDraw();
  }

  resize(): void {
    if (!this.size) return;
    const { cssWidth, cssHeight, devicePixels } = this.size;
    const ratio = this.getPixelRatio();
    // At the screen's own ratio, the exact device pixels map 1:1 to the
    // screen. Another ratio is resampled on purpose.
    const exact = ratio === window.devicePixelRatio ? devicePixels : null;
    this.canvas.resize(cssWidth, cssHeight, ratio, exact ?? undefined);
    this.requestDraw();
  }

  draw(): void {
    this.animate?.(performance.now() / 1000);
    const { canvas, context, device, pixelRatio } = this.canvas;
    const background = getComputedStyle(this.micaPane).backgroundColor;
    const encoder = device.createCommandEncoder({ label: 'inspector' });
    this.renderer.render(
      encoder,
      context.getCurrentTexture().createView(),
      { width: canvas.width, height: canvas.height, pixelRatio },
      parseComputedColor(background)
    );
    device.queue.submit([encoder.finish()]);
    const calls = this.renderer.drawCalls;
    this.micaCaption.textContent = `Mica · ${canvas.width} × ${
      canvas.height
    } px at ${pixelRatio}x · ${calls} draw call${calls === 1 ? '' : 's'}`;
  }

  dispose(): void {
    this.stopObserving();
    this.renderer.dispose();
    this.canvas.dispose();
  }
}

export class Inspector {
  private cards: ExampleCard[] = [];
  private drawPending = false;
  private part = '';
  private stopWatchingScreen: () => void = () => {};

  constructor(
    private device: GPUDevice,
    private font: UIFont,
    private icons: UIIcons,
    private registry: ExampleRegistry,
    private settings: InspectorSettings,
    private nav: HTMLElement,
    private tools: HTMLElement,
    private main: HTMLElement
  ) {
    this.buildTools();
    this.applyTheme();
    this.watchScreenRatio();
    window.addEventListener('hashchange', () => this.showPart(this.hashPart()));
    this.showPart(this.hashPart());
  }

  private hashPart(): string {
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const parts = this.registry.parts();
    return parts.includes(fromHash) ? fromHash : parts[0] ?? '';
  }

  private showPart(part: string): void {
    this.part = part;
    this.buildNav();
    for (const card of this.cards) card.dispose();
    this.main.replaceChildren();
    this.cards = this.registry.examples(part).map(
      (example) =>
        new ExampleCard(
          this.device,
          this.font,
          this.icons,
          example,
          () => resolvePixelRatio(this.settings.pixelRatio),
          () => this.requestDraw()
        )
    );
    for (const card of this.cards) card.showLayout(this.settings.layoutOverlay);
    const heading = el('h1');
    heading.textContent = part;
    this.main.append(heading, ...this.cards.map((card) => card.element));
  }

  private buildNav(): void {
    this.nav.replaceChildren(
      ...this.registry.parts().map((part) => {
        const link = el('a') as HTMLAnchorElement;
        link.href = `#${encodeURIComponent(part)}`;
        link.textContent = `${part} (${this.registry.examples(part).length})`;
        link.classList.toggle('active', part === this.part);
        return link;
      })
    );
  }

  private buildTools(): void {
    const theme = select(
      'Theme',
      [
        ['dark', 'Dark'],
        ['light', 'Light'],
      ],
      this.settings.theme,
      (value) => {
        this.settings.theme = value === 'light' ? 'light' : 'dark';
        this.applyTheme();
      }
    );
    const ratio = select(
      'Pixel ratio',
      PIXEL_RATIOS.map((r) => [String(r), r === 'screen' ? 'Screen' : `${r}x`]),
      String(this.settings.pixelRatio),
      (value) => {
        this.settings.pixelRatio = (
          value === 'screen' ? 'screen' : Number(value)
        ) as PixelRatioChoice;
        saveSettings(this.settings);
        this.resizeAll();
      }
    );
    const overlay = checkbox(
      'Layout overlay',
      this.settings.layoutOverlay,
      (checked) => {
        this.settings.layoutOverlay = checked;
        saveSettings(this.settings);
        for (const card of this.cards) card.showLayout(checked);
      }
    );
    this.tools.replaceChildren(theme, ratio, overlay);
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    saveSettings(this.settings);
    this.requestDraw();
  }

  /** A `screen` ratio changes when the window moves to another display or zooms. */
  private watchScreenRatio(): void {
    this.stopWatchingScreen();
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      this.watchScreenRatio();
      if (this.settings.pixelRatio === 'screen') this.resizeAll();
    };
    query.addEventListener('change', onChange, { once: true });
    this.stopWatchingScreen = () =>
      query.removeEventListener('change', onChange);
  }

  private resizeAll(): void {
    for (const card of this.cards) card.resize();
  }

  private requestDraw(): void {
    if (this.drawPending) return;
    this.drawPending = true;
    requestAnimationFrame(() => {
      this.drawPending = false;
      for (const card of this.cards) card.draw();
      if (this.cards.some((card) => card.animated)) this.requestDraw();
    });
  }
}

function el(tag: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function select(
  label: string,
  options: [string, string][],
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  const wrapper = el('label', 'tool');
  const text = el('span');
  text.textContent = label;
  const input = el('select') as HTMLSelectElement;
  for (const [optionValue, optionLabel] of options) {
    const option = el('option') as HTMLOptionElement;
    option.value = optionValue;
    option.textContent = optionLabel;
    input.append(option);
  }
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  wrapper.append(text, input);
  return wrapper;
}

function checkbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): HTMLElement {
  const wrapper = el('label', 'tool check');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = el('span');
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

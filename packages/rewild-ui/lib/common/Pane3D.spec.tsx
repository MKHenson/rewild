import '../../compiler/jsx';
import { Pane3D } from './Pane3D';

type Pane3DOptions = NonNullable<ConstructorParameters<typeof Pane3D>[0]>;
type Pane3DProps = Pane3DOptions['props'];

// jsdom does not implement ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('Pane3D', () => {
  it('renders a canvas element inside shadow DOM', () => {
    const props: Pane3DProps = { onCanvasReady: jest.fn() };
    const pane = new Pane3D({ props });

    pane._createRenderer();
    pane.render();

    const canvas = pane.shadow?.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('exposes canvas via canvas() getter', () => {
    const props: Pane3DProps = { onCanvasReady: jest.fn() };
    const pane = new Pane3D({ props });

    pane._createRenderer();
    pane.render();

    expect(pane.canvas()).toBeInstanceOf(HTMLCanvasElement);
  });

  it('wraps canvas in a div', () => {
    const props: Pane3DProps = { onCanvasReady: jest.fn() };
    const pane = new Pane3D({ props });

    pane._createRenderer();
    pane.render();

    const div = pane.shadow?.querySelector('div');
    expect(div).not.toBeNull();
    expect(div?.querySelector('canvas')).not.toBeNull();
  });
});

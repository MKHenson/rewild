/**
 * @jest-environment jsdom
 */
import { UIInput } from './UIInput';
import { UISurface } from './UISurface';

describe('UIInput attach', () => {
  it('takes input from a canvas in a shadow root', () => {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.attachShadow({ mode: 'open' }).append(canvas);
    document.body.append(host);
    const surface = new UISurface({
      kind: 'screen',
      name: 'menu',
      input: 'all',
    });
    surface.update(200, 200);
    const input = new UIInput({ surfaces: [surface] });
    const downs: string[] = [];
    surface.root.on('pointerdown', () => downs.push('ui'));
    host.addEventListener('pointerdown', () => downs.push('game'));
    input.attach(canvas);

    // jsdom has no PointerEvent. The input reads only the mouse fields.
    canvas.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: 10,
        clientY: 10,
      })
    );
    expect(downs).toEqual(['ui']);
    input.detach();
    host.remove();
  });
});

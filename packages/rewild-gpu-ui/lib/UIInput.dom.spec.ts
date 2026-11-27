/**
 * @jest-environment jsdom
 */
import { UICarry } from './UICarry';
import { UIInput } from './UIInput';
import { UINode } from './UINode';
import { UISurface, UISurfaceOptions } from './UISurface';

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

  it('returns the carried item on a press on another element', () => {
    const canvas = document.createElement('canvas');
    const other = document.createElement('button');
    document.body.append(canvas, other);
    const surfaces: UISurface[] = [];
    const host = {
      surfaces,
      createSurface(options: UISurfaceOptions) {
        const surface = new UISurface(options);
        surfaces.push(surface);
        return surface;
      },
    };
    const menu = host.createSurface({ kind: 'screen', name: 'menu' });
    const slot = new UINode({ style: { width: 20, height: 20 } });
    menu.root.append(slot);
    menu.update(200, 200);
    const input = new UIInput(host);
    const carry = new UICarry(host, input);
    let item: string | null = 'shape';
    carry.slot<string>(slot, {
      take: () => {
        const taken = item;
        item = null;
        return taken;
      },
      put: (given) => {
        item = given;
        return null;
      },
    });
    const returned = jest.fn();
    carry.onReturn = returned;
    input.attach(canvas);
    carry.press(slot, false);
    expect(carry.held).toBe('shape');

    const pressed = jest.fn();
    other.addEventListener('pointerdown', pressed);
    other.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, composed: true })
    );
    expect(returned).toHaveBeenCalledWith(
      'shape',
      expect.anything(),
      'outside'
    );
    expect(carry.held).toBeNull();
    expect(pressed).toHaveBeenCalled();
    input.detach();
    canvas.remove();
    other.remove();
  });
});

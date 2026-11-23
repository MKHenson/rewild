import { UIInput } from '../UIInput';
import { UISurface } from '../UISurface';
import { Button } from './Button';

const MOUSE = { pointerId: 1, pointerType: 'mouse' as const };

function setup(button: Button) {
  const surface = new UISurface({ kind: 'screen', name: 'menu', input: 'all' });
  button.node.style.position = 'absolute';
  button.node.style.width = 100;
  surface.root.append(button);
  surface.update(200, 200);
  const input = new UIInput({ surfaces: [surface] });
  return { surface, input };
}

describe('Button', () => {
  it('lights on hover and darkens and dips on a press', () => {
    const button = new Button({ label: 'Resume' });
    const { input } = setup(button);
    const style = button.node.style;
    expect(style.backgroundColor).toBe('primary400');

    input.pointer('move', { ...MOUSE, x: 10, y: 10 });
    expect(style.backgroundColor).toBe('primary500');
    expect(style.color).toBe('onPrimary500');

    input.pointer('down', { ...MOUSE, x: 10, y: 10, button: 0 });
    expect(style.backgroundColor).toBe('primary600');
    expect(style.transform).toEqual({ y: 1 });

    input.pointer('up', { ...MOUSE, x: 10, y: 10, button: 0 });
    expect(style.backgroundColor).toBe('primary500');
    expect(style.transform).toBeUndefined();

    input.pointer('move', { ...MOUSE, x: 150, y: 150 });
    expect(style.backgroundColor).toBe('primary400');
  });

  it('has no fill as a text button, and a wash of its colour on hover', () => {
    const button = new Button({ label: 'Cancel', variant: 'text' });
    const { input } = setup(button);
    const style = button.node.style;
    expect(style.backgroundColor).toEqual({ theme: 'primaryText', alpha: 0 });
    expect(style.color).toBe('onSurface');
    expect(style.boxShadow).toBeUndefined();

    input.pointer('move', { ...MOUSE, x: 10, y: 10 });
    expect(style.backgroundColor).toEqual({
      theme: 'primaryText',
      alpha: 0.08,
    });
    expect(style.color).toBe('primaryText');

    input.pointer('down', { ...MOUSE, x: 10, y: 10, button: 0 });
    expect(style.backgroundColor).toEqual({
      theme: 'primaryText',
      alpha: 0.14,
    });
    expect(style.transform).toEqual({ y: 1 });
  });

  it('calls onClick on a click and on Enter', () => {
    const onClick = jest.fn();
    const button = new Button({ label: 'Quit', onClick });
    const { input } = setup(button);
    input.pointer('down', { ...MOUSE, x: 10, y: 10, button: 0 });
    input.pointer('up', { ...MOUSE, x: 10, y: 10, button: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.node.focused).toBe(true);

    input.key('down', { key: 'Enter', code: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('takes no input and no focus when disabled', () => {
    const onClick = jest.fn();
    const button = new Button({ label: 'Quit', onClick, disabled: true });
    const { input, surface } = setup(button);
    input.pointer('down', { ...MOUSE, x: 10, y: 10, button: 0 });
    input.pointer('up', { ...MOUSE, x: 10, y: 10, button: 0 });
    input.key('down', { key: 'ArrowDown', code: 'ArrowDown' });
    expect(onClick).not.toHaveBeenCalled();
    expect(surface.focused).toBeNull();
    expect(button.node.style.opacity).toBe(0.65);
  });

  it('puts the icon before the label', () => {
    const button = new Button({ label: 'Settings', icon: 'settings' });
    const [icon, label] = button.node.children;
    expect(icon.icon).toBe('settings');
    expect(label.text).toBe('Settings');
  });
});

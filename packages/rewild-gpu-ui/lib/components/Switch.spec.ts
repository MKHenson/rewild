import { Switch } from './Switch';
import { formSetup, PAD } from './testing';

describe('Switch', () => {
  it('turns on a click, Enter and Space, and calls onChange', () => {
    const onChange = jest.fn();
    const toggle = new Switch({ onChange });
    const { click, key, update } = formSetup(toggle);
    update();
    expect(toggle.node.rect).toMatchObject({ width: 44, height: 32 });

    click(10, 10);
    expect(toggle.checked).toBe(true);
    expect(toggle.node.focused).toBe(true);
    key('Enter');
    expect(toggle.checked).toBe(false);
    key(' ');
    expect(toggle.checked).toBe(true);
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("turns on the gamepad's A", () => {
    const toggle = new Switch();
    const { pad } = formSetup(toggle);
    pad(PAD.DOWN, PAD.A);
    expect(toggle.node.focused).toBe(true);
    expect(toggle.checked).toBe(true);
  });

  it('moves its thumb and fills its track when on', () => {
    const toggle = new Switch();
    const [track] = toggle.node.children;
    const [thumb] = track.children;
    expect(track.style.borderColor).toBe('onSurfaceLight');
    expect(thumb.style.transform).toBeUndefined();
    toggle.checked = true;
    expect(track.style.backgroundColor).toBe('primary400');
    expect(thumb.style.backgroundColor).toBe('onPrimary400');
    expect(thumb.style.transform).toEqual({ x: 17 });
  });

  it('calls no onChange when set from outside', () => {
    const onChange = jest.fn();
    const toggle = new Switch({ onChange });
    toggle.checked = true;
    expect(toggle.checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes no input and no focus when disabled', () => {
    const onChange = jest.fn();
    const toggle = new Switch({ onChange, disabled: true });
    const { menu, click, pad } = formSetup(toggle);
    click(10, 10);
    pad(PAD.DOWN, PAD.A);
    expect(onChange).not.toHaveBeenCalled();
    expect(menu.focused).toBeNull();
    expect(toggle.node.style.opacity).toBe(0.5);
  });
});

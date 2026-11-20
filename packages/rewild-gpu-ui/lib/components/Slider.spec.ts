import { Button } from './Button';
import { Slider, SliderOptions } from './Slider';
import { formSetup, MOUSE, PAD } from './testing';

/** A slider 214 px wide, so its track is 200 px from x 7. */
function setup(options: SliderOptions = {}) {
  const onChange = jest.fn();
  const onChangeComplete = jest.fn();
  const slider = new Slider({
    onChange,
    onChangeComplete,
    ...options,
    style: { width: 214 },
  });
  const below = new Button({ label: 'Below' });
  const form = formSetup(slider, below);
  form.update();
  return { ...form, slider, below, onChange, onChangeComplete };
}

describe('Slider', () => {
  it('fills its track to the value', () => {
    const { slider, update } = setup({ value: 25 });
    const [track] = slider.node.children;
    const [fill, thumb] = track.children;
    expect(track.rect).toMatchObject({ x: 7, width: 200 });
    expect(fill.rect.width).toBe(50);
    expect(thumb.rect.x + thumb.rect.width / 2).toBe(57);
    slider.value = 100;
    update();
    expect(fill.rect.width).toBe(200);
  });

  it('jumps to a press and follows a drag off its track', () => {
    const { slider, input, onChange, onChangeComplete } = setup();
    input.pointer('down', { ...MOUSE, x: 107, y: 10 });
    expect(slider.value).toBe(50);
    expect(slider.node.focused).toBe(true);
    input.pointer('move', { ...MOUSE, x: 157, y: 200 });
    expect(slider.value).toBe(75);
    input.pointer('move', { ...MOUSE, x: 390, y: 200 });
    expect(slider.value).toBe(100);
    input.pointer('move', { ...MOUSE, x: -50, y: -50 });
    expect(slider.value).toBe(0);
    expect(onChangeComplete).not.toHaveBeenCalled();
    input.pointer('up', { ...MOUSE, x: -50, y: -50 });
    expect(onChange.mock.calls).toEqual([[50], [75], [100], [0]]);
    expect(onChangeComplete.mock.calls).toEqual([[0]]);
    // The drag is over.
    input.pointer('move', { ...MOUSE, x: 157, y: 10 });
    expect(slider.value).toBe(0);
  });

  it('snaps to its step with no float noise', () => {
    const { slider, input } = setup({ min: 0, max: 1, step: 0.1 });
    input.pointer('down', { ...MOUSE, x: 7 + 200 * 0.33, y: 10 });
    expect(slider.value).toBe(0.3);
  });

  it('steps with the left and right arrows, and goes to the ends', () => {
    const { slider, key, onChange, onChangeComplete } = setup({ value: 50 });
    slider.node.focus();
    key('ArrowRight');
    expect(slider.value).toBe(51);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(slider.value).toBe(49);
    key('PageUp');
    expect(slider.value).toBe(59);
    key('End');
    expect(slider.value).toBe(100);
    key('ArrowRight');
    key('Home');
    expect(slider.value).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(6);
    expect(onChangeComplete).toHaveBeenCalledTimes(7);
  });

  it('steps with the d-pad, and moves focus up and down', () => {
    const { slider, below, pad } = setup({ value: 50 });
    pad(PAD.DOWN);
    expect(slider.node.focused).toBe(true);
    pad(PAD.RIGHT, PAD.RIGHT, PAD.LEFT);
    expect(slider.value).toBe(51);
    pad(PAD.DOWN);
    expect(below.node.focused).toBe(true);
    expect(slider.value).toBe(51);
  });

  it('clamps a value set from outside, with no onChange', () => {
    const { slider, onChange } = setup({ min: 10, max: 20 });
    expect(slider.value).toBe(10);
    slider.value = 50;
    expect(slider.value).toBe(20);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes no input and no focus when disabled', () => {
    const { slider, input, key, onChange } = setup({ disabled: true });
    input.pointer('down', { ...MOUSE, x: 107, y: 10 });
    input.pointer('up', { ...MOUSE, x: 107, y: 10 });
    slider.node.focus();
    key('ArrowRight');
    expect(slider.node.focused).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

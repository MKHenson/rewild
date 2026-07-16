import '../../compiler/jsx';
import { Slider } from './Slider';
import { fireEvent } from '../test-utils';

type SliderOptions = NonNullable<ConstructorParameters<typeof Slider>[0]>;
type SliderProps = SliderOptions['props'];

// jsdom reports a zero-sized layout, so give the track a known geometry that
// pointer maths can be asserted against: 100px wide starting at x = 0.
function createSlider(props: SliderProps) {
  const slider = new Slider({ props });
  slider._createRenderer();
  slider.render();

  const track = slider.shadow?.querySelector('.track') as HTMLDivElement;
  track.getBoundingClientRect = () =>
    ({ left: 0, width: 100, top: 0, height: 4 } as DOMRect);

  return slider;
}

function pointerAt(type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX });
  return event;
}

describe('Slider', () => {
  it('renders a track, fill and thumb', () => {
    const slider = createSlider({ value: 50 });

    expect(slider.shadow?.querySelector('.track')).not.toBeNull();
    expect(slider.shadow?.querySelector('.fill')).not.toBeNull();
    expect(slider.shadow?.querySelector('.thumb')).not.toBeNull();
  });

  it('positions the fill and thumb at the value ratio', () => {
    const slider = createSlider({ value: 25, min: 0, max: 100 });

    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;
    const thumb = slider.shadow?.querySelector('.thumb') as HTMLDivElement;
    expect(fill.style.width).toBe('25%');
    expect(thumb.style.left).toBe('25%');
  });

  it('maps the value ratio against a non-zero min', () => {
    const slider = createSlider({ value: 5, min: 0, max: 20 });

    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;
    expect(fill.style.width).toBe('25%');
  });

  it('clamps a value above max', () => {
    const slider = createSlider({ value: 150, min: 0, max: 100 });

    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;
    expect(fill.style.width).toBe('100%');
    expect(slider.shadow?.querySelector('.slider')?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('clamps a value below min', () => {
    const slider = createSlider({ value: -20, min: 0, max: 100 });

    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;
    expect(fill.style.width).toBe('0%');
    expect(slider.shadow?.querySelector('.slider')?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('reports the value under the pointer on press', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 0, min: 0, max: 100, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointerdown', 30));

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('updates the DOM during a drag without a re-render', async () => {
    const slider = createSlider({ value: 0, min: 0, max: 100 });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;

    await fireEvent(elm, pointerAt('pointerdown', 10));
    await fireEvent(elm, pointerAt('pointermove', 80));

    expect(fill.style.width).toBe('80%');
  });

  // Parents typically re-render in response to onChange, pushing the new value
  // straight back down while the pointer is still held.
  it('continues a drag across a re-render', async () => {
    const onChange = jest.fn();
    const props: SliderProps = { value: 0, min: 0, max: 100, onChange };
    const slider = createSlider(props);

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;

    await fireEvent(elm, pointerAt('pointerdown', 10));
    props!.value = 10;
    slider.render();
    await fireEvent(elm, pointerAt('pointermove', 70));

    expect(onChange).toHaveBeenLastCalledWith(70);
    expect(fill.style.width).toBe('70%');
  });

  it('ignores pointer moves that did not start with a press', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 0, min: 0, max: 100, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointermove', 80));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('snaps values to the step', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 0, min: 0, max: 1, step: 0.05, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointerdown', 42));

    // 0.42 snaps to the nearest 0.05 and stays free of float noise.
    expect(onChange).toHaveBeenCalledWith(0.4);
  });

  it('clamps pointer positions outside the track', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 50, min: 0, max: 100, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointerdown', 500));

    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('reports the final value once when a drag ends', async () => {
    const onChangeComplete = jest.fn();
    const slider = createSlider({ value: 0, max: 100, onChangeComplete });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointerdown', 10));
    await fireEvent(elm, pointerAt('pointermove', 60));
    await fireEvent(elm, pointerAt('pointerup', 60));

    expect(onChangeComplete).toHaveBeenCalledTimes(1);
    expect(onChangeComplete).toHaveBeenCalledWith(60);
  });

  it('steps the value with the arrow keys', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 50, min: 0, max: 100, step: 5, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(onChange).toHaveBeenCalledWith(55);
  });

  it('jumps to the bounds with Home and End', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 50, min: 10, max: 90, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, new KeyboardEvent('keydown', { key: 'Home' }));
    expect(onChange).toHaveBeenCalledWith(10);

    await fireEvent(elm, new KeyboardEvent('keydown', { key: 'End' }));
    expect(onChange).toHaveBeenCalledWith(90);
  });

  it('does not respond when disabled', async () => {
    const onChange = jest.fn();
    const slider = createSlider({ value: 50, disabled: true, onChange });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    await fireEvent(elm, pointerAt('pointerdown', 80));
    await fireEvent(elm, new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(elm.className).toContain('disabled');
  });

  describe('value accessor', () => {
    it('reports the rendered value', () => {
      const slider = createSlider({ value: 30, min: 0, max: 100 });
      expect(slider.value).toBe(30);
    });

    it('reports the value reached by a drag', async () => {
      const slider = createSlider({ value: 0, min: 0, max: 100 });

      const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
      await fireEvent(elm, pointerAt('pointerdown', 65));

      expect(slider.value).toBe(65);
    });

    it('paints the new value without a render', () => {
      const slider = createSlider({ value: 0, min: 0, max: 100 });
      const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;
      const thumb = slider.shadow?.querySelector('.thumb') as HTMLDivElement;

      const render = jest.spyOn(slider, 'render');
      slider.value = 40;

      expect(render).not.toHaveBeenCalled();
      expect(fill.style.width).toBe('40%');
      expect(thumb.style.left).toBe('40%');
      expect(slider.value).toBe(40);
    });

    it('does not report a programmatic set as a change', () => {
      const onChange = jest.fn();
      const onChangeComplete = jest.fn();
      const slider = createSlider({ value: 0, onChange, onChangeComplete });

      slider.value = 40;

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeComplete).not.toHaveBeenCalled();
    });

    it('clamps an assigned value to the range', () => {
      const slider = createSlider({ value: 5, min: 0, max: 10 });

      slider.value = 50;
      expect(slider.value).toBe(10);

      slider.value = -50;
      expect(slider.value).toBe(0);
    });

    // Without this, any later render would repaint from a stale prop and
    // visually revert the assignment.
    it('survives a subsequent render', () => {
      const slider = createSlider({ value: 0, min: 0, max: 100 });
      const fill = slider.shadow?.querySelector('.fill') as HTMLDivElement;

      slider.value = 40;
      slider.render();

      expect(fill.style.width).toBe('40%');
      expect(slider.value).toBe(40);
    });

    it('is the baseline for a subsequent keyboard step', async () => {
      const onChange = jest.fn();
      const slider = createSlider({ value: 0, min: 0, max: 100, step: 5, onChange });

      slider.value = 40;
      const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
      await fireEvent(elm, new KeyboardEvent('keydown', { key: 'ArrowRight' }));

      expect(onChange).toHaveBeenCalledWith(45);
    });
  });

  it('exposes the range through aria attributes', () => {
    const slider = createSlider({ value: 5, min: 2, max: 20 });

    const elm = slider.shadow?.querySelector('.slider') as HTMLDivElement;
    expect(elm.getAttribute('role')).toBe('slider');
    expect(elm.getAttribute('aria-valuemin')).toBe('2');
    expect(elm.getAttribute('aria-valuemax')).toBe('20');
    expect(elm.getAttribute('aria-valuenow')).toBe('5');
  });
});

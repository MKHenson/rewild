import '../../compiler/jsx';
import { CircularProgress } from './CircularProgress';

type CircularProgressOptions = NonNullable<
  ConstructorParameters<typeof CircularProgress>[0]
>;
type CircularProgressProps = CircularProgressOptions['props'];

describe('CircularProgress', () => {
  it('renders SVG with two circles', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: 50,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const svg = cp.shadow?.querySelector('svg');
    expect(svg).not.toBeNull();

    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBe(2);
  });

  it('renders label section with current value', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: 75,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const label = cp.shadow?.querySelector('.label-section');
    expect(label).not.toBeNull();
    expect(label?.innerHTML).toBe('75');
  });

  it('clamps value below 0 to 0', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: -20,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const label = cp.shadow?.querySelector('.label-section');
    expect(label?.innerHTML).toBe('0');
  });

  it('clamps value above 100 to 100', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: 150,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const label = cp.shadow?.querySelector('.label-section');
    expect(label?.innerHTML).toBe('100');
  });

  it('uses red-yellow gradient when value is below 50', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: 30,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const stop1 = cp.shadow?.querySelector('.stop1');
    const stop2 = cp.shadow?.querySelector('.stop2');
    expect(stop1?.getAttribute('stop-color')).toBe('#ff0000');
    expect(stop2?.getAttribute('stop-color')).toBe('#eeff50');
  });

  it('uses yellow-blue gradient when value is 50 or above', () => {
    const props: CircularProgressProps = {
      size: 100,
      strokeSize: 10,
      value: 75,
    };
    const cp = new CircularProgress({ props });

    cp._createRenderer();
    cp.render();

    const stop1 = cp.shadow?.querySelector('.stop1');
    const stop2 = cp.shadow?.querySelector('.stop2');
    expect(stop1?.getAttribute('stop-color')).toBe('#eeff50');
    expect(stop2?.getAttribute('stop-color')).toBe('#9198e5');
  });
});

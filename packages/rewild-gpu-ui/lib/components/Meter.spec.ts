import { packColor, parseColor } from '../color';
import { UISurface } from '../UISurface';
import { Meter } from './Meter';

describe('Meter', () => {
  it('draws with the meter effect and a dark border', () => {
    const meter = new Meter();
    expect(meter.node.effect).toBe('meter');
    expect(meter.node.style.borderWidth).toBe(1);
    expect(meter.node.style.borderColor).toBe('#1a1a1a');
  });

  it('puts the value and packed colours in the effect params', () => {
    const meter = new Meter({
      value: 0.5,
      fullColor: '#00ff00',
      emptyColor: '#ff0000',
    });
    expect(meter.node.effectParams).toEqual([
      0.5,
      packColor(parseColor('#00ff00')),
      packColor(parseColor('#ff0000')),
      0,
    ]);
  });

  it('clamps the value', () => {
    const meter = new Meter();
    meter.value = 2;
    expect(meter.value).toBe(1);
    meter.value = -1;
    expect(meter.value).toBe(0);
  });

  it('changes its value with no layout or rebuild', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const meter = new Meter({ style: { width: 100, height: 10 } });
    surface.root.append(meter);
    surface.update(200, 100);
    meter.value = 0.3;
    expect(surface.needsLayout).toBe(false);
    expect(surface.needsPaint).toBe(false);
    expect(surface.stream.data[28]).toBeCloseTo(0.3);
  });
});

import { packColor, parseColor } from '../color';
import { UISurface } from '../UISurface';
import { Gauge } from './Gauge';

describe('Gauge', () => {
  it('draws with the gauge effect, its marker in the middle', () => {
    const gauge = new Gauge();
    expect(gauge.node.effect).toBe('gauge');
    expect(gauge.value).toBe(0.5);
    expect(gauge.node.effectParams[0]).toBe(0.5);
  });

  it('puts the value and its three packed colours in the effect params', () => {
    const gauge = new Gauge({
      value: 0.2,
      startColor: '#0000ff',
      middleColor: '#ffffff',
      endColor: '#ff0000',
    });
    expect(gauge.node.effectParams).toEqual([
      0.2,
      packColor(parseColor('#0000ff')),
      packColor(parseColor('#ffffff')),
      packColor(parseColor('#ff0000')),
    ]);
  });

  it('clamps the value', () => {
    const gauge = new Gauge();
    gauge.value = 3;
    expect(gauge.value).toBe(1);
    gauge.value = -3;
    expect(gauge.value).toBe(0);
  });

  it('moves its marker with no layout or rebuild', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const gauge = new Gauge({ style: { width: 8, height: 100 } });
    surface.root.append(gauge);
    surface.update(200, 200);
    gauge.value = 0.9;
    expect(surface.needsLayout).toBe(false);
    expect(surface.needsPaint).toBe(false);
  });
});

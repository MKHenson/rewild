import { packColor, parseColor } from '../color';
import { UISurface } from '../UISurface';
import { Meter, METER_TRAIL_HOLD } from './Meter';

function unpackExtras(meter: Meter) {
  const extras = meter.node.effectParams[3];
  return {
    trail: (extras % 4096) / 4095,
    ticks: Math.floor(extras / 4096) % 32,
    danger: Math.floor(extras / 131072) / 100,
  };
}

describe('Meter', () => {
  it('draws with the meter effect, a soft border and room for its glow', () => {
    const meter = new Meter();
    expect(meter.node.effect).toBe('meter');
    expect(meter.node.style.borderWidth).toBe(1);
    expect(meter.node.style.borderColor).toBe('#0000004d');
    expect(meter.node.effectOutset).toBeGreaterThan(0);
  });

  it('puts the value and packed colours in the effect params', () => {
    const meter = new Meter({
      value: 0.5,
      fullColor: '#00ff00',
      emptyColor: '#ff0000',
    });
    const [value, full, empty] = meter.node.effectParams;
    expect(value).toBe(0.5);
    expect(full).toBe(packColor(parseColor('#00ff00')));
    expect(empty).toBe(packColor(parseColor('#ff0000')));
    expect(unpackExtras(meter).trail).toBeCloseTo(0.5, 3);
  });

  it('packs the ticks and the danger', () => {
    const meter = new Meter({ value: 0.2, ticks: 10, danger: 0.25 });
    expect(unpackExtras(meter)).toEqual({
      trail: expect.closeTo(0.2, 3),
      ticks: 10,
      danger: 0.25,
    });
  });

  it('clamps the value', () => {
    const meter = new Meter();
    meter.value = 2;
    expect(meter.value).toBe(1);
    meter.value = -1;
    expect(meter.value).toBe(0);
  });

  it('keeps its trail on its value with no trail option', () => {
    const meter = new Meter();
    meter.value = 0.4;
    expect(meter.trail).toBe(0.4);
  });

  it('holds the trail after a drop, then catches up', () => {
    const meter = new Meter({ trail: true });
    meter.value = 0.6;
    expect(meter.trail).toBe(1);
    meter.update(METER_TRAIL_HOLD * 0.9);
    expect(meter.trail).toBe(1);
    meter.update(METER_TRAIL_HOLD * 0.2);
    meter.update(0.1);
    expect(meter.trail).toBeLessThan(1);
    expect(meter.trail).toBeGreaterThan(0.6);
    for (let i = 0; i < 120; i++) meter.update(1 / 60);
    expect(meter.trail).toBe(0.6);
    expect(unpackExtras(meter).trail).toBeCloseTo(0.6, 3);
  });

  it('trails a gain from below', () => {
    const meter = new Meter({ trail: true, value: 0.2 });
    meter.value = 0.8;
    expect(meter.trail).toBe(0.2);
    for (let i = 0; i < 180; i++) meter.update(1 / 60);
    expect(meter.trail).toBe(0.8);
  });

  it('does not restart the hold for a slow drain', () => {
    const meter = new Meter({ trail: true });
    for (let i = 0; i < 120; i++) {
      meter.value -= 0.001;
      meter.update(1 / 60);
    }
    expect(meter.trail - meter.value).toBeLessThan(0.01);
  });

  it('snaps with no trail', () => {
    const meter = new Meter({ trail: true, value: 0 });
    meter.snap(1);
    expect(meter.value).toBe(1);
    expect(meter.trail).toBe(1);
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

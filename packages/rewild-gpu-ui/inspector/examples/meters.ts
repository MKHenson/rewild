import { Button, Gauge, glassSurface, Icon, Meter, UINode } from '../../lib';
import { example } from '../registry';

const part = 'Meters';

const column = () =>
  new UINode({
    style: { flexDirection: 'column', gap: 12, padding: 16, width: '100%' },
  });

/** Runs `update` on each meter with the seconds since the last frame. */
function trailer(meters: Meter[]): (seconds: number) => void {
  let last = -1;
  return (seconds) => {
    const delta = last < 0 ? 0 : seconds - last;
    last = seconds;
    for (const meter of meters) meter.update(delta);
  };
}

example({
  part,
  name: 'Values and colours',
  description:
    'Meters at 1, 0.6, 0.3 and 0, with their own colours, a rounded fill and a gloss. They draw with the meter effect, so the DOM side shows only their boxes.',
  build: ({ surface }) => {
    const meters = column();
    meters.append(
      new Meter({ value: 1, style: { height: 24, borderRadius: 12 } }),
      new Meter({
        value: 0.6,
        fullColor: '#f2991a',
        emptyColor: '#8c3300',
        style: { height: 16, borderRadius: 8 },
      }),
      new Meter({
        value: 0.3,
        fullColor: '#73ccff',
        emptyColor: '#334d8c',
        style: { height: 8, borderRadius: 4 },
      }),
      new Meter({
        value: 0.04,
        fullColor: '#ebf5ff',
        emptyColor: '#8c1a73',
        style: { height: 8, borderRadius: 4 },
      })
    );
    surface.root.append(meters);
  },
});

example({
  part,
  name: 'Ticks and danger',
  description:
    'Ten ticks on each. Below a danger of 0.3 a meter beats with a heartbeat and glows, faster as it drains. The top one is above its danger, so it is still.',
  build: ({ surface }) => {
    const meters = column();
    for (const value of [0.6, 0.25, 0.08])
      meters.append(
        new Meter({
          value,
          ticks: 10,
          danger: 0.3,
          style: { height: 14, borderRadius: 7 },
        })
      );
    surface.root.append(meters);
    return () => {};
  },
});

example({
  part,
  name: 'Trail',
  description:
    'Hit takes 0.2 and Heal gives 0.3. A loss shows as a pale band and a gain as a bright one with a shine, until the fill catches up.',
  log: true,
  build: ({ surface, log }) => {
    const meter = new Meter({
      value: 0.8,
      trail: true,
      ticks: 10,
      danger: 0.25,
      style: { height: 16, borderRadius: 8 },
    });
    const buttons = new UINode({ style: { gap: 8 } });
    buttons.append(
      new Button({
        label: 'Hit',
        color: 'error',
        onClick: () => {
          meter.value -= 0.2;
          log(`hit: ${meter.value.toFixed(2)}`);
        },
      }),
      new Button({
        label: 'Heal',
        onClick: () => {
          meter.value += 0.3;
          log(`heal: ${meter.value.toFixed(2)}`);
        },
      }),
      new Button({
        label: 'Snap to full',
        variant: 'text',
        onClick: () => meter.snap(1),
      })
    );
    const content = column();
    content.append(meter, buttons);
    surface.root.append(content);
    return trailer([meter]);
  },
});

example({
  part,
  name: 'Draining',
  description:
    'A meter with a trail that drains and fills again. Only its params change, so the stream is not rebuilt.',
  height: 80,
  build: ({ surface }) => {
    const meter = new Meter({
      trail: true,
      style: {
        position: 'absolute',
        left: '10%',
        width: '80%',
        top: 28,
        height: 20,
        borderRadius: 10,
      },
    });
    surface.root.append(meter);
    const trail = trailer([meter]);
    return (seconds) => {
      meter.value = 0.5 + 0.5 * Math.cos(seconds * 0.8);
      trail(seconds);
    };
  },
});

example({
  part,
  name: 'Gauge',
  description:
    'A gauge from cold to hot, upright and across. The marker sweeps from end to end, and the end it nears glows.',
  height: 200,
  build: ({ surface }) => {
    const upright = new Gauge({ style: { width: 8, height: 160, borderRadius: 4 } });
    const across = new Gauge({ style: { width: 240, height: 8, borderRadius: 4 } });
    const row = new UINode({
      style: { gap: 32, padding: 16, alignItems: 'center' },
    });
    row.append(upright, across);
    surface.root.append(row);
    return (seconds) => {
      const value = 0.5 + 0.5 * Math.sin(seconds * 0.6);
      upright.value = value;
      across.value = 1 - value;
    };
  },
});

example({
  part,
  name: 'On a glass plate',
  description:
    'Meters with icons on a glass plate, as the game HUD shows them. Hit and Heal change health. The icons need the icon atlas with heart, utensils, zap and wind.',
  backdrop: true,
  height: 220,
  build: ({ surface }) => {
    const bar = (
      icon: 'heart' | 'utensils' | 'zap' | 'wind',
      height: number,
      fullColor: `#${string}`,
      emptyColor: `#${string}`,
      value: number
    ) => {
      const meter = new Meter({
        value,
        fullColor,
        emptyColor,
        trail: true,
        danger: 0.25,
        ticks: icon === 'heart' ? 10 : 0,
        style: { flexGrow: 1, height, borderRadius: height / 2 },
      });
      const slot = new UINode({
        style: { width: 16, justifyContent: 'center', alignItems: 'center' },
      });
      slot.append(new Icon({ icon, size: height > 8 ? 16 : 12, color: fullColor }));
      const row = new UINode({ style: { alignItems: 'center', gap: 10 } });
      row.append(slot, meter);
      return { row, meter };
    };
    const oxygen = bar('wind', 5, '#ebf5ff', '#8c1a73', 0.7);
    const stamina = bar('zap', 5, '#73ccff', '#334d8c', 0.45);
    const hunger = bar('utensils', 8, '#f2a03a', '#8c3300', 0.6);
    const health = bar('heart', 12, '#5fd84a', '#e5352b', 0.9);
    const plate = new UINode({
      style: {
        ...glassSurface(0.45),
        flexDirection: 'column',
        width: 360,
        gap: 7,
        padding: [10, 14, 10, 12],
        borderWidth: 1,
        borderColor: 'glassEdge',
        borderRadius: 14,
        boxShadow: [{ y: 8, blur: 24, color: '#00000040' }],
      },
    });
    plate.append(oxygen.row, stamina.row, hunger.row, health.row);
    const buttons = new UINode({ style: { gap: 8 } });
    buttons.append(
      new Button({
        label: 'Hit',
        color: 'error',
        onClick: () => (health.meter.value -= 0.2),
      }),
      new Button({ label: 'Heal', onClick: () => (health.meter.value += 0.3) })
    );
    const content = new UINode({
      style: { flexDirection: 'column', gap: 16, padding: 16, alignItems: 'center', width: '100%' },
    });
    content.append(plate, buttons);
    surface.root.append(content);
    return trailer([oxygen.meter, stamina.meter, hunger.meter, health.meter]);
  },
});
